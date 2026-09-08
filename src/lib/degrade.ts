/**
 * Photo degradation.
 *
 * Every upload gets pushed back through the constraints of the hardware and
 * codecs of the era: a small sensor, aggressive JPEG, 4:2:0 chroma, and a
 * palette that could not hold a smooth gradient. Doing it in this order
 * matters — resampling first and compressing last is what a camera did, and it
 * is why the artefacts land where they do.
 */

export interface DegradePreset {
  name: string;
  /** Longest edge, in pixels, after resampling. */
  maxEdge: number;
  /** JPEG quality per generation, applied in sequence. */
  generations: number[];
  /** 0 = full colour resolution, 2 = quarter — simulates 4:2:0 subsampling. */
  chromaSubsample: number;
  /** Bits per channel after quantisation, 8 = untouched. */
  colorDepth: number;
  /** Ordered dither strength, 0..1. */
  dither: number;
  /** Luminance noise, in 0..255 units. */
  grain: number;
  /** Unsharp amount — early digicams oversharpened hard. */
  sharpen: number;
  /** Per-channel gain, for a colour cast. */
  tint: [number, number, number];
  /** Corner darkening, 0..1. */
  vignette: number;
  /** Horizontal RGB split, in pixels. */
  chromaticAberration: number;
}

export const DEGRADE_PRESETS: DegradePreset[] = [
  {
    name: 'UNTOUCHED',
    maxEdge: 1600, generations: [0.92], chromaSubsample: 0, colorDepth: 8,
    dither: 0, grain: 0, sharpen: 0, tint: [1, 1, 1], vignette: 0, chromaticAberration: 0,
  },
  {
    name: 'DIGICAM 2003',
    maxEdge: 640, generations: [0.55], chromaSubsample: 1, colorDepth: 8,
    dither: 0, grain: 4, sharpen: 0.55, tint: [1.04, 1.0, 0.97], vignette: 0.18,
    chromaticAberration: 0,
  },
  {
    name: 'WEBCAM 1999',
    maxEdge: 352, generations: [0.4], chromaSubsample: 2, colorDepth: 5,
    dither: 0.7, grain: 12, sharpen: 0.2, tint: [1.0, 1.02, 1.08], vignette: 0.32,
    chromaticAberration: 1,
  },
  {
    name: 'DISPOSABLE',
    maxEdge: 512, generations: [0.48], chromaSubsample: 1, colorDepth: 7,
    dither: 0.25, grain: 18, sharpen: 0, tint: [1.1, 0.99, 0.9], vignette: 0.45,
    chromaticAberration: 1,
  },
  {
    name: 'CURSED JPEG',
    maxEdge: 480,
    // Six re-saves. Generation loss is the entire effect here.
    generations: [0.3, 0.28, 0.26, 0.24, 0.22, 0.2],
    chromaSubsample: 2, colorDepth: 6, dither: 0.15, grain: 6, sharpen: 0.8,
    tint: [1.02, 1.0, 1.02], vignette: 0.2, chromaticAberration: 0,
  },
  {
    name: 'PHOTO BOOTH',
    maxEdge: 400, generations: [0.45], chromaSubsample: 2, colorDepth: 4,
    dither: 1, grain: 10, sharpen: 0.3, tint: [1.06, 1.0, 1.06], vignette: 0.5,
    chromaticAberration: 2,
  },
];

/* 4x4 Bayer matrix, matching the one used in the PS1 shader. */
const BAYER = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

function fitWithin(w: number, h: number, maxEdge: number): [number, number] {
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return [Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale))];
}

/**
 * Box-filter downscale in halving steps.
 *
 * A single large drawImage jump uses a cheap filter and produces aliasing that
 * reads as "broken" rather than "old". Halving repeatedly is what gives the
 * soft, slightly mushy resample of a real small sensor.
 */
function resample(src: CanvasImageSource, sw: number, sh: number, dw: number, dh: number): HTMLCanvasElement {
  let cw = sw;
  let ch = sh;
  let current = document.createElement('canvas');
  current.width = cw;
  current.height = ch;
  current.getContext('2d')!.drawImage(src, 0, 0, cw, ch);

  while (cw > dw * 2 && ch > dh * 2) {
    cw = Math.max(dw, Math.floor(cw / 2));
    ch = Math.max(dh, Math.floor(ch / 2));
    const next = document.createElement('canvas');
    next.width = cw;
    next.height = ch;
    const nctx = next.getContext('2d')!;
    nctx.imageSmoothingEnabled = true;
    nctx.imageSmoothingQuality = 'high';
    nctx.drawImage(current, 0, 0, cw, ch);
    current = next;
  }

  const out = document.createElement('canvas');
  out.width = dw;
  out.height = dh;
  const octx = out.getContext('2d')!;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(current, 0, 0, dw, dh);
  return out;
}

