/// <reference lib="webworker" />
/**
 * Runs the upstream Python NTSC emulator inside Pyodide, off the main thread.
 *
 * The frames are handed over as transferable ArrayBuffers so nothing large is
 * cloned on the way in or out. Python is genuinely doing the signal work here —
 * this file only moves bytes and forwards settings.
 */

interface PyodideAPI {
  loadPackage(names: string[], opts?: unknown): Promise<void>;
  runPython(code: string): unknown;
  FS: { writeFile(path: string, data: Uint8Array | string): void; mkdirTree(path: string): void };
  globals: { set(name: string, value: unknown): void; get(name: string): unknown };
  pyimport(name: string): Record<string, (...args: unknown[]) => unknown>;
}

/** Pinned so the runtime and the wheels always come from the same build. */
export const PYODIDE_VERSION = '314.0.6';
const CDN_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

/** Where the runtime and wheels are fetched from. Overridable so the whole
 *  thing can be self-hosted for offline use — see README. */
let pyodideBase = CDN_BASE;

let driver: Record<string, (...args: unknown[]) => unknown> | null = null;

type Req =
  | { id: number; type: 'init'; baseUrl: string; pyodideBase?: string }
  | { id: number; type: 'configure'; settings: string }
  | { id: number; type: 'randomize'; seed: number }
  | { id: number; type: 'defaults' }
  | { id: number; type: 'frame'; buffer: ArrayBuffer; width: number; height: number; fieldno: number };

function post(msg: Record<string, unknown>, transfer: Transferable[] = []): void {
  (self as unknown as Worker).postMessage(msg, transfer);
}

function progress(stage: string, detail = ''): void {
  post({ type: 'progress', stage, detail });
}

async function init(baseUrl: string, base?: string): Promise<{ version: string }> {
  if (base) pyodideBase = base;

  progress('runtime', 'fetching python runtime');

  // Kept out of Vite's static analysis: this URL is resolved at runtime, and
  // bundling the Pyodide loader would break its sibling .wasm lookups.
  const mod = (await import(/* @vite-ignore */ `${pyodideBase}pyodide.mjs`)) as {
    loadPyodide(opts: { indexURL: string }): Promise<PyodideAPI>;
  };
  const py = await mod.loadPyodide({ indexURL: pyodideBase });

  progress('packages', 'numpy, scipy, opencv');
  await py.loadPackage(['numpy', 'scipy', 'opencv-python']);

  progress('source', 'loading ntsc.py');
  const files = ['ntsc.py', 'driver.py', 'ringPattern.npy'];
  const fetched = await Promise.all(
    files.map(async (name) => {
      const res = await fetch(`${baseUrl}${name}`);
      if (!res.ok) throw new Error(`could not load ${name}: HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    }),
  );

  py.FS.mkdirTree('/pyntsc');
  files.forEach((name, i) => py.FS.writeFile(`/pyntsc/${name}`, fetched[i]));

  progress('import', 'importing');
  py.runPython(`
import sys, os
sys.path.insert(0, '/pyntsc')
os.chdir('/pyntsc')     # ntsc.py loads ringPattern.npy relative to cwd
import driver
`);

  driver = py.pyimport('driver');
  progress('ready');
  return { version: PYODIDE_VERSION };
}

self.onmessage = async (e: MessageEvent<Req>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'init': {
        const info = await init(msg.baseUrl, msg.pyodideBase);
        post({ id: msg.id, ok: true, result: info });
        break;
      }
      case 'configure': {
        const applied = driver!.configure(msg.settings) as string;
        post({ id: msg.id, ok: true, result: applied });
        break;
      }
      case 'randomize': {
        const applied = driver!.randomize(msg.seed) as string;
        post({ id: msg.id, ok: true, result: applied });
        break;
      }
      case 'defaults': {
        post({ id: msg.id, ok: true, result: driver!.upstream_defaults() as string });
        break;
      }
      case 'frame': {
        const bytes = new Uint8Array(msg.buffer);
        const result = driver!.process_frame(bytes, msg.width, msg.height, msg.fieldno) as
          | Uint8Array
          | { toJs(): Uint8Array; destroy(): void };

        // Python `bytes` may arrive as a proxy depending on the conversion path.
        let out: Uint8Array;
        if (result instanceof Uint8Array) {
          out = result;
        } else {
          out = result.toJs();
          result.destroy();
        }
        // Copy into a standalone buffer so it can be transferred cleanly.
        const copy = new Uint8Array(out.length);
        copy.set(out);
        post({ id: msg.id, ok: true, result: copy.buffer }, [copy.buffer]);
        break;
      }
    }
  } catch (err) {
    post({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};

export {};
