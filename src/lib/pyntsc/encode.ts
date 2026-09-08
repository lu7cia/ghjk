/**
 * Frame-accurate video encoding.
 *
 * The Python signal chain runs far slower than real time, so frames cannot be
 * fed to a MediaRecorder as they are produced — a recorder timestamps by wall
 * clock and the result would play back in slow motion. WebCodecs lets each
 * frame carry an explicit timestamp instead, so a render that took four
 * minutes still plays at the right speed.
 *
 * Where WebCodecs is missing, frames are kept as compressed stills and replayed
 * in real time into a MediaRecorder, which is slower and lossier but works.
 */

import { Muxer, ArrayBufferTarget } from 'webm-muxer';

export function hasWebCodecs(): boolean {
  return typeof window !== 'undefined' && 'VideoEncoder' in window && 'VideoFrame' in window;
}

export interface Encoder {
  addFrame(canvas: HTMLCanvasElement, index: number): Promise<void>;
  finish(): Promise<Blob>;
  readonly kind: 'webcodecs' | 'mediarecorder';
}

/* ------------------------------------------------------------- webcodecs */

class WebCodecsEncoder implements Encoder {
  readonly kind = 'webcodecs' as const;
  private muxer: Muxer<ArrayBufferTarget>;
  private encoder: VideoEncoder;
  private frameDuration: number;
  private failure: Error | null = null;

  constructor(width: number, height: number, private fps: number, bitrate: number) {
    this.frameDuration = 1_000_000 / fps;

    this.muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'V_VP9', width, height, frameRate: fps },
      firstTimestampBehavior: 'offset',
    });

    this.encoder = new VideoEncoder({
      output: (chunk, meta) => this.muxer.addVideoChunk(chunk, meta),
      error: (e) => { this.failure = e instanceof Error ? e : new Error(String(e)); },
    });

    this.encoder.configure({
      codec: 'vp09.00.10.08',
      width,
      height,
      bitrate,
      framerate: fps,
      latencyMode: 'quality',
    });
  }

  async addFrame(canvas: HTMLCanvasElement, index: number): Promise<void> {
    if (this.failure) throw this.failure;

    const frame = new VideoFrame(canvas, {
      timestamp: Math.round(index * this.frameDuration),
      duration: Math.round(this.frameDuration),
    });
    // A keyframe every second keeps the file seekable without bloating it.
    this.encoder.encode(frame, { keyFrame: index % Math.max(1, Math.round(this.fps)) === 0 });
    frame.close();

    // Do not let the encoder queue run away while Python is the bottleneck.
    if (this.encoder.encodeQueueSize > 8) {
      await new Promise<void>((resolve) => {
        const check = () => (this.encoder.encodeQueueSize <= 2 ? resolve() : setTimeout(check, 8));
        check();
      });
    }
  }

  async finish(): Promise<Blob> {
    await this.encoder.flush();
    if (this.failure) throw this.failure;
    this.encoder.close();
    this.muxer.finalize();
    return new Blob([this.muxer.target.buffer], { type: 'video/webm' });
  }
}

/* --------------------------------------------------------- mediarecorder */

class ReplayEncoder implements Encoder {
  readonly kind = 'mediarecorder' as const;
  private stills: Blob[] = [];

  constructor(private width: number, private height: number, private fps: number) {}

  async addFrame(canvas: HTMLCanvasElement): Promise<void> {
    // Hold each frame compressed rather than as raw pixels: a 30s render at
    // 15fps would otherwise be hundreds of megabytes of ImageData.
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.9));
    if (blob) this.stills.push(blob);
  }

  async finish(): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext('2d')!;

    const stream = canvas.captureStream(this.fps);
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      .find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_000_000 });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise<Blob>((r) => { recorder.onstop = () => r(new Blob(chunks, { type: mime })); });

    recorder.start();
    const interval = 1000 / this.fps;
    for (const still of this.stills) {
      const bitmap = await createImageBitmap(still);
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      await new Promise((r) => setTimeout(r, interval));
    }
    await new Promise((r) => setTimeout(r, 250));
    recorder.stop();
    return done;
  }
}

export function createEncoder(width: number, height: number, fps: number, bitrate: number): Encoder {
  return hasWebCodecs()
    ? new WebCodecsEncoder(width, height, fps, bitrate)
    : new ReplayEncoder(width, height, fps);
}