/** Average chroma over 2^level blocks while leaving luma at full resolution. */
function subsampleChroma(data: Uint8ClampedArray, w: number, h: number, level: number): void {
  if (level <= 0) return;
  const block = 1 << level;

  for (let by = 0; by < h; by += block) {
    for (let bx = 0; bx < w; bx += block) {
      let sumI = 0;
      let sumQ = 0;
      let n = 0;
      const maxY = Math.min(by + block, h);
      const maxX = Math.min(bx + block, w);

      for (let y = by; y < maxY; y++) {
        for (let x = bx; x < maxX; x++) {
          const i = (y * w + x) * 4;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          sumI += 0.5959 * r - 0.2746 * g - 0.3213 * b;
          sumQ += 0.2115 * r - 0.5227 * g + 0.3112 * b;
          n++;
        }
      }
      const avgI = sumI / n;
      const avgQ = sumQ / n;

      for (let y = by; y < maxY; y++) {
        for (let x = bx; x < maxX; x++) {
          const i = (y * w + x) * 4;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          // Keep this pixel's own luma, swap in the block's average chroma.
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          data[i]     = lum + 0.956 * avgI + 0.619 * avgQ;
          data[i + 1] = lum - 0.272 * avgI - 0.647 * avgQ;
          data[i + 2] = lum - 1.106 * avgI + 1.703 * avgQ;
        }
      }
    }
  }
}

function unsharp(data: Uint8ClampedArray, w: number, h: number, amount: number): void {
  if (amount <= 0) return;
  const copy = new Uint8ClampedArray(data);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const k = i + c;
        const blur =
          (copy[k - 4] + copy[k + 4] + copy[k - w * 4] + copy[k + w * 4]) * 0.25;
        data[k] = copy[k] + (copy[k] - blur) * amount;
      }
    }
  }
}

/** Encode to JPEG and decode again, so real codec artefacts accumulate. */
async function jpegRoundTrip(canvas: HTMLCanvasElement, quality: number): Promise<HTMLCanvasElement> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );
  if (!blob) return canvas;

  const bitmap = await createImageBitmap(blob);
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  out.getContext('2d')!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return out;
}

export interface DegradeResult {
  blob: Blob;
  width: number;
  height: number;
  /** Size reduction, for the "you have been downgraded" readout. */
  originalBytes: number;
  finalBytes: number;
}

export async function degradeImage(file: Blob, preset: DegradePreset): Promise<DegradeResult> {
  const bitmap = await createImageBitmap(file);
  const [dw, dh] = fitWithin(bitmap.width, bitmap.height, preset.maxEdge);

  // 1. Resample down to the target sensor size.
  let canvas = resample(bitmap, bitmap.width, bitmap.height, dw, dh);
  bitmap.close();

  const ctx = canvas.getContext('2d')!;
  const img = ctx.getImageData(0, 0, dw, dh);
  const d = img.data;

  // 2. Optics and sensor: aberration, sharpening, chroma resolution loss.
  if (preset.chromaticAberration > 0) {
    const copy = new Uint8ClampedArray(d);
    const off = preset.chromaticAberration;
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const i = (y * dw + x) * 4;
        const xr = Math.min(dw - 1, x + off);
        const xb = Math.max(0, x - off);
        d[i] = copy[(y * dw + xr) * 4];
        d[i + 2] = copy[(y * dw + xb) * 4 + 2];
      }
    }
  }

  unsharp(d, dw, dh, preset.sharpen);
  subsampleChroma(d, dw, dh, preset.chromaSubsample);

  // 3. Response curve: tint, vignette, grain, then quantise with dither.
  const levels = Math.pow(2, preset.colorDepth) - 1;
  const cx = dw / 2;
  const cy = dh / 2;
  const maxDist = Math.hypot(cx, cy);

  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const i = (y * dw + x) * 4;
      const bayer = BAYER[(y % 4) * 4 + (x % 4)] / 16 - 0.5;
      const vig = preset.vignette > 0
        ? 1 - preset.vignette * Math.pow(Math.hypot(x - cx, y - cy) / maxDist, 2)
        : 1;
      const noise = preset.grain > 0 ? (Math.random() - 0.5) * preset.grain : 0;

      for (let c = 0; c < 3; c++) {
        let v = d[i + c] * preset.tint[c] * vig + noise;
        if (preset.colorDepth < 8) {
          v += bayer * preset.dither * (255 / levels);
          v = Math.round((v / 255) * levels) / levels * 255;
        }
        d[i + c] = v;
      }
    }
  }

  ctx.putImageData(img, 0, 0);

  // 4. Generation loss: each re-save compounds the last one's artefacts.
  for (const q of preset.generations) {
    canvas = await jpegRoundTrip(canvas, q);
  }

  const finalBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('could not encode image'))),
      'image/jpeg',
      preset.generations[preset.generations.length - 1] ?? 0.6,
    );
  });

  return {
    blob: finalBlob,
    width: dw,
    height: dh,
    originalBytes: file.size,
    finalBytes: finalBlob.size,
  };
}

/** Decode a blob into an <img>, for use as a texture or a preview. */
export function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('could not decode that image'));
    };
    img.src = url;
  });
}
