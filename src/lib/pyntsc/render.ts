/**
 * Drives a whole clip through the Python signal chain.
 */

import { pyNtsc } from './client';
import { createEncoder, hasWebCodecs } from './encode';
import type { NtscParams } from './params';

export interface RenderOptions {
  /** Height the signal is processed at. Everything scales from this. */
  height: number;
  fps: number;
  /** Hard cap so a long upload cannot start an hour-long render by accident. */
  maxSeconds: number;
}

export const RENDER_HEIGHTS = [120, 180, 240, 360, 480] as const;
export const RENDER_FPS = [8, 10, 12, 15, 24, 30] as const;

export interface RenderProgress {
  frame: number;
  totalFrames: number;
  /** Rolling estimate, in seconds. */
  etaSeconds: number;
  /** The frame just produced, for a live preview. */
  preview?: ImageData;
}

/** Where the time actually went, so a slow render can be diagnosed rather
 *  than guessed at. */
export interface RenderTimings {
  decode: number;
  python: number;
  encode: number;
}

export interface RenderResult {
  blob: Blob;
  width: number;
  height: number;
  frames: number;
  encoder: 'webcodecs' | 'mediarecorder';
  seconds: number;
  timings: RenderTimings;
  /** How frames were pulled out of the source. */
  extraction: 'playback' | 'seek';
}

/* `requestVideoFrameCallback` is not in TypeScript's DOM lib yet. */
interface FrameMeta {
  mediaTime: number;
}
type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: FrameMeta) => void) => number;
};

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error('seek failed')); };
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = time;
  });
}

export async function loadVideo(file: Blob): Promise<{ video: HTMLVideoElement; revoke: () => void }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('that video would not decode — try MP4 or WebM'));
  });
  // Chrome will not paint a frame until it has decoded one.
  await seek(video, 0);

  return { video, revoke: () => URL.revokeObjectURL(url) };
}

/** Output dimensions for a given processing height. Kept even for the encoder. */
export function outputSize(video: HTMLVideoElement, height: number): { width: number; height: number } {
  const aspect = video.videoWidth / video.videoHeight || 4 / 3;
  const h = Math.round(height / 2) * 2;
  const w = Math.round((h * aspect) / 2) * 2;
  return { width: Math.max(2, w), height: Math.max(2, h) };
}

/* ---------------------------------------------------------------- sources */

/**
 * Pulls frames out of a video by playing it through once.
 *
 * Seeking to each timestamp in turn is the obvious approach and a trap on real
 * footage: a phone camera file is long-GOP HEVC, so every seek throws the
 * decoder back to the nearest keyframe and re-decodes forward to the target.
 * At ten frames a second that cost dwarfs the signal processing itself.
 *
 * Playing the clip decodes each frame exactly once. The consumer is slower
 * than real time, so it applies backpressure: once the queue fills, playback
 * pauses until it drains again.
 */
class FramePump {
  private queue: ImageData[] = [];
  private waiter: (() => void) | null = null;
  private done = false;
  private failure: Error | null = null;
  private target = 0;
  private last: ImageData | null = null;
  private paused = false;
  private scheduled = false;

  constructor(
    private readonly video: VideoWithRVFC,
    private readonly ctx: CanvasRenderingContext2D,
    private readonly size: { width: number; height: number },
    private readonly fps: number,
    private readonly totalFrames: number,
    private readonly maxQueue = 24,
  ) {}

  async start(): Promise<void> {
    this.video.addEventListener('ended', this.onEnded);
    await seek(this.video, 0);
    this.schedule();
    await this.video.play();
  }

  private schedule(): void {
    if (this.done || this.scheduled || this.paused) return;
    this.scheduled = true;
    this.video.requestVideoFrameCallback!((now, meta) => {
      this.scheduled = false;
      this.onFrame(now, meta);
    });
  }

