import * as THREE from 'three';
import { createPs1Material, makePixelTexture } from './ps1Material';
import { drawFace } from './faces';
import type { CharacterConfig } from '../lib/types';

/**
 * A procedural low-poly humanoid, assembled from tapered boxes.
 *
 * Deliberately in the low hundreds of triangles: the silhouette does the
 * characterisation and the textures do the rest, which is how bodies were
 * actually built when you had a 360-poly budget for a whole character.
 */

export const HAIR_STYLES = [
  'SHAVED', 'BUZZ', 'BOB', 'CURTAINS', 'LONG', 'PONYTAIL', 'SPIKES', 'BUNS',
] as const;

export const TOP_STYLES = [
  'TANK', 'TEE', 'LONGSLEEVE', 'JACKET', 'HOODIE', 'PLATE VEST', 'HARNESS',
] as const;

export const BOTTOM_STYLES = ['SHORTS', 'TROUSERS', 'CARGO', 'SKIRT', 'GREAVES'] as const;

export const ACCESSORIES = [
  'NONE', 'CHOKER', 'HEADPHONES', 'GOGGLES', 'ANTENNA', 'SPIKE COLLAR', 'RESPIRATOR',
] as const;

export const SKIN_TONES = [
  '#f2d3bc', '#e6bfa4', '#d9a785', '#c68c62', '#a96f47', '#8b5a3c',
  '#6f4530', '#513425', '#3a2519', '#cfd8d6', '#9fb3a8', '#b8a0c9',
  '#7fa8c9', '#c98f8f', '#8fc9a2', '#d5d5d5',
];

export const HAIR_COLORS = [
  '#100d0c', '#2b1d16', '#4a2f1d', '#7a4c22', '#b5813c', '#d9be7a',
  '#e8e2d4', '#9a9a9a', '#c1121f', '#e0308c', '#7b2fd6', '#2f6fd6',
  '#1fbf8f', '#7bd62f', '#ff6a00', '#00e5ff',
];

export const FABRIC_COLORS = [
  '#0d0f14', '#1c2230', '#2f3a4a', '#5a6472', '#8b95a3', '#c3c9d2',
  '#4a1220', '#8c1c2b', '#c1121f', '#e0553a', '#e08b2f', '#d9c04a',
  '#254d2a', '#3f8c46', '#6dff7a', '#1d4a5c', '#2f7fa8', '#35e8ff',
  '#3a1c5c', '#6a2fa0', '#ff3ad2', '#f2e6d0', '#6b5b3f', '#3d2b1f',
];

/* ------------------------------------------------------------------ helpers */

/** Box whose top face is scaled by `taper` — gives limbs and torsos a form
 *  that reads as anatomy rather than as Lego. */
