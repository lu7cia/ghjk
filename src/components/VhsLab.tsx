import { useCallback, useEffect, useRef, useState } from 'react';
import { Panel, FileButton, StatusBar, Stepper, Readout } from './ui';
import { ParamRack } from './ParamRack';
import { pyNtsc } from '../lib/pyntsc/client';
import {
  PARAM_GROUPS, PARAM_PRESETS, PARAM_PRESET_NAMES, UPSTREAM_DEFAULTS,
  type NtscParams,
} from '../lib/pyntsc/params';
import {
  loadVideo, outputSize, renderStill, renderVideo, hasWebCodecs,
  RENDER_HEIGHTS, RENDER_FPS, type RenderProgress,
} from '../lib/pyntsc/render';
import { putAsset, uid } from '../lib/db';
import type { Post } from '../lib/types';

const MAX_SECONDS = [3, 5, 10, 15, 30, 60] as const;

function secs(n: number): string {
  if (!isFinite(n) || n < 0) return '--:--';
  const m = Math.floor(n / 60);
  const s = Math.round(n % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * The video tools.
 *
 * Every frame you see here — the preview and the render alike — has been
 * through the upstream Python emulator. There is no separate fast path that
 * would make the preview lie about the output.
 */
export function VhsLab({ authorId, onPost }: { authorId: string; onPost: (p: Post) => void }) {
  const [params, setParams] = useState<NtscParams>(PARAM_PRESETS['VHS EP']);
  const [presetId, setPresetId] = useState(PARAM_PRESET_NAMES.indexOf('VHS EP'));
  // Every preset here keeps upstream's ringing filter on, and that alone is a
  // real 2D FFT per field — genuinely heavy on a phone's CPU. Default to the
  // lightest processing settings so the first thing anyone sees is a snappy
  // preview, not a frozen-looking screen; bump these up once you've settled
  // on a look and are ready to render for real.
  const [heightId, setHeightId] = useState(0);   // 120
  const [fpsId, setFpsId] = useState(1);         // 10
  const [maxSecId, setMaxSecId] = useState(1);   // 5

  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState(0);
  const [scrub, setScrub] = useState(0);

  const [booting, setBooting] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  // A live "how long has this been going" readout, so a slow phone never
  // looks frozen — a real FFT-based filter on a weak CPU can genuinely take
  // several seconds for one frame.
  const [previewElapsed, setPreviewElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState('');

  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [result, setResult] = useState<{ blob: Blob; url: string; width: number; height: number; seconds: number } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const revokeRef = useRef<(() => void) | null>(null);
  const previewCanvas = useRef<HTMLCanvasElement>(null);
  const cancelRef = useRef({ cancelled: false });
  const previewSeq = useRef(0);

  /* Pyodide boot progress, surfaced so the first-run download is not a mystery. */
  useEffect(() => pyNtsc.onProgress((p) => {
    const text: Record<string, string> = {
      runtime: 'downloading python runtime',
      packages: 'downloading numpy / scipy / opencv',
      source: 'loading ntsc.py',
      import: 'starting interpreter',
      ready: '',
    };
    setBooting(text[p.stage] ?? p.stage);
  }), []);

  useEffect(() => () => {
    revokeRef.current?.();
    if (result) URL.revokeObjectURL(result.url);
  }, [result]);

  const drawPreview = useCallback((image: ImageData) => {
    const canvas = previewCanvas.current;
    if (!canvas) return;
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d')!.putImageData(image, 0, 0);
  }, []);

  /* Re-render the still whenever the tuning changes. Debounced, and stamped
     with a sequence number so a slow frame cannot overwrite a newer one. */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || rendering) return;

    const seq = ++previewSeq.current;
    const timer = setTimeout(async () => {
      setPreviewBusy(true);
      setPreviewElapsed(0);
      setError(null);
      const startedAt = performance.now();
      const ticker = setInterval(() => setPreviewElapsed((performance.now() - startedAt) / 1000), 200);
      try {
        const image = await renderStill(video, scrub, params, RENDER_HEIGHTS[heightId]);
        if (seq === previewSeq.current) drawPreview(image);
      } catch (err) {
        if (seq === previewSeq.current) {
          setError(err instanceof Error ? err.message : 'preview failed');
        }
      } finally {
        clearInterval(ticker);
        if (seq === previewSeq.current) {
          setPreviewBusy(false);
          setBooting(null);
        }
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [params, scrub, heightId, rendering, drawPreview]);

  const chooseFile = async (f: File) => {
    setError(null);
    setResult(null);
    revokeRef.current?.();
    try {
      const { video, revoke } = await loadVideo(f);
      videoRef.current = video;
      revokeRef.current = revoke;
      setFile(f);
      setDuration(video.duration || 0);
      setScrub(Math.min(0.5, (video.duration || 1) / 3));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not load that video');
    }
  };

  const applyPreset = (id: number) => {
    setPresetId(id);
    setParams(PARAM_PRESETS[PARAM_PRESET_NAMES[id]]);
  };

  const randomize = async () => {
    setError(null);
    try {
      setParams(await pyNtsc.randomize(Math.floor(Math.random() * 1e9)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'randomize failed');
    }
  };

  const patch = (p: Partial<NtscParams>) => setParams((prev) => ({ ...prev, ...p }));

  const render = async () => {
    if (!file) return;
    setRendering(true);
    setError(null);
    setResult(null);
    cancelRef.current = { cancelled: false };
    try {
      const res = await renderVideo(
        file, params,
        { height: RENDER_HEIGHTS[heightId], fps: RENDER_FPS[fpsId], maxSeconds: MAX_SECONDS[maxSecId] },
        (p) => { setProgress(p); if (p.preview) drawPreview(p.preview); },
        cancelRef.current,
      );
      setResult({
        blob: res.blob, url: URL.createObjectURL(res.blob),
        width: res.width, height: res.height, seconds: res.seconds,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'render failed');
    } finally {
      setRendering(false);
      setProgress(null);
    }
  };

  const post = async () => {
    if (!result) return;
    const mediaAsset = await putAsset(result.blob, 'video', file?.name ?? 'tape.webm');
    onPost({
      id: uid('p_'), authorId, createdAt: Date.now(), caption,
      kind: 'video', mediaAsset, originalAsset: null,
      width: result.width, height: result.height,
    });
    URL.revokeObjectURL(result.url);
    setResult(null);
    setCaption('');
  };

  const frameEstimate = file
    ? Math.floor(Math.min(duration, MAX_SECONDS[maxSecId]) * RENDER_FPS[fpsId])
    : 0;

  return (
    <div className="vhs-lab">
      {/* ------------------------------------------------------- monitor */}
      <div className="stack" style={{ minWidth: 0 }}>
        <Panel
          title="monitor"
          right={
            <span className="dim" style={{ fontSize: 11 }}>
              {previewBusy ? 'PROCESSING' : booting ? 'BOOTING' : 'IDLE'}
            </span>
          }
          bodyStyle={{ padding: 8 }}
        >
          <div className="crt vhs-lab__monitor" style={{ aspectRatio: '4/3', position: 'relative' }}>
            <canvas
              ref={previewCanvas}
              style={{
                width: '100%', height: '100%', objectFit: 'contain',
                display: 'block', imageRendering: 'pixelated',
              }}
            />
            <div className="noise-veil" />
            {!file && (
              <div
                className="center"
                style={{ position: 'absolute', inset: 0, zIndex: 7, flexDirection: 'column', gap: 8 }}
              >
                <span className="gothic" style={{ fontSize: 26 }}>no tape</span>
                <span className="dim" style={{ fontSize: 11 }}>LOAD A VIDEO TO BEGIN</span>
              </div>
            )}
            {(booting || previewBusy) && file && (
              <div
                style={{
                  position: 'absolute', left: 8, top: 6, zIndex: 8,
                  fontSize: 11, pointerEvents: 'none',
                }}
                className="glow"
              >
                <span className="blink">●</span> {booting || `processing frame — ${previewElapsed.toFixed(1)}s`}
              </div>
            )}
          </div>

          {file && (
            <div style={{ marginTop: 8 }}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 2 }}>
                <span className="stepper__name">Scrub</span>
                <span className="glow" style={{ fontSize: 12 }}>{scrub.toFixed(2)}s / {duration.toFixed(1)}s</span>
              </div>
              <input
                type="range" min={0} max={Math.max(0.1, duration - 0.05)} step={0.05}
                value={scrub} onChange={(e) => setScrub(parseFloat(e.target.value))}
                disabled={rendering}
                aria-label="scrub"
              />
            </div>
          )}
        </Panel>

        <Panel title="tape deck" riveted>
          <div className="row row--wrap" style={{ gap: 6, marginBottom: 9 }}>
            <FileButton accept="video/*" className="btn btn--primary" onFile={(f) => chooseFile(f[0])}>
              {file ? 'CHANGE TAPE' : 'LOAD TAPE'}
            </FileButton>
            <button className="btn" onClick={randomize} disabled={rendering}>RANDOMIZE</button>
            <button
              className="btn"
              onClick={() => setParams(UPSTREAM_DEFAULTS)}
              disabled={rendering}
            >
              DEFAULTS
            </button>
          </div>
          {file && <div className="dim" style={{ fontSize: 11, marginBottom: 8 }}>{file.name}</div>}

          <Stepper name="Preset" value={presetId} options={PARAM_PRESET_NAMES} onChange={applyPreset} />
          <hr className="hr" />
          <Stepper
            name="Height"
            value={heightId}
            options={RENDER_HEIGHTS.map((h) => `${h}p`)}
            onChange={setHeightId}
          />
          <Stepper
            name="Frame rate"
            value={fpsId}
            options={RENDER_FPS.map((f) => `${f} fps`)}
            onChange={setFpsId}
          />
          <Stepper
            name="Length cap"
            value={maxSecId}
            options={MAX_SECONDS.map((s) => `${s}s`)}
            onChange={setMaxSecId}
          />

          {file && (
            <div style={{ marginTop: 9 }}>
              <Readout label="FRAMES TO RENDER" value={String(frameEstimate)} />
              <Readout
                label="OUTPUT"
                value={videoRef.current
                  ? `${outputSize(videoRef.current, RENDER_HEIGHTS[heightId]).width}×${RENDER_HEIGHTS[heightId]}`
                  : '—'}
                accent="mg"
              />
              <Readout label="ENCODER" value={hasWebCodecs() ? 'WEBCODECS' : 'MEDIARECORDER'} accent="am" />
            </div>
          )}
        </Panel>

        {error && <StatusBar tone="err">{error}</StatusBar>}

        {rendering && progress && (
          <Panel title="rendering" riveted>
            <div className="lcd lcd--big" style={{ textAlign: 'center', marginBottom: 8 }}>
              {String(progress.frame).padStart(4, '0')} / {String(progress.totalFrames).padStart(4, '0')}
            </div>
            <div style={{ height: 12, background: '#020402', border: '1px solid #050705', boxShadow: 'var(--bevel-in)' }}>
              <div
                style={{
                  height: '100%',
                  width: `${(progress.frame / progress.totalFrames) * 100}%`,
                  background: 'repeating-linear-gradient(90deg,#55ff62 0 3px,#1a7a24 3px 5px)',
                  boxShadow: '0 0 10px rgba(85,255,98,.6)',
                }}
              />
            </div>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
              <span className="dim" style={{ fontSize: 11 }}>REMAINING {secs(progress.etaSeconds)}</span>
              <button
                className="btn btn--sm btn--danger"
                onClick={() => { cancelRef.current.cancelled = true; }}
              >
                ABORT
              </button>
            </div>
          </Panel>
        )}

        {result && (
          <Panel title="finished tape" riveted>
            <div className="crt" style={{ marginBottom: 8 }}>
              <video src={result.url} controls loop playsInline
                style={{ width: '100%', display: 'block', imageRendering: 'pixelated' }} />
            </div>
            <Readout label="SIZE" value={`${result.width}×${result.height}`} />
            <Readout label="FILE" value={`${Math.round(result.blob.size / 1024)} KB`} accent="mg" />
            <Readout label="RENDER TIME" value={secs(result.seconds)} accent="am" />
            <div className="field" style={{ marginTop: 9 }}>
              <label>Caption</label>
              <textarea value={caption} onChange={(e) => setCaption(e.target.value)} style={{ minHeight: 52 }} />
            </div>
            <button className="btn btn--primary" style={{ width: '100%' }} onClick={post}>
              POST TO PAGE
            </button>
          </Panel>
        )}

        {!rendering && !result && (
          <button
            className="btn btn--primary"
            style={{ width: '100%', fontSize: 18, padding: '10px' }}
            disabled={!file || previewBusy}
            onClick={render}
          >
            RENDER {frameEstimate ? `${frameEstimate} FRAMES` : 'TAPE'}
          </button>
        )}
      </div>

      {/* ------------------------------------------------------ parameters */}
      <div className="stack scroll vhs-lab__racks">
        <Panel title="signal path" riveted bodyStyle={{ padding: 9 }}>
          <p className="dim" style={{ fontSize: 11, margin: 0, lineHeight: 1.6 }}>
            These are the real parameters on the upstream <code>Ntsc</code> class, running under
            Python in your browser. RANDOMIZE calls upstream&apos;s own <code>random_ntsc()</code>.
          </p>
        </Panel>
        {PARAM_GROUPS.map((g, i) => (
          <ParamRack
            key={g.name}
            group={g}
            params={params}
            onChange={patch}
            defaultOpen={i < 2}
          />
        ))}
      </div>
    </div>
  );
}