  private onFrame = (_now: number, meta: FrameMeta): void => {
    if (this.done) return;
    try {
      this.ctx.drawImage(this.video, 0, 0, this.size.width, this.size.height);
      const image = this.ctx.getImageData(0, 0, this.size.width, this.size.height);
      this.last = image;

      // Emit every target timestamp this presented frame covers. A source
      // slower than the requested rate duplicates frames, which is correct —
      // nothing downstream mutates the ImageData, so sharing it is safe.
      while (this.target < this.totalFrames && this.target / this.fps <= meta.mediaTime + 1e-6) {
        this.queue.push(image);
        this.target += 1;
      }
    } catch (err) {
      this.failure = err instanceof Error ? err : new Error(String(err));
      this.finish();
      return;
    }

    if (this.target >= this.totalFrames) {
      this.finish();
      return;
    }
    if (this.queue.length >= this.maxQueue) {
      this.paused = true;
      this.video.pause();
    } else {
      this.schedule();
    }
    this.notify();
  };

  private onEnded = (): void => {
    // Playback can end a hair before the last requested timestamp. Pad with
    // the final frame rather than truncating the clip.
    if (this.last) {
      while (this.target < this.totalFrames) {
        this.queue.push(this.last);
        this.target += 1;
      }
    }
    this.finish();
  };

  private finish(): void {
    this.done = true;
    this.notify();
  }

  private notify(): void {
    const w = this.waiter;
    this.waiter = null;
    w?.();
  }

  /** Next frame, or null once the clip is exhausted. */
  async next(): Promise<ImageData | null> {
    while (this.queue.length === 0) {
      if (this.failure) throw this.failure;
      if (this.done) return null;

      await new Promise<void>((resolve, reject) => {
        // A decoder that stalls should surface as an error, not a hang.
        const timer = setTimeout(() => {
          this.waiter = null;
          reject(new Error('the video decoder stalled'));
        }, 20_000);
        this.waiter = () => { clearTimeout(timer); resolve(); };
      });
    }

    const image = this.queue.shift()!;
    // Room in the queue again: let playback continue.
    if (this.paused && this.queue.length <= this.maxQueue / 2 && !this.done) {
      this.paused = false;
      this.video.play().catch(() => undefined);
      this.schedule();
    }
    return image;
  }

  close(): void {
    this.done = true;
    this.video.removeEventListener('ended', this.onEnded);
    this.video.pause();
  }
}

/** Seek-per-frame source, for browsers without requestVideoFrameCallback. */
class SeekSource {
  private index = 0;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly ctx: CanvasRenderingContext2D,
    private readonly size: { width: number; height: number },
    private readonly fps: number,
    private readonly totalFrames: number,
  ) {}

  async start(): Promise<void> {}

  async next(): Promise<ImageData | null> {
    if (this.index >= this.totalFrames) return null;
    await seek(this.video, this.index / this.fps);
    this.ctx.drawImage(this.video, 0, 0, this.size.width, this.size.height);
    this.index += 1;
    return this.ctx.getImageData(0, 0, this.size.width, this.size.height);
  }

  close(): void {}
}

/* ---------------------------------------------------------------- stills */

/** Decode one frame of the source, without touching Python. */
export async function grabFrame(
  video: HTMLVideoElement,
  time: number,
  height: number,
): Promise<ImageData> {
  const size = outputSize(video, height);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  await seek(video, Math.min(time, Math.max(0, (video.duration || 1) - 0.05)));
  ctx.drawImage(video, 0, 0, size.width, size.height);
  return ctx.getImageData(0, 0, size.width, size.height);
}

/** One already-decoded frame through the Python chain. */
export async function processFrame(
  image: ImageData,
  params: NtscParams,
  fieldno = 0,
): Promise<ImageData> {
  await pyNtsc.configure(params);
  const out = await pyNtsc.frame(image.data, image.width, image.height, fieldno);
  return new ImageData(out, image.width, image.height);
}

