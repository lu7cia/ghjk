/**
 * Faces are painted into a 128x128 canvas and used as a texture, which is
 * exactly how PS1 characters worked — the geometry was far too coarse to
 * carry an expression, so all the character lived in a tiny hand-drawn map.
 */

export const FACE_PRESETS = [
  'HOLLOW',
  'SEDATED',
  'FERAL',
  'ANGELIC',
  'STATIC',
  'VISOR',
  'WEEPING',
  'GRINNING',
] as const;

export type FaceName = (typeof FACE_PRESETS)[number];

export interface FaceParams {
  faceId: number;
  skinTone: string;
  browHeight: number;  // 0..1
  eyeSpacing: number;  // 0..1
  jaw: number;         // 0..1
}

const SIZE = 128;

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `rgb(${r},${g},${b})`;
}

/** Speckled grain, so the texture never reads as flat vector art. */
function grain(ctx: CanvasRenderingContext2D, strength: number): void {
  const img = ctx.getImageData(0, 0, SIZE, SIZE);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * strength;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

export function drawFace(params: FaceParams): HTMLCanvasElement {
  const { skinTone, browHeight, eyeSpacing, jaw } = params;
  const face = FACE_PRESETS[params.faceId % FACE_PRESETS.length];

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  /* base skin, with cheek and temple shading painted in */
  ctx.fillStyle = skinTone;
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.fillStyle = shade(skinTone, -26);
  ctx.fillRect(0, 0, 14, SIZE);            // left temple falloff
  ctx.fillRect(SIZE - 14, 0, 14, SIZE);    // right temple falloff
  ctx.fillRect(0, SIZE - 18 + jaw * 10, SIZE, 18); // under-jaw shadow

  ctx.fillStyle = shade(skinTone, 14);
  ctx.fillRect(44, 18, 40, 22);            // forehead highlight

  const cx = SIZE / 2;
  const eyeY = 52 + browHeight * 10;
  const eyeDx = 20 + eyeSpacing * 10;
  const eyeW = 16;
  const eyeH = 9;

  /* eye sockets, sunk */
  ctx.fillStyle = shade(skinTone, -46);
  ctx.fillRect(cx - eyeDx - eyeW / 2 - 3, eyeY - 6, eyeW + 6, eyeH + 12);
  ctx.fillRect(cx + eyeDx - eyeW / 2 - 3, eyeY - 6, eyeW + 6, eyeH + 12);

  const drawEye = (ex: number) => {
    switch (face) {
      case 'VISOR':
        return; // handled below as one continuous band
      case 'STATIC':
        // eyes replaced by scanline mush
        for (let y = 0; y < eyeH; y++) {
          ctx.fillStyle = y % 2 ? '#0b0b0b' : '#cfcfcf';
          ctx.fillRect(ex - eyeW / 2, eyeY + y, eyeW, 1);
        }
        return;
      case 'HOLLOW':
        ctx.fillStyle = '#000000';
        ctx.fillRect(ex - eyeW / 2, eyeY - 2, eyeW, eyeH + 4);
        return;
      default: {
        ctx.fillStyle = '#e8e4dc';                       // sclera
        ctx.fillRect(ex - eyeW / 2, eyeY, eyeW, eyeH);
        const irisW = face === 'FERAL' ? 5 : 7;
        ctx.fillStyle =
          face === 'FERAL' ? '#c8b400' : face === 'ANGELIC' ? '#7fd6ff' : '#3a2a20';
        ctx.fillRect(ex - irisW / 2, eyeY + 1, irisW, eyeH - 2);
        ctx.fillStyle = '#000000';                       // pupil
        ctx.fillRect(ex - 1, eyeY + 2, 2, eyeH - 4);
        ctx.fillStyle = '#ffffff';                       // catchlight
        ctx.fillRect(ex - irisW / 2 + 1, eyeY + 1, 1, 1);
        ctx.fillStyle = shade(skinTone, -60);            // lash line
        ctx.fillRect(ex - eyeW / 2, eyeY - 1, eyeW, 1);
      }
    }
  };

  if (face === 'VISOR') {
    ctx.fillStyle = '#101418';
    ctx.fillRect(14, eyeY - 5, SIZE - 28, eyeH + 10);
    const g = ctx.createLinearGradient(14, 0, SIZE - 14, 0);
    g.addColorStop(0, 'rgba(53,232,255,.85)');
    g.addColorStop(0.5, 'rgba(255,58,210,.5)');
    g.addColorStop(1, 'rgba(109,255,122,.85)');
    ctx.fillStyle = g;
    ctx.fillRect(16, eyeY - 3, SIZE - 32, 4);
  } else {
    drawEye(cx - eyeDx);
    drawEye(cx + eyeDx);
  }

  /* brows */
  if (face !== 'VISOR') {
    ctx.fillStyle = shade(skinTone, -70);
    const browY = eyeY - 10 - browHeight * 6;
    const tilt = face === 'FERAL' ? 4 : face === 'WEEPING' ? -3 : 0;
    ctx.fillRect(cx - eyeDx - 10, browY + tilt, 20, 3);
    ctx.fillRect(cx + eyeDx - 10, browY + tilt, 20, 3);
  }

  /* nose — two shadow slabs and a highlight, no outline */
  ctx.fillStyle = shade(skinTone, -30);
  ctx.fillRect(cx - 5, eyeY + 14, 3, 16);
  ctx.fillRect(cx + 2, eyeY + 14, 3, 16);
  ctx.fillStyle = shade(skinTone, -55);
  ctx.fillRect(cx - 4, eyeY + 29, 8, 2);
  ctx.fillStyle = shade(skinTone, 18);
  ctx.fillRect(cx - 1, eyeY + 16, 2, 12);

  /* mouth */
  const mouthY = 100 + jaw * 8;
  switch (face) {
    case 'GRINNING':
      ctx.fillStyle = '#1a0d0d';
      ctx.fillRect(cx - 16, mouthY, 32, 7);
      ctx.fillStyle = '#ded6c6';
      for (let i = 0; i < 8; i++) ctx.fillRect(cx - 15 + i * 4, mouthY, 3, 3);
      break;
    case 'WEEPING':
      ctx.fillStyle = shade(skinTone, -70);
      ctx.fillRect(cx - 11, mouthY + 2, 22, 2);
      ctx.fillRect(cx - 13, mouthY, 3, 3);
      ctx.fillRect(cx + 10, mouthY, 3, 3);
      // tear tracks
      ctx.fillStyle = 'rgba(120,190,220,.55)';
      ctx.fillRect(cx - eyeDx, eyeY + 10, 2, 26);
      ctx.fillRect(cx + eyeDx, eyeY + 10, 2, 20);
      break;
    case 'FERAL':
      ctx.fillStyle = '#2a0a0a';
      ctx.fillRect(cx - 14, mouthY, 28, 9);
      ctx.fillStyle = '#e6dcc8';
      ctx.fillRect(cx - 12, mouthY, 3, 5);
      ctx.fillRect(cx + 9, mouthY, 3, 5);
      ctx.fillRect(cx - 4, mouthY + 4, 8, 3);
      break;
    case 'SEDATED':
      ctx.fillStyle = shade(skinTone, -55);
      ctx.fillRect(cx - 9, mouthY + 1, 18, 2);
      break;
    default:
      ctx.fillStyle = shade(skinTone, -62);
      ctx.fillRect(cx - 12, mouthY, 24, 3);
      ctx.fillStyle = shade(skinTone, -30);
      ctx.fillRect(cx - 10, mouthY + 3, 20, 2);
  }

  grain(ctx, 22);
  return canvas;
}
