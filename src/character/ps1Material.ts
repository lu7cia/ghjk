import * as THREE from 'three';

/**
 * PlayStation-1 era rasteriser, faked in GLSL.
 *
 * Four things gave PS1 characters their look, and all four are deliberate here:
 *
 *  1. Vertex snapping. The GTE had no sub-pixel precision, so vertices were
 *     rounded to a coarse grid. That is the signature "wobble" on moving geometry.
 *  2. Affine texture mapping. There was no perspective-correct interpolation,
 *     so textures swim and warp across large triangles.
 *  3. Per-vertex (Gouraud) lighting. No per-pixel anything.
 *  4. 15/16-bit colour with ordered dithering to hide the banding.
 */

const vertexShader = /* glsl */ `
  uniform vec2  uSnapResolution;   // virtual framebuffer, e.g. 320x240
  uniform float uJitter;           // 0 = modern precision, 1 = full PS1 wobble
  uniform vec3  uLightDir;
  uniform vec3  uLightColor;
  uniform vec3  uAmbient;
  uniform float uLightIntensity;

  varying vec2  vUvW;    // uv premultiplied by w, for affine interpolation
  varying float vW;
  varying vec3  vLight;
  varying vec3  vWorldNormal;
  varying float vDepth;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vec4 clip = projectionMatrix * mvPosition;

    // (1) Snap to the virtual framebuffer grid, in NDC, then restore w.
    if (uJitter > 0.0) {
      vec2 ndc = clip.xy / clip.w;
      vec2 grid = uSnapResolution * 0.5;
      vec2 snapped = floor(ndc * grid + 0.5) / grid;
      clip.xy = mix(ndc, snapped, uJitter) * clip.w;
    }

    // (2) Affine texture mapping. Varyings are interpolated perspective-correctly
    //     by the hardware; premultiplying by w and dividing it back out in the
    //     fragment stage cancels that correction and leaves screen-linear UVs.
    vUvW = uv * clip.w;
    vW = clip.w;

    // (3) Gouraud lighting, evaluated once per vertex and interpolated flat.
    vec3 n = normalize(normalMatrix * normal);
    vWorldNormal = n;
    float diffuse = max(dot(n, normalize(uLightDir)), 0.0);
    // A dim back-fill keeps silhouettes from going pure black, as PS1 art did
    // with a second cheap light rather than any kind of ambient occlusion.
    float fill = max(dot(n, normalize(-uLightDir * vec3(1.0, 0.2, 1.0))), 0.0) * 0.25;
    vLight = uAmbient + uLightColor * (diffuse + fill) * uLightIntensity;

    vDepth = -mvPosition.z;
    gl_Position = clip;
  }
`;

const fragmentShader = /* glsl */ `
  precision mediump float;

  uniform vec3      uColor;
  uniform sampler2D uMap;
  uniform float     uHasMap;
  uniform float     uColorDepth;   // bits per channel
  uniform float     uDither;       // 0..1
  uniform vec2      uUvScale;
  uniform float     uEmissive;
  uniform float     uAlphaTest;
  uniform vec3      uFogColor;
  uniform float     uFogNear;
  uniform float     uFogFar;

  varying vec2  vUvW;
  varying float vW;
  varying vec3  vLight;
  varying vec3  vWorldNormal;
  varying float vDepth;

  // Classic 4x4 Bayer matrix, the same ordered dither the hardware applied
  // when packing 24-bit colour down to 15-bit.
  float bayer4(vec2 p) {
    int x = int(mod(p.x, 4.0));
    int y = int(mod(p.y, 4.0));
    int i = x + y * 4;
    float m[16];
    m[0]=0.0;  m[1]=8.0;  m[2]=2.0;  m[3]=10.0;
    m[4]=12.0; m[5]=4.0;  m[6]=14.0; m[7]=6.0;
    m[8]=3.0;  m[9]=11.0; m[10]=1.0; m[11]=9.0;
    m[12]=15.0;m[13]=7.0; m[14]=13.0;m[15]=5.0;
    for (int k = 0; k < 16; k++) {
      if (k == i) return m[k] / 16.0 - 0.5;
    }
    return 0.0;
  }

  void main() {
    vec2 uv = (vUvW / vW) * uUvScale;

    vec4 tex = vec4(1.0);
    if (uHasMap > 0.5) {
      tex = texture2D(uMap, uv);
      if (tex.a < uAlphaTest) discard;
    }

    vec3 albedo = uColor * tex.rgb;
    vec3 lit = albedo * (vLight + uEmissive);

    // Linear distance fog, applied before quantisation so the gradient bands
    // in the same 15-bit steps everything else does.
    float fog = clamp((vDepth - uFogNear) / max(uFogFar - uFogNear, 0.001), 0.0, 1.0);
    lit = mix(lit, uFogColor, fog);

    // (4) Ordered-dither, then quantise to the chosen bit depth.
    float levels = pow(2.0, uColorDepth) - 1.0;
    float threshold = bayer4(gl_FragCoord.xy) * uDither / levels;
    lit = floor((lit + threshold) * levels + 0.5) / levels;

    gl_FragColor = vec4(clamp(lit, 0.0, 1.0), 1.0);
  }
`;

export interface Ps1Options {
  color?: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  colorDepth?: number;
  dither?: number;
  jitter?: number;
  uvScale?: [number, number];
  emissive?: number;
  side?: THREE.Side;
}

export function createPs1Material(opts: Ps1Options = {}): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: opts.side ?? THREE.FrontSide,
    uniforms: {
      uColor: { value: new THREE.Color(opts.color ?? 0xffffff) },
      uMap: { value: opts.map ?? null },
      uHasMap: { value: opts.map ? 1 : 0 },
      uColorDepth: { value: opts.colorDepth ?? 5 },
      uDither: { value: opts.dither ?? 1 },
      uJitter: { value: opts.jitter ?? 1 },
      uSnapResolution: { value: new THREE.Vector2(320, 240) },
      uUvScale: { value: new THREE.Vector2(...(opts.uvScale ?? [1, 1])) },
      uEmissive: { value: opts.emissive ?? 0 },
      uAlphaTest: { value: 0.5 },
      uLightDir: { value: new THREE.Vector3(0.4, 0.8, 0.6) },
      uLightColor: { value: new THREE.Color(0xffffff) },
      uAmbient: { value: new THREE.Color(0x1a2030) },
      uLightIntensity: { value: 1 },
      uFogColor: { value: new THREE.Color(0x0a0c14) },
      uFogNear: { value: 2.4 },
      uFogFar: { value: 9.0 },
    },
  });
  return mat;
}

/** Nearest-neighbour, no mips — PS1 had neither bilinear filtering nor mipmaps. */
export function makePixelTexture(source: TexImageSource): THREE.Texture {
  const tex = new THREE.Texture(source as HTMLImageElement);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
