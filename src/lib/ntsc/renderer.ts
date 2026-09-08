import { NTSC_VERT, NTSC_FRAG } from './shader';
import { PRESETS, TAPE_SPEEDS, cutoffToRadius, type NtscSettings } from './presets';

/**
 * WebGL2 runner for the NTSC/VHS shader.
 *
 * Draws a source (video, image or canvas) through the pipeline into an
 * offscreen canvas at the preset's processing height. Callers either pump it
 * from requestAnimationFrame for a live preview, or step it frame-by-frame
 * while a MediaRecorder captures the output.
 */

export type NtscSource = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`[ntsc] shader compile failed: ${log}`);
  }
  return sh;
}

export class NtscRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private tex: WebGLTexture;
  private vao: WebGLVertexArrayObject;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private frame = 0;
  private seed = Math.random() * 1000;
  private disposed = false;

  constructor(width = 640, height = 480) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;

    const gl = this.canvas.getContext('webgl2', {
      antialias: false,
      preserveDrawingBuffer: true, // required for toBlob and for capture
      premultipliedAlpha: false,
    });
    if (!gl) throw new Error('[ntsc] WebGL2 is not available in this browser');
    this.gl = gl;

    const vs = compile(gl, gl.VERTEX_SHADER, NTSC_VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, NTSC_FRAG);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`[ntsc] link failed: ${gl.getProgramInfoLog(prog)}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.program = prog;

    // Fullscreen triangle pair.
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.vao = vao;

    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.tex = tex;
  }

  private u(name: string): WebGLUniformLocation | null {
    if (!this.uniforms.has(name)) {
      this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    }
    return this.uniforms.get(name)!;
  }

  /** Size the output buffer to the preset's processing height, keeping aspect. */
  resizeFor(settings: NtscSettings, sourceAspect: number): void {
    const h = Math.max(64, Math.round(settings.processingHeight));
    const w = Math.max(64, Math.round(h * sourceAspect));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  render(source: NtscSource, settings: NtscSettings): void {
    if (this.disposed) return;
    const gl = this.gl;
    const { width: W, height: H } = this.canvas;

    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    // Video frames arrive top-down; flip so UV origin matches the source.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } catch {
      // A video that has not produced a frame yet throws; skip this tick.
      return;
    }

    gl.viewport(0, 0, W, H);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.u('uSrc'), 0);

    gl.uniform2f(this.u('uResolution'), W, H);
    gl.uniform1f(this.u('uFrame'), this.frame);
    gl.uniform1f(this.u('uSeed'), this.seed);

    const tape = settings.tapeSpeed ? TAPE_SPEEDS[settings.tapeSpeed] : null;
    // Without a tape stage, luma is still band-limited by the composite
    // encoder itself — roughly the 4.2 MHz NTSC luma channel.
    const lumaCut = tape ? tape.lumaCut : 4_200_000;
    const chromaCut = tape ? tape.chromaCut : 1_300_000;
    const chromaDelay = tape ? tape.chromaDelay : 0;

    gl.uniform1f(this.u('uLumaRadius'), cutoffToRadius(lumaCut, W));
    gl.uniform1f(this.u('uChromaRadius'), cutoffToRadius(chromaCut, W));
    gl.uniform1f(this.u('uChromaDelay'), chromaDelay * (W / 754));
    gl.uniform1f(this.u('uChromaDelayV'), settings.chromaDelayVertical);

    const f = (name: string, v: number) => gl.uniform1f(this.u(name), v);
    f('uChromaIntoLuma', settings.chromaIntoLuma);
    f('uLumaIntoChroma', settings.lumaIntoChroma);
    f('uScanlinePhase', settings.scanlinePhase);
    f('uCompositeNoise', settings.compositeNoise);
    f('uLumaNoise', settings.lumaNoise);
    f('uChromaNoise', settings.chromaNoise);
    f('uSnowIntensity', settings.snowIntensity);
    f('uSnowAnisotropy', settings.snowAnisotropy);
    f('uChromaPhaseError', settings.chromaPhaseError);
    f('uChromaPhaseNoise', settings.chromaPhaseNoise);
    f('uChromaLoss', settings.chromaLoss);
    f('uChromaVertBlend', settings.chromaVertBlend);
    f('uRinging', settings.ringing);
    f('uSharpen', settings.sharpen);
    f('uCompositePreemphasis', settings.compositePreemphasis);
    f('uHeadSwitchingHeight', settings.headSwitchingHeight);
    f('uHeadSwitchingOffset', settings.headSwitchingOffset);
    f('uHeadSwitchingShift', settings.headSwitchingShift);
    f('uTrackingHeight', settings.trackingHeight);
    f('uTrackingWave', settings.trackingWave);
    f('uTrackingNoise', settings.trackingNoise);
    f('uTrackingSnow', settings.trackingSnow);
    f('uEdgeWaveIntensity', settings.edgeWaveIntensity);
    f('uEdgeWaveSpeed', settings.edgeWaveSpeed);
    f('uEdgeWaveFrequency', settings.edgeWaveFrequency);
    f('uScanlineDarken', settings.scanlineDarken);
    f('uVignette', settings.vignette);
    f('uSaturation', settings.saturation);
    f('uBrightness', settings.brightness);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    this.frame++;
  }

  resetFrameCounter(): void {
    this.frame = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    gl.deleteTexture(this.tex);
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

/* ------------------------------------------------------------------ exports */

/** Apply the effect to a still image and return the degraded result. */
export async function applyNtscToImage(
  image: HTMLImageElement | HTMLCanvasElement,
  settings: NtscSettings,
): Promise<Blob> {
  const aspect = image.width / image.height;
  const r = new NtscRenderer();
  try {
    r.resizeFor(settings, aspect);
    // Two passes: the first primes the texture, the second renders with the
    // frame counter advanced so noise is not identical to the preview's frame 0.
    r.render(image, settings);
    r.render(image, settings);
    return await new Promise<Blob>((resolve, reject) => {
      r.canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
        'image/jpeg',
        0.62,
      );
    });
  } finally {
    r.dispose();
  }
}

export interface VideoEncodeProgress {
  phase: 'decoding' | 'encoding' | 'done';
  progress: number; // 0..1
}

/**
 * Re-encode a video through the effect.
 *
 * Plays the source in real time and captures the processed canvas with
 * MediaRecorder. That is the only route available in a browser without
 * shipping a full encoder: WebCodecs would allow faster-than-realtime, but
 * support is still uneven enough that the reliable path wins here.
 */
export async function applyNtscToVideo(
  file: Blob,
  settings: NtscSettings,
  onProgress?: (p: VideoEncodeProgress) => void,
): Promise<{ blob: Blob; width: number; height: number; duration: number }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('could not decode that video'));
    });

    const aspect = video.videoWidth / video.videoHeight || 4 / 3;
    const renderer = new NtscRenderer();
    renderer.resizeFor(settings, aspect);
    renderer.resetFrameCounter();

    const stream = renderer.canvas.captureStream(30);
    const mime = pickVideoMime();
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 1_600_000, // low on purpose; macroblocking is welcome
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };

    const finished = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    });

    let raf = 0;
    const pump = () => {
      renderer.render(video, settings);
      if (video.duration) {
        onProgress?.({ phase: 'encoding', progress: video.currentTime / video.duration });
      }
      raf = requestAnimationFrame(pump);
    };

    onProgress?.({ phase: 'encoding', progress: 0 });
    recorder.start(250);
    await video.play();
    pump();

    await new Promise<void>((resolve) => {
      video.onended = () => resolve();
    });

    cancelAnimationFrame(raf);
    // Let the recorder flush the tail before stopping.
    await new Promise((r) => setTimeout(r, 220));
    recorder.stop();

    const blob = await finished;
    const width = renderer.canvas.width;
    const height = renderer.canvas.height;
    const duration = video.duration;
    renderer.dispose();
    onProgress?.({ phase: 'done', progress: 1 });
    return { blob, width, height, duration };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function pickVideoMime(): string {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return 'video/webm';
}

export { PRESETS };