/** Decode and process in one go. */
export async function renderStill(
  video: HTMLVideoElement,
  time: number,
  params: NtscParams,
  height: number,
  fieldno = 0,
): Promise<ImageData> {
  return processFrame(await grabFrame(video, time, height), params, fieldno);
}

/** A still image through the same Python chain, for the photo composer. */
export async function processImageData(
  image: ImageData,
  params: NtscParams,
  fieldno = 0,
): Promise<ImageData> {
  return processFrame(image, params, fieldno);
}

/* ---------------------------------------------------------------- render */

export async function renderVideo(
  file: Blob,
  params: NtscParams,
  opts: RenderOptions,
  onProgress?: (p: RenderProgress) => void,
  signal?: { cancelled: boolean },
): Promise<RenderResult> {
  const { video, revoke } = await loadVideo(file);

  try {
    const size = outputSize(video, opts.height);
    const duration = Math.min(video.duration || 0, opts.maxSeconds);
    const totalFrames = Math.max(1, Math.floor(duration * opts.fps));

    const src = document.createElement('canvas');
    src.width = size.width;
    src.height = size.height;
    const srcCtx = src.getContext('2d', { willReadFrequently: true })!;

    const out = document.createElement('canvas');
    out.width = size.width;
    out.height = size.height;
    const outCtx = out.getContext('2d')!;

    await pyNtsc.configure(params);

    // Bitrate low on purpose: macroblocking belongs in this picture.
    const bitrate = Math.round(size.width * size.height * opts.fps * 0.12);
    const encoder = await createEncoder(size.width, size.height, opts.fps, Math.max(150_000, bitrate));

    const canPlayThrough = typeof (video as VideoWithRVFC).requestVideoFrameCallback === 'function';
    const source = canPlayThrough
      ? new FramePump(video as VideoWithRVFC, srcCtx, size, opts.fps, totalFrames)
      : new SeekSource(video, srcCtx, size, opts.fps, totalFrames);

    const timings: RenderTimings = { decode: 0, python: 0, encode: 0 };
    const started = performance.now();
    let finished = false;
    let count = 0;

    try {
      const tStart = performance.now();
      await source.start();
      timings.decode += (performance.now() - tStart) / 1000;

      for (let i = 0; i < totalFrames; i++) {
        if (signal?.cancelled) throw new Error('render cancelled');

        const tDecode = performance.now();
        const input = await source.next();
        timings.decode += (performance.now() - tDecode) / 1000;
        if (!input) break;

        // fieldno advances two per frame so the subcarrier phase moves and the
        // dot crawl actually crawls instead of sitting still.
        const tPython = performance.now();
        const processed = await pyNtsc.frame(input.data, size.width, size.height, i * 2);
        timings.python += (performance.now() - tPython) / 1000;

        const image = new ImageData(processed, size.width, size.height);
        outCtx.putImageData(image, 0, 0);

        const tEncode = performance.now();
        await encoder.addFrame(out, i);
        timings.encode += (performance.now() - tEncode) / 1000;

        count = i + 1;
        const elapsed = (performance.now() - started) / 1000;
        onProgress?.({
          frame: count,
          totalFrames,
          etaSeconds: (elapsed / count) * (totalFrames - count),
          preview: image,
        });
      }

      // Flushing the encoder can take a while; count it as encoding so the
      // breakdown adds up to the total rather than hiding time.
      const tFlush = performance.now();
      const blob = await encoder.finish();
      timings.encode += (performance.now() - tFlush) / 1000;
      finished = true;
      return {
        blob,
        width: size.width,
        height: size.height,
        frames: count,
        encoder: encoder.kind,
        seconds: (performance.now() - started) / 1000,
        timings,
        extraction: canPlayThrough ? 'playback' : 'seek',
      };
    } finally {
      source.close();
      // An aborted render still has to release the encoder.
      if (!finished) await encoder.finish().catch(() => undefined);
    }
  } finally {
    revoke();
  }
}

export { hasWebCodecs };
