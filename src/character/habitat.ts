/**
 * Habitats are the backdrop your character stands in. Each preset paints a
 * low-resolution canvas that gets used as the scene backdrop — pre-rendered
 * backgrounds behind a real-time character is the exact Resident Evil trick.
 */

export const HABITAT_PRESETS = [
  'DEAD ORBIT',
  'HAB MODULE',
  'WET MARKET',
  'SUBLEVEL 3',
  'GREENHOUSE',
  'THE CHANNEL',
] as const;

export type HabitatName = (typeof HABITAT_PRESETS)[number];

const W = 512;
const H = 288;

function noiseOverlay(ctx: CanvasRenderingContext2D, amount: number): void {
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function stars(ctx: CanvasRenderingContext2D, count: number): void {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const b = Math.random();
    ctx.fillStyle = `rgba(255,255,255,${0.25 + b * 0.75})`;
    ctx.fillRect(x | 0, y | 0, b > 0.93 ? 2 : 1, b > 0.93 ? 2 : 1);
  }
}

/** Perspective floor grid, vanishing toward the horizon. */
function floorGrid(ctx: CanvasRenderingContext2D, horizon: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let i = -12; i <= 12; i++) {
    ctx.beginPath();
    ctx.moveTo(W / 2 + i * 12, horizon);
    ctx.lineTo(W / 2 + i * 130, H);
    ctx.stroke();
  }
  for (let i = 1; i < 14; i++) {
    const t = i / 14;
    const y = horizon + (H - horizon) * t * t;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
}

export function drawHabitat(presetId: number): HTMLCanvasElement {
  const name = HABITAT_PRESETS[presetId % HABITAT_PRESETS.length];
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  switch (name) {
    case 'DEAD ORBIT': {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#02030a');
      g.addColorStop(1, '#0a0620');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      stars(ctx, 420);
      // Planet limb, low and to the right.
      const pg = ctx.createRadialGradient(W * 0.74, H * 1.05, 20, W * 0.74, H * 1.05, 210);
      pg.addColorStop(0, '#5a2f8c');
      pg.addColorStop(0.55, '#2a1450');
      pg.addColorStop(1, '#06030e');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(W * 0.74, H * 1.05, 200, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(180,120,255,.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }
    case 'HAB MODULE': {
      ctx.fillStyle = '#141821';
      ctx.fillRect(0, 0, W, H);
      // Back wall panelling.
      ctx.fillStyle = '#1b202b';
      for (let x = 0; x < W; x += 64) {
        for (let y = 0; y < H * 0.6; y += 48) {
          ctx.fillRect(x + 2, y + 2, 60, 44);
        }
      }
      ctx.strokeStyle = 'rgba(53,232,255,.18)';
      floorGrid(ctx, H * 0.58, 'rgba(53,232,255,.14)');
      // Strip light overhead.
      const lg = ctx.createLinearGradient(0, 0, 0, 60);
      lg.addColorStop(0, 'rgba(200,240,255,.5)');
      lg.addColorStop(1, 'transparent');
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, W, 60);
      ctx.fillStyle = '#dff4ff';
      ctx.fillRect(W * 0.25, 10, W * 0.5, 5);
      break;
    }
    case 'WET MARKET': {
      ctx.fillStyle = '#0a0610';
      ctx.fillRect(0, 0, W, H);
      // Rain-slick street receding to a neon vanishing point.
      const sg = ctx.createLinearGradient(0, H * 0.55, 0, H);
      sg.addColorStop(0, '#1a1030');
      sg.addColorStop(1, '#05030a');
      ctx.fillStyle = sg;
      ctx.fillRect(0, H * 0.55, W, H * 0.45);
      const signs = ['#ff3ad2', '#35e8ff', '#6dff7a', '#ffb03a', '#d8203a'];
      for (let i = 0; i < 26; i++) {
        const c = signs[i % signs.length];
        const x = Math.random() * W;
        const y = Math.random() * H * 0.55;
        const w = 6 + Math.random() * 40;
        const h = 3 + Math.random() * 9;
        ctx.globalAlpha = 0.5 + Math.random() * 0.5;
        ctx.fillStyle = c;
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 0.2;
        ctx.fillRect(x, y + H * 0.55 + (H * 0.55 - y) * 0.4, w, h * 3); // wet reflection
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'SUBLEVEL 3': {
      ctx.fillStyle = '#161412';
      ctx.fillRect(0, 0, W, H);
      // Stained concrete.
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = `rgba(${30 + Math.random() * 40},${26 + Math.random() * 30},${22 + Math.random() * 24},.6)`;
        ctx.fillRect(Math.random() * W, Math.random() * H, 20 + Math.random() * 90, 8 + Math.random() * 40);
      }
      floorGrid(ctx, H * 0.62, 'rgba(0,0,0,.5)');
      // Single red emergency lamp.
      const rg = ctx.createRadialGradient(W * 0.5, H * 0.2, 8, W * 0.5, H * 0.2, 200);
      rg.addColorStop(0, 'rgba(216,32,58,.85)');
      rg.addColorStop(1, 'transparent');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'GREENHOUSE': {
      ctx.fillStyle = '#05140a';
      ctx.fillRect(0, 0, W, H);
      const gg = ctx.createRadialGradient(W / 2, H * 0.3, 20, W / 2, H * 0.3, 260);
      gg.addColorStop(0, 'rgba(109,255,122,.42)');
      gg.addColorStop(1, 'transparent');
      ctx.fillStyle = gg;
      ctx.fillRect(0, 0, W, H);
      // Overgrowth silhouettes.
      for (let i = 0; i < 90; i++) {
        const x = Math.random() * W;
        const y = H * 0.35 + Math.random() * H * 0.65;
        ctx.fillStyle = `rgba(${10 + Math.random() * 20},${40 + Math.random() * 70},${20 + Math.random() * 30},.85)`;
        ctx.beginPath();
        ctx.ellipse(x, y, 6 + Math.random() * 26, 3 + Math.random() * 10, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      // Glazing bars.
      ctx.strokeStyle = 'rgba(180,220,190,.14)';
      for (let x = 0; x < W; x += 48) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(W / 2, H * 0.42); ctx.stroke();
      }
      break;
    }
    case 'THE CHANNEL': {
      // Dead-air broadcast: colour bars decaying into static.
      const bars = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
      const bw = W / bars.length;
      bars.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * bw, 0, bw + 1, H * 0.62); });
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, H * 0.62, W, H * 0.38);
      for (let i = 0; i < 1400; i++) {
        const v = Math.random() * 255 | 0;
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(Math.random() * W | 0, H * 0.62 + Math.random() * H * 0.38 | 0, 2, 2);
      }
      break;
    }
  }

  noiseOverlay(ctx, 26);
  return canvas;
}

export function defaultHabitat() {
  return {
    presetId: 1,
    backdropAsset: null,
    fogColor: '#0a0c14',
    fogDensity: 0.35,
    lightColor: '#cfe4ff',
    lightIntensity: 1.05,
    label: 'HAB MODULE / DECK 4',
  };
}