function taperedBox(w: number, h: number, d: number, taper = 1, topShiftZ = 0): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > 0) {
      pos.setX(i, pos.getX(i) * taper);
      pos.setZ(i, pos.getZ(i) * taper + topShiftZ);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

interface Part {
  geo: THREE.BufferGeometry;
  mat: THREE.Material | THREE.Material[];
  pos: [number, number, number];
  rot?: [number, number, number];
}

export interface BuiltCharacter {
  group: THREE.Group;
  /** Every PS1 material in the build, so global uniforms can be pushed live. */
  materials: THREE.ShaderMaterial[];
  /** World-space height of the assembled figure, feet resting on y = 0. */
  height: number;
  dispose(): void;
}

export interface BuildTextures {
  top?: HTMLImageElement | null;
  bottom?: HTMLImageElement | null;
}

/* -------------------------------------------------------------------- build */

export function buildCharacter(cfg: CharacterConfig, tex: BuildTextures = {}): BuiltCharacter {
  const group = new THREE.Group();
  const materials: THREE.ShaderMaterial[] = [];
  const geometries: THREE.BufferGeometry[] = [];

  const heightScale = 0.9 + cfg.height * 0.25;
  const girth = 0.82 + cfg.build * 0.5;

  const shared = { colorDepth: cfg.colorDepth, dither: cfg.dither, jitter: cfg.vertexJitter };

  const mk = (o: Parameters<typeof createPs1Material>[0]) => {
    const m = createPs1Material({ ...shared, ...o });
    materials.push(m);
    return m;
  };

  const skinMat = mk({ color: cfg.skinTone });
  const hairMat = mk({ color: cfg.hairColor });
  const accMat = mk({ color: cfg.accessoryColor });

  const topTex = tex.top ? makePixelTexture(tex.top) : null;
  const bottomTex = tex.bottom ? makePixelTexture(tex.bottom) : null;
  // When an image is supplied it should read as the fabric itself, so the tint
  // is neutralised rather than multiplied over the photo.
  const topMat = mk({ color: topTex ? '#ffffff' : cfg.topColor, map: topTex });
  const bottomMat = mk({ color: bottomTex ? '#ffffff' : cfg.bottomColor, map: bottomTex });

  /* ------------------------------------------------------------------ head */

  const faceCanvas = drawFace({
    faceId: cfg.faceId,
    skinTone: cfg.skinTone,
    browHeight: cfg.browHeight,
    eyeSpacing: cfg.eyeSpacing,
    jaw: cfg.jaw,
  });
  const faceTex = makePixelTexture(faceCanvas);
  const faceMat = mk({ color: '#ffffff', map: faceTex });

  const headW = 0.21 * (0.94 + cfg.build * 0.12);
  const headH = 0.25;
  const headD = 0.22;
  const headGeo = taperedBox(headW, headH, headD, 0.92 - cfg.jaw * 0.06);

  // BoxGeometry emits six material groups in +x,-x,+y,-y,+z,-z order, so the
  // painted face can live on the front plane alone.
  const headMats: THREE.Material[] = [skinMat, skinMat, skinMat, skinMat, faceMat, skinMat];

  const parts: Part[] = [];
  const neckY = 1.40 * heightScale;
  const headY = neckY + 0.06 + headH / 2;

  parts.push({ geo: headGeo, mat: headMats, pos: [0, headY, 0] });
  parts.push({ geo: taperedBox(0.075, 0.1, 0.075, 1.1), mat: skinMat, pos: [0, neckY + 0.03, 0] });

  /* ----------------------------------------------------------------- torso */

  const shoulderW = 0.40 * girth;
  const waistW = 0.27 * girth;
  const chestH = 0.34 * heightScale;
  const abdH = 0.22 * heightScale;
  const chestY = neckY - chestH / 2;
  const abdY = chestY - chestH / 2 - abdH / 2;

  // Chest tapers *outward* going up (shoulders wider than waist).
  parts.push({
    geo: taperedBox(waistW * 1.15, chestH, 0.20 * girth, shoulderW / (waistW * 1.15)),
    mat: skinMat,
    pos: [0, chestY, 0],
  });
  parts.push({
    geo: taperedBox(waistW, abdH, 0.18 * girth, 1.15),
    mat: skinMat,
    pos: [0, abdY, 0],
  });

  const hipY = abdY - abdH / 2 - 0.07;
  parts.push({ geo: taperedBox(waistW * 1.12, 0.16, 0.19 * girth, 0.94), mat: skinMat, pos: [0, hipY, 0] });

  /* ------------------------------------------------------------------ arms */

  const armLen = 0.30 * heightScale;
  const foreLen = 0.28 * heightScale;
  const armT = 0.085 * girth;
  const shoulderX = shoulderW / 2 + armT * 0.62;
  const upperArmY = chestY + chestH / 2 - armLen / 2 - 0.03;
  const foreArmY = upperArmY - armLen / 2 - foreLen / 2;
  const handY = foreArmY - foreLen / 2 - 0.055;

  for (const side of [-1, 1]) {
    parts.push({
      geo: taperedBox(armT, armLen, armT, 0.86),
      mat: skinMat,
      pos: [side * shoulderX, upperArmY, 0],
      rot: [0, 0, side * -0.10],
    });
    parts.push({
      geo: taperedBox(armT * 0.86, foreLen, armT * 0.86, 0.82),
      mat: skinMat,
      pos: [side * (shoulderX + 0.02), foreArmY, 0],
    });
    parts.push({
      geo: taperedBox(armT * 0.8, 0.11, armT * 0.55, 0.85),
      mat: skinMat,
      pos: [side * (shoulderX + 0.02), handY, 0],
    });
  }

  /* ------------------------------------------------------------------ legs */

  const thighLen = 0.44 * heightScale;
  const shinLen = 0.42 * heightScale;
  const legT = 0.115 * girth;
  const legX = waistW * 0.40;
  const thighY = hipY - 0.08 - thighLen / 2;
  const shinY = thighY - thighLen / 2 - shinLen / 2;

  for (const side of [-1, 1]) {
    parts.push({ geo: taperedBox(legT, thighLen, legT, 0.8), mat: skinMat, pos: [side * legX, thighY, 0] });
    parts.push({ geo: taperedBox(legT * 0.8, shinLen, legT * 0.8, 0.72), mat: skinMat, pos: [side * legX, shinY, 0] });
    parts.push({
      geo: taperedBox(legT * 0.82, 0.075, 0.24, 0.9, 0.03),
      mat: accMat,
      pos: [side * legX, shinY - shinLen / 2 - 0.03, 0.045],
    });
  }

  /* ------------------------------------------------------------------ hair */

  const hair = HAIR_STYLES[cfg.hairId % HAIR_STYLES.length];
  const hw = headW + 0.018;
  const hd = headD + 0.018;
  const topOfHead = headY + headH / 2;

  const addHair = (w: number, h: number, d: number, x: number, y: number, z: number, taper = 1) =>
    parts.push({ geo: taperedBox(w, h, d, taper), mat: hairMat, pos: [x, y, z] });

  if (hair !== 'SHAVED') {
    // Skullcap, common to every style except the shaved head.
    addHair(hw, 0.055, hd, 0, topOfHead - 0.012, 0, 0.9);
  }
  switch (hair) {
    case 'BUZZ':
      addHair(hw * 0.99, 0.03, hd * 0.99, 0, topOfHead - 0.05, 0);
      break;
    case 'BOB':
      addHair(hw + 0.02, 0.20, 0.035, 0, headY + 0.02, -hd / 2 + 0.01);
      addHair(0.035, 0.19, hd * 0.9, -hw / 2 - 0.005, headY + 0.03, 0);
      addHair(0.035, 0.19, hd * 0.9, hw / 2 + 0.005, headY + 0.03, 0);
      addHair(hw * 0.86, 0.045, 0.03, 0, headY + headH / 2 - 0.03, hd / 2 - 0.008); // fringe
      break;
    case 'CURTAINS':
      addHair(0.07, 0.14, 0.035, -hw / 2 + 0.03, headY + headH / 2 - 0.06, hd / 2 - 0.006);
      addHair(0.07, 0.14, 0.035, hw / 2 - 0.03, headY + headH / 2 - 0.06, hd / 2 - 0.006);
      addHair(hw + 0.01, 0.13, 0.03, 0, headY + 0.05, -hd / 2 + 0.008);
      break;
    case 'LONG':
      addHair(hw + 0.03, 0.62 * heightScale, 0.06, 0, headY - 0.24 * heightScale, -hd / 2 - 0.005, 1.25);
      addHair(0.045, 0.34, 0.05, -hw / 2 - 0.008, headY - 0.10, 0.01);
      addHair(0.045, 0.34, 0.05, hw / 2 + 0.008, headY - 0.10, 0.01);
      addHair(hw * 0.9, 0.05, 0.03, 0, headY + headH / 2 - 0.032, hd / 2 - 0.007);
      break;
    case 'PONYTAIL':
      addHair(0.07, 0.07, 0.07, 0, topOfHead - 0.02, -hd / 2 - 0.02);
      addHair(0.055, 0.46 * heightScale, 0.055, 0, topOfHead - 0.26 * heightScale, -hd / 2 - 0.05, 0.5);
      addHair(hw * 0.88, 0.04, 0.028, 0, headY + headH / 2 - 0.028, hd / 2 - 0.006);
      break;
    case 'SPIKES':
      for (let i = 0; i < 7; i++) {
        const a = (i / 6 - 0.5) * Math.PI * 0.9;
        addHair(0.035, 0.13 + (i % 3) * 0.035, 0.035,
          Math.sin(a) * hw * 0.42, topOfHead + 0.05, Math.cos(a) * hd * 0.28 - 0.02, 0.15);
      }
      break;
    case 'BUNS':
      addHair(0.085, 0.085, 0.085, -hw / 2 - 0.012, topOfHead + 0.012, -0.01, 0.75);
      addHair(0.085, 0.085, 0.085, hw / 2 + 0.012, topOfHead + 0.012, -0.01, 0.75);
      addHair(hw * 0.9, 0.04, 0.028, 0, headY + headH / 2 - 0.028, hd / 2 - 0.006);
      break;
  }

  /* --------------------------------------------------------------- clothing */

  const top = TOP_STYLES[cfg.topId % TOP_STYLES.length];
  const pad = 0.014;

  const addTop = (w: number, h: number, d: number, x: number, y: number, z = 0, taper = 1) =>
    parts.push({ geo: taperedBox(w, h, d, taper), mat: topMat, pos: [x, y, z] });

  if (top !== 'HARNESS') {
    // Shell over the chest, always present for a real garment.
    addTop(waistW * 1.15 + pad, chestH + 0.02, 0.20 * girth + pad, 0, chestY,
      0, shoulderW / (waistW * 1.15));
  }

  switch (top) {
    case 'TANK':
      // Straps only across the shoulders — cut the shell short at the ribs.
      addTop(waistW + pad, abdH * 0.55, 0.18 * girth + pad, 0, abdY + abdH * 0.22, 0, 1.1);
      break;
    case 'TEE':
      addTop(waistW + pad, abdH * 0.8, 0.18 * girth + pad, 0, abdY + abdH * 0.08, 0, 1.12);
      for (const side of [-1, 1]) {
        addTop(armT + pad, armLen * 0.45, armT + pad, side * shoulderX, upperArmY + armLen * 0.27, 0, 0.94);
      }
      break;
    case 'LONGSLEEVE':
    case 'HOODIE':
      addTop(waistW + pad, abdH + 0.02, 0.18 * girth + pad, 0, abdY, 0, 1.15);
      for (const side of [-1, 1]) {
        addTop(armT + pad, armLen + 0.01, armT + pad, side * shoulderX, upperArmY, 0, 0.88);
        addTop(armT * 0.86 + pad, foreLen, armT * 0.86 + pad, side * (shoulderX + 0.02), foreArmY, 0, 0.86);
      }
      if (top === 'HOODIE') {
        // Hood bunched at the back of the neck.
        addTop(hw + 0.05, 0.15, 0.09, 0, neckY - 0.02, -hd / 2 - 0.02, 1.05);
        parts.push({
          geo: taperedBox(0.05, 0.16, 0.02),
          mat: accMat,
          pos: [0.035, chestY + chestH / 2 - 0.10, 0.20 * girth / 2 + pad],
        });
      }
      break;
    case 'JACKET':
      addTop(waistW + pad * 2, abdH + 0.02, 0.18 * girth + pad * 2, 0, abdY, 0, 1.15);
      for (const side of [-1, 1]) {
        addTop(armT + pad * 1.6, armLen + 0.01, armT + pad * 1.6, side * shoulderX, upperArmY, 0, 0.9);
        addTop(armT * 0.86 + pad * 1.6, foreLen, armT * 0.86 + pad * 1.6, side * (shoulderX + 0.02), foreArmY, 0, 0.88);
      }
      // Open front placket, so the garment reads as a jacket not a jumper.
      parts.push({
        geo: taperedBox(0.028, chestH + abdH, 0.02),
        mat: accMat,
        pos: [0, chestY - 0.05, 0.20 * girth / 2 + pad + 0.006],
      });
      break;
    case 'PLATE VEST':
      addTop(shoulderW * 0.92, chestH * 0.8, 0.22 * girth + pad * 2, 0, chestY - 0.01, 0, 0.95);
      for (const side of [-1, 1]) {
        // Pauldrons.
        parts.push({
          geo: taperedBox(0.13 * girth, 0.09, 0.15 * girth, 0.7),
          mat: accMat,
          pos: [side * (shoulderX + 0.01), chestY + chestH / 2 - 0.01, 0],
        });
      }
      break;
    case 'HARNESS':
      for (const side of [-1, 1]) {
        parts.push({
          geo: taperedBox(0.04, chestH + 0.02, 0.24 * girth),
          mat: topMat,
          pos: [side * shoulderW * 0.22, chestY, 0],
          rot: [0, 0, side * 0.08],
        });
      }
      addTop(waistW * 1.2, 0.05, 0.21 * girth, 0, abdY - abdH / 2 + 0.02);
      break;
  }

  /* ----------------------------------------------------------------- bottom */

  const bottom = BOTTOM_STYLES[cfg.bottomId % BOTTOM_STYLES.length];
  const addBottom = (w: number, h: number, d: number, x: number, y: number, z = 0, taper = 1) =>
    parts.push({ geo: taperedBox(w, h, d, taper), mat: bottomMat, pos: [x, y, z] });

  addBottom(waistW * 1.12 + pad, 0.17, 0.19 * girth + pad, 0, hipY, 0, 0.94);

  switch (bottom) {
    case 'SHORTS':
      for (const side of [-1, 1]) {
        addBottom(legT + pad, thighLen * 0.5, legT + pad, side * legX, thighY + thighLen * 0.24, 0, 0.9);
      }
      break;
    case 'TROUSERS':
      for (const side of [-1, 1]) {
        addBottom(legT + pad, thighLen, legT + pad, side * legX, thighY, 0, 0.82);
        addBottom(legT * 0.8 + pad, shinLen, legT * 0.8 + pad, side * legX, shinY, 0, 0.8);
      }
      break;
    case 'CARGO':
      for (const side of [-1, 1]) {
        addBottom(legT + pad * 1.8, thighLen, legT + pad * 1.8, side * legX, thighY, 0, 0.9);
        addBottom(legT * 0.86 + pad * 1.8, shinLen, legT * 0.86 + pad * 1.8, side * legX, shinY, 0, 0.95);
        // Thigh pockets.
        parts.push({
          geo: taperedBox(0.04, 0.11, legT * 0.8),
          mat: accMat,
          pos: [side * (legX + legT / 2 + 0.012), thighY - 0.04, 0],
        });
      }
      break;
    case 'SKIRT':
      addBottom(waistW * 1.15, thighLen * 0.72, 0.2 * girth, 0, hipY - 0.06 - thighLen * 0.3, 0, 1.55);
      break;
    case 'GREAVES':
      for (const side of [-1, 1]) {
        addBottom(legT + pad, thighLen * 0.45, legT + pad, side * legX, thighY + thighLen * 0.26, 0, 0.9);
        parts.push({
          geo: taperedBox(legT * 0.95 + pad, shinLen * 0.8, legT * 0.95 + pad, 0.85),
          mat: accMat,
          pos: [side * legX, shinY + 0.02, 0.006],
        });
      }
      break;
  }

  /* ------------------------------------------------------------ accessories */

  const acc = ACCESSORIES[cfg.accessoryId % ACCESSORIES.length];
  switch (acc) {
    case 'CHOKER':
      parts.push({ geo: taperedBox(0.09, 0.028, 0.09), mat: accMat, pos: [0, neckY + 0.015, 0] });
      parts.push({ geo: taperedBox(0.02, 0.03, 0.012), mat: accMat, pos: [0, neckY - 0.005, 0.046] });
      break;
    case 'HEADPHONES':
      parts.push({ geo: taperedBox(hw + 0.05, 0.028, 0.035), mat: accMat, pos: [0, topOfHead + 0.03, 0] });
      for (const side of [-1, 1]) {
        parts.push({
          geo: taperedBox(0.03, 0.085, 0.085, 0.85),
          mat: accMat,
          pos: [side * (hw / 2 + 0.022), headY + 0.02, 0],
        });
      }
      break;
    case 'GOGGLES':
      parts.push({ geo: taperedBox(hw + 0.03, 0.055, 0.03), mat: accMat, pos: [0, headY + 0.055, headD / 2 + 0.012] });
      parts.push({ geo: taperedBox(hw + 0.035, 0.02, hd + 0.02), mat: accMat, pos: [0, headY + 0.055, 0] });
      break;
    case 'ANTENNA':
      parts.push({ geo: taperedBox(0.014, 0.30, 0.014, 0.35), mat: accMat, pos: [0.05, topOfHead + 0.16, -0.02] });
      parts.push({ geo: taperedBox(0.032, 0.032, 0.032), mat: accMat, pos: [0.05, topOfHead + 0.32, -0.02] });
      break;
    case 'SPIKE COLLAR':
      parts.push({ geo: taperedBox(0.10, 0.035, 0.10), mat: accMat, pos: [0, neckY + 0.015, 0] });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        parts.push({
          geo: taperedBox(0.016, 0.05, 0.016, 0.1),
          mat: accMat,
          pos: [Math.sin(a) * 0.052, neckY + 0.04, Math.cos(a) * 0.052],
        });
      }
      break;
    case 'RESPIRATOR':
      parts.push({ geo: taperedBox(headW * 0.72, 0.085, 0.05, 0.85), mat: accMat, pos: [0, headY - 0.055, headD / 2 + 0.014] });
      for (const side of [-1, 1]) {
        parts.push({
          geo: taperedBox(0.045, 0.045, 0.045),
          mat: accMat,
          pos: [side * headW * 0.42, headY - 0.055, headD / 2 + 0.008],
        });
      }
      break;
  }

  /* ------------------------------------------------------------------ emit */

  for (const p of parts) {
    const mesh = new THREE.Mesh(p.geo, p.mat as THREE.Material);
    mesh.position.set(...p.pos);
    if (p.rot) mesh.rotation.set(...p.rot);
    group.add(mesh);
    geometries.push(p.geo);
  }

  // The part positions above are laid out relative to an approximate hip
  // height, which leaves the feet slightly below the origin and shifts as the
  // height slider moves. Measure the result and drop it onto y = 0 instead of
  // trying to keep every offset in the chain balanced by hand.
  const bounds = new THREE.Box3().setFromObject(group);
  group.position.y = -bounds.min.y;
  const height = bounds.max.y - bounds.min.y;

  return {
    group,
    materials,
    height,
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => {
        const map = m.uniforms.uMap?.value as THREE.Texture | null;
        map?.dispose();
        m.dispose();
      });
    },
  };
}

export function defaultCharacter(): CharacterConfig {
  return {
    skinTone: SKIN_TONES[3],
    build: 0.45,
    height: 0.5,
    faceId: 0,
    browHeight: 0.5,
    eyeSpacing: 0.5,
    jaw: 0.5,
    hairId: 4,
    hairColor: HAIR_COLORS[8],
    topId: 4,
    topColor: FABRIC_COLORS[16],
    topTextureAsset: null,
    bottomId: 1,
    bottomColor: FABRIC_COLORS[2],
    bottomTextureAsset: null,
    accessoryId: 1,
    accessoryColor: '#8b95a3',
    vertexJitter: 0.85,
    colorDepth: 5,
    dither: 1,
    turntable: true,
  };
}
