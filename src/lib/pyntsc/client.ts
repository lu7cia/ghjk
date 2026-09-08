/**
 * Main-thread handle on the Pyodide worker.
 *
 * The worker is started lazily — nothing downloads a Python runtime until
 * somebody actually opens the video tools.
 */

import type { NtscParams } from './params';

export interface PyNtscProgress {
  stage: string;
  detail?: string;
}

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

export class PyNtsc {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private readyPromise: Promise<void> | null = null;
  private listeners = new Set<(p: PyNtscProgress) => void>();

  onProgress(fn: (p: PyNtscProgress) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private send<T>(msg: Record<string, unknown>, transfer: Transferable[] = []): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker!.postMessage({ ...msg, id }, transfer);
    });
  }

  /** Boots Pyodide, downloads numpy/scipy/opencv, imports the upstream source. */
  ready(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = (async () => {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

      this.worker.onmessage = (e: MessageEvent) => {
        const d = e.data;
        if (d.type === 'progress') {
          this.listeners.forEach((fn) => fn({ stage: d.stage, detail: d.detail }));
          return;
        }
        const p = this.pending.get(d.id);
        if (!p) return;
        this.pending.delete(d.id);
        if (d.ok) p.resolve(d.result);
        else p.reject(new Error(d.error));
      };

      this.worker.onerror = (e) => {
        const err = new Error(e.message || 'the python worker failed to start');
        this.pending.forEach((p) => p.reject(err));
        this.pending.clear();
      };

      const base = new URL('pyntsc/', document.baseURI).href;
      // Self-hosting escape hatch: point this at a local copy of the Pyodide
      // distribution to run with no network at all.
      const override =
        (window as unknown as { __GHJK_PYODIDE_BASE__?: string }).__GHJK_PYODIDE_BASE__ ??
        (import.meta.env.VITE_PYODIDE_BASE as string | undefined);
      await this.send({ type: 'init', baseUrl: base, pyodideBase: override });
    })();

    return this.readyPromise;
  }

  async configure(params: NtscParams): Promise<NtscParams> {
    await this.ready();
    const json = await this.send<string>({ type: 'configure', settings: JSON.stringify(params) });
    return JSON.parse(json) as NtscParams;
  }

  /** Upstream's own random_ntsc(), which samples every parameter at once. */
  async randomize(seed: number): Promise<NtscParams> {
    await this.ready();
    const json = await this.send<string>({ type: 'randomize', seed });
    return JSON.parse(json) as NtscParams;
  }

  async defaults(): Promise<NtscParams> {
    await this.ready();
    return JSON.parse(await this.send<string>({ type: 'defaults' })) as NtscParams;
  }

  /** One RGBA frame through the signal chain. The input buffer is transferred. */
  async frame(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    fieldno: number,
  ): Promise<Uint8ClampedArray<ArrayBuffer>> {
    await this.ready();
    const copy = new Uint8Array(data.length);
    copy.set(data);
    const out = await this.send<ArrayBuffer>(
      { type: 'frame', buffer: copy.buffer, width, height, fieldno },
      [copy.buffer],
    );
    return new Uint8ClampedArray(out);
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.readyPromise = null;
    this.pending.clear();
  }
}

/** One shared instance: the runtime is heavy and there is no reason to have two. */
export const pyNtsc = new PyNtsc();
