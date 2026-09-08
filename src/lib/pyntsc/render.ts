/**
 * Drives a whole clip through the Python signal chain.
 *
 * Frames are pulled by seeking the source video rather than playing it, so the
 * render is decoupled from real time and every frame gets the same treatment
 * regardless of how long Python takes over it.
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

export interface RenderResult {
  blob: Blob;
  width: number;
  height: number;
  frames: number;
  encoder: 'webcodecs' | 'mediarecorder';
  seconds: number;
}

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

/** A single frame through Python, for the tuning preview. */
export async function renderStill(
  video: HTMLVideoElement,
  time: number,
  params: NtscParams,
  height: number,
  fieldno = 0,
): Promise<ImageData> {
  const size = outputSize(video, height);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  await seek(video, Math.min(time, Math.max(0, (video.duration || 1) - 0.05)));
  ctx.drawImage(video, 0, 0, size.width, size.height);

  const input = ctx.getImageData(0, 0, size.width, size.height);
  await pyNtsc.configure(params);
  const out = await pyNtsc.frame(input.data, size.width, size.height, fieldno);
  return new ImageData(out, size.width, size.height);
}

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
    const encoder = createEncoder(size.width, size.height, opts.fps, Math.max(150_000, bitrate));

    const started = performance.now();
    let finished = false;

    try {
      for (let i = 0; i < totalFrames; i++) {
        if (signal?.cancelled) throw new Error('render cancelled');

        await seek(video, i / opts.fps);
        srcCtx.drawImage(video, 0, 0, size.width, size.height);
        const input = srcCtx.getImageData(0, 0, size.width, size.height);

        // fieldno advances two per frame so the subcarrier phase moves and the
        // dot crawl actually crawls instead of sitting still.
        const processed = await pyNtsc.frame(input.data, size.width, size.height, i * 2);
        const image = new ImageData(processed, size.width, size.height);
        outCtx.putImageData(image, 0, 0);

        await encoder.addFrame(out, i);

        const elapsed = (performance.now() - started) / 1000;
        onProgress?.({
          frame: i + 1,
          totalFrames,
          etaSeconds: (elapsed / (i + 1)) * (totalFrames - i - 1),
          preview: image,
        });
      }

      const blob = await encoder.finish();
      finished = true;
      return {
        blob,
        width: size.width,
        height: size.height,
        frames: totalFrames,
        encoder: encoder.kind,
        seconds: (performance.now() - started) / 1000,
      };
    } finally {
      // An aborted render still has to release the encoder.
      if (!finished) await encoder.finish().catch(() => undefined);
    }
  } finally {
    revoke();
  }
}

export { hasWebCodecs };

/** A still image through the same Python chain, for the photo composer. */
export async function processImageData(
  image: ImageData,
  params: NtscParams,
  fieldno = 0,
): Promise<ImageData> {
  await pyNtsc.configure(params);
  const out = await pyNtsc.frame(image.data, image.width, image.height, fieldno);
  return new ImageData(out, image.width, image.height);
}
