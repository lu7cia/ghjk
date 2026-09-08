/**
 * A real-time GLSL adaptation of the ntsc-rs composite/VHS pipeline.
 *
 *   Upstream: https://github.com/ntsc-rs/ntsc-rs by valadaptive
 *   Upstream licence: MIT / Apache-2.0 / ISC (everything outside crates/gui)
 *
 * ntsc-rs is a CPU implementation in Rust: it walks each scanline as a signal
 * and runs real IIR filters over it. A fragment shader cannot do a sequential
 * pass along a line, so each stage below is re-expressed as something a
 * per-pixel program can evaluate — a one-sided IIR becomes a set of decaying
 * taps sampled backwards along the scan direction, a geometric distortion
 * becomes an offset applied to the sample coordinate before fetching.
 *
 * The stage names and their ordering deliberately mirror
 * `NtscEffect::apply_effect_to_yiq_field` in crates/ntscrs/src/ntsc.rs, so the
 * two can be read side by side. What this is not is a compile of their Rust:
 * it is an approximation chosen to run at video rate in a browser.
 */

export const NTSC_VERT = /* glsl */ `#version 300 es
  in vec2 aPos;
  out vec2 vUv;
  void main() {
    vUv = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
  }
`;

export const NTSC_FRAG = /* glsl */ `#version 300 es
precision highp float;

in  vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSrc;
uniform vec2  uResolution;      // processing resolution, in pixels
uniform float uFrame;           // frame counter, drives per-frame randomness
uniform float uSeed;

/* --- bandwidth (VHS tape speed). Radii are in texels, precomputed on the CPU
       from the ntsc-rs cutoffs so the frequency maths stays in one place. --- */
uniform float uLumaRadius;
uniform float uChromaRadius;
uniform float uChromaDelay;     // horizontal chroma lag, texels
uniform float uChromaDelayV;    // vertical chroma lag, rows

/* --- composite crosstalk --- */
uniform float uChromaIntoLuma;  // dot crawl
uniform float uLumaIntoChroma;  // rainbow fringing on luma edges
uniform float uScanlinePhase;   // per-row subcarrier phase step

/* --- artefacts --- */
uniform float uCompositeNoise;
uniform float uLumaNoise;
uniform float uChromaNoise;
uniform float uSnowIntensity;
uniform float uSnowAnisotropy;
uniform float uChromaPhaseError;
uniform float uChromaPhaseNoise;
uniform float uChromaLoss;
uniform float uChromaVertBlend;
uniform float uRinging;
uniform float uSharpen;
uniform float uCompositePreemphasis;

/* --- head switching (the torn band at the bottom of a VHS frame) --- */
uniform float uHeadSwitchingHeight;  // rows affected
uniform float uHeadSwitchingOffset;  // rows up from the bottom
uniform float uHeadSwitchingShift;   // horizontal displacement, texels

/* --- tracking noise band --- */
uniform float uTrackingHeight;
uniform float uTrackingWave;
uniform float uTrackingNoise;
uniform float uTrackingSnow;

/* --- VHS edge wave (per-row horizontal wobble) --- */
uniform float uEdgeWaveIntensity;
uniform float uEdgeWaveSpeed;
uniform float uEdgeWaveFrequency;

/* --- display --- */
uniform float uScanlineDarken;
uniform float uVignette;
uniform float uSaturation;
uniform float uBrightness;

const float PI = 3.14159265359;

/* ------------------------------------------------------------------ hashing */

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/* Value-noise fBm over a single axis. Stands in for the simplex fBm ntsc-rs
   uses to drive the edge wave; one dimension is enough because the shift is
   constant across a row by construction. */
float vnoise(float x) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash11(i), hash11(i + 1.0), f) * 2.0 - 1.0;
}

float fbm(float x) {
  float sum = 0.0;
  float amp = 1.0;
  float freq = 1.0;
  for (int i = 0; i < 4; i++) {
    sum += vnoise(x * freq) * amp;
    amp *= 0.707;   // gain = 1/sqrt(2), matching ntsc-rs
    freq *= 2.0;    // lacunarity = 2
  }
  return sum;
}

/* ------------------------------------------------------------------- colour */

vec3 rgb2yiq(vec3 c) {
  return vec3(
    dot(c, vec3( 0.299,  0.587,  0.114)),
    dot(c, vec3( 0.5959, -0.2746, -0.3213)),
    dot(c, vec3( 0.2115, -0.5227,  0.3112))
  );
}

vec3 yiq2rgb(vec3 c) {
  return vec3(
    c.x + 0.956 * c.y + 0.619 * c.z,
    c.x - 0.272 * c.y - 0.647 * c.z,
    c.x - 1.106 * c.y + 1.703 * c.z
  );
}

/* ------------------------------------------------- geometric row distortion */

/* Every horizontal displacement that ntsc-rs applies by shifting a row buffer
   is folded into one offset here, applied when sampling instead. */
float rowShift(float row) {
  float shift = 0.0;

  // -- vhs_edge_wave --
  if (uEdgeWaveIntensity > 0.0) {
    float n = fbm(row * uEdgeWaveFrequency + uFrame * uEdgeWaveSpeed + uSeed);
    shift += n * uEdgeWaveIntensity;
  }

  // -- head_switching: the last few rows tear progressively harder --
  float fromBottom = uResolution.y - row - uHeadSwitchingOffset;
  if (uHeadSwitchingHeight > 0.0 && fromBottom >= 0.0 && fromBottom < uHeadSwitchingHeight) {
    float t = 1.0 - fromBottom / uHeadSwitchingHeight;
    shift += t * t * uHeadSwitchingShift;
  }

  // -- tracking_noise: a wobbling band, drifting up the frame over time --
  if (uTrackingHeight > 0.0) {
    float bandTop = uResolution.y - uTrackingHeight
                  - mod(uFrame * 1.7 + uSeed * 13.0, uResolution.y * 0.9);
    float d = row - bandTop;
    if (d >= 0.0 && d < uTrackingHeight) {
      float t = d / uTrackingHeight;
      float env = sin(t * PI);                       // fade in and out of the band
      shift += (hash11(row + uFrame * 0.37) * 2.0 - 1.0) * uTrackingWave * env;
    }
  }

  return shift;
}

float trackingBandEnvelope(float row) {
  if (uTrackingHeight <= 0.0) return 0.0;
  float bandTop = uResolution.y - uTrackingHeight
                - mod(uFrame * 1.7 + uSeed * 13.0, uResolution.y * 0.9);
  float d = row - bandTop;
  if (d < 0.0 || d >= uTrackingHeight) return 0.0;
  return sin((d / uTrackingHeight) * PI);
}

/* ------------------------------------------------------------- band-limiting */

/* One-sided exponential taps. A causal one-pole lowpass run left-to-right over
   a scanline smears energy rightward, so sampling backwards along -x with
   exp(-i/radius) weights reproduces that smear without needing a sequential
   pass. This is the VHS "drag" behind bright edges. */
vec3 smearYiq(vec2 uv, float row, float radius, float extraDelay) {
  if (radius < 0.35 && extraDelay == 0.0) {
    vec2 p = vec2(uv.x + rowShift(row) / uResolution.x, uv.y);
    return rgb2yiq(texture(uSrc, p).rgb);
  }

  float texel = 1.0 / uResolution.x;
  float shift = rowShift(row) * texel;
  vec3 acc = vec3(0.0);
  float wsum = 0.0;

  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float w = exp(-fi / max(radius, 0.35));
    vec2 p = vec2(uv.x + shift - (fi + extraDelay) * texel, uv.y);
    acc += rgb2yiq(texture(uSrc, clamp(p, vec2(0.0005), vec2(0.9995))).rgb) * w;
    wsum += w;
  }
  return acc / wsum;
}

void main() {
  vec2 uv = vUv;
  float row = floor(uv.y * uResolution.y);
  float col = uv.x * uResolution.x;
  float texelY = 1.0 / uResolution.y;

  /* ---- luma_filter + composite_chroma_lowpass_in -------------------------
     Luma and chroma are band-limited independently and at wildly different
     rates: that ratio is the single most recognisable property of VHS. */
  vec3 lumaSample   = smearYiq(uv, row, uLumaRadius, 0.0);
  vec3 chromaSample = smearYiq(uv, row, uChromaRadius, uChromaDelay);

  float y = lumaSample.x;
  vec2  iq = chromaSample.yz;

  /* ---- chroma_delay (vertical component) ---- */
  if (uChromaDelayV > 0.0) {
    vec2 uvUp = vec2(uv.x, uv.y - uChromaDelayV * texelY);
    iq = smearYiq(uvUp, row - uChromaDelayV, uChromaRadius, uChromaDelay).yz;
  }

  /* ---- chroma_vert_blend: average each chroma line with the one above ---- */
  if (uChromaVertBlend > 0.0) {
    vec2 uvUp = vec2(uv.x, uv.y - texelY);
    vec2 iqUp = smearYiq(uvUp, row - 1.0, uChromaRadius, uChromaDelay).yz;
    iq = mix(iq, (iq + iqUp) * 0.5, uChromaVertBlend);
  }

  /* ---- chroma_into_luma / luma_into_chroma -------------------------------
     ntsc-rs modulates chroma up onto the subcarrier, mixes it into luma, then
     demodulates it back out. The residue left by that round trip is what you
     see as dot crawl (chroma leaking into luma) and rainbow fringing (luma
     leaking into chroma). Both are reproduced here directly from the residue
     rather than by running the full modulation cycle. */
  float phase = (col * 0.5 + row * uScanlinePhase + uFrame * 0.5) * PI;
  float cp = cos(phase);
  float sp = sin(phase);

  if (uChromaIntoLuma > 0.0) {
    y += (iq.x * cp + iq.y * sp) * uChromaIntoLuma;
  }

  if (uLumaIntoChroma > 0.0) {
    // High-frequency luma is what actually beats against the subcarrier, so
    // isolate it against a broader blur before letting it bleed into chroma.
    float texel = 1.0 / uResolution.x;
    float broad = 0.0;
    for (int i = -3; i <= 3; i++) {
      broad += rgb2yiq(texture(uSrc, vec2(uv.x + float(i) * texel, uv.y)).rgb).x;
    }
    broad /= 7.0;
    float hf = y - broad;
    iq += vec2(hf * cp, hf * sp) * uLumaIntoChroma;
  }

  /* ---- composite_sharpening (pre-emphasis) and vhs sharpen ---- */
  if (uCompositePreemphasis != 0.0 || uSharpen != 0.0) {
    float texel = 1.0 / uResolution.x;
    float soft = 0.0;
    for (int i = -4; i <= 4; i++) {
      soft += rgb2yiq(texture(uSrc, vec2(uv.x + float(i) * texel, uv.y)).rgb).x;
    }
    soft /= 9.0;
    y += (y - soft) * (uCompositePreemphasis + uSharpen);
  }

  /* ---- ringing: the overshoot/undershoot skirt of a notch filter ---- */
  if (uRinging > 0.0) {
    float texel = 1.0 / uResolution.x;
    float ring = 0.0;
    // A short oscillating kernel: the impulse response of a resonant notch.
    for (int i = 1; i <= 6; i++) {
      float fi = float(i);
      float w = cos(fi * 1.9) * exp(-fi * 0.35);
      ring += rgb2yiq(texture(uSrc, vec2(uv.x - fi * texel, uv.y)).rgb).x * w;
    }
    y += ring * uRinging * 0.35;
  }

  /* ---- chroma_phase_error / chroma_phase_noise --------------------------
     A constant hue rotation plus a per-row random one: the reason VHS colour
     drifts from line to line. */
  float rot = uChromaPhaseError * PI;
  if (uChromaPhaseNoise > 0.0) {
    rot += (hash11(row * 7.31 + uFrame * 3.7 + uSeed) * 2.0 - 1.0) * uChromaPhaseNoise * PI;
  }
  if (rot != 0.0) {
    float cr = cos(rot), sr = sin(rot);
    iq = vec2(iq.x * cr - iq.y * sr, iq.x * sr + iq.y * cr);
  }

  /* ---- chroma_loss: whole rows drop their colour ---- */
  if (uChromaLoss > 0.0) {
    if (hash11(row * 3.77 + floor(uFrame) * 11.3 + uSeed) < uChromaLoss) {
      iq = vec2(0.0);
    }
  }

  /* ---- composite_noise / luma_noise / chroma_noise ---- */
  float n1 = hash21(vec2(col, row) + uFrame * 1.37 + uSeed) - 0.5;
  float n2 = hash21(vec2(col * 1.7, row * 2.3) + uFrame * 2.11 + uSeed) - 0.5;

  // Composite noise is correlated along a row, because it rides on the signal.
  float rowNoise = (hash11(row * 1.13 + uFrame * 0.91 + uSeed) - 0.5);
  y += rowNoise * uCompositeNoise * 0.6 + n1 * uCompositeNoise;
  y += n1 * uLumaNoise;
  iq += vec2(n1, n2) * uChromaNoise;

  float band = trackingBandEnvelope(row);
  if (band > 0.0) {
    y += (n1 + n2) * uTrackingNoise * band;
  }

  /* ---- snow / row_speckles: sparse blown-out dropouts, stretched
          horizontally because the head smears them along the scan ---- */
  float snowAmount = uSnowIntensity + uTrackingSnow * band;
  if (snowAmount > 0.0) {
    float stretch = mix(1.0, 24.0, clamp(uSnowAnisotropy, 0.0, 1.0));
    float s = hash21(vec2(floor(col / stretch), row) + floor(uFrame) * 17.0 + uSeed);
    if (s > 1.0 - snowAmount) {
      float intensity = hash21(vec2(row, floor(col / stretch)) + uFrame);
      y = mix(y, 0.6 + intensity * 0.6, 0.85);
      iq *= 0.15;
    }
  }

  /* ---- composite_chroma_lowpass_out ---- */
  iq *= uSaturation;

  vec3 rgb = yiq2rgb(vec3(y, iq));

  /* ---- display: scanlines and vignette. Not part of the signal chain, but
          the CRT it lands on is part of the look. ---- */
  if (uScanlineDarken > 0.0) {
    float sl = 1.0 - uScanlineDarken * step(1.0, mod(row, 2.0));
    rgb *= sl;
  }
  if (uVignette > 0.0) {
    vec2 d = uv - 0.5;
    rgb *= 1.0 - uVignette * dot(d, d) * 2.2;
  }

  rgb *= uBrightness;
  fragColor = vec4(clamp(rgb, 0.0, 1.0), 1.0);
}
`;
