/**
 * Effect presets, expressed in the same terms ntsc-rs uses so they can be
 * checked against upstream. Cutoff frequencies are converted to shader-space
 * blur radii here, on the CPU, so the GLSL never has to know about hertz.
 */

/** NTSC_RATE from crates/ntscrs/src/ntsc.rs — four times the colour subcarrier. */
export const NTSC_RATE = (315_000_000 / 88) * 4; // 14.318 MHz

/** Samples in one active line at NTSC_RATE (52.6 microseconds of active video). */
const ACTIVE_LINE_SAMPLES = 754;

/**
 * A one-pole lowpass at cutoff `fc`, sampled at `NTSC_RATE`, has a time
 * constant of rate / (2*pi*fc) samples. Rescale that into texels for the
 * width we are actually processing at.
 */
export function cutoffToRadius(cutoffHz: number, width: number): number {
  const tauSamples = NTSC_RATE / (2 * Math.PI * cutoffHz);
  return tauSamples * (width / ACTIVE_LINE_SAMPLES);
}

/** ntsc-rs VHSTapeSpeed::filter_params (crates/ntscrs/src/settings/standard.rs). */
export const TAPE_SPEEDS = {
  SP: { lumaCut: 2_400_000, chromaCut: 320_000, chromaDelay: 4 },
  LP: { lumaCut: 1_900_000, chromaCut: 300_000, chromaDelay: 5 },
  EP: { lumaCut: 1_400_000, chromaCut: 280_000, chromaDelay: 6 },
} as const;

export type TapeSpeed = keyof typeof TAPE_SPEEDS;

export interface NtscSettings {
  /** Height the signal is processed at. Lower is grubbier and much faster. */
  processingHeight: number;
  tapeSpeed: TapeSpeed | null;
  chromaDelayVertical: number;

  chromaIntoLuma: number;
  lumaIntoChroma: number;
  scanlinePhase: number;

  compositeNoise: number;
  lumaNoise: number;
  chromaNoise: number;
  snowIntensity: number;
  snowAnisotropy: number;
  chromaPhaseError: number;
  chromaPhaseNoise: number;
  chromaLoss: number;
  chromaVertBlend: number;
  ringing: number;
  sharpen: number;
  compositePreemphasis: number;

  headSwitchingHeight: number;
  headSwitchingOffset: number;
  headSwitchingShift: number;

  trackingHeight: number;
  trackingWave: number;
  trackingNoise: number;
  trackingSnow: number;

  edgeWaveIntensity: number;
  edgeWaveSpeed: number;
  edgeWaveFrequency: number;

  scanlineDarken: number;
  vignette: number;
  saturation: number;
  brightness: number;
}

const BASE: NtscSettings = {
  processingHeight: 240,
  tapeSpeed: 'SP',
  chromaDelayVertical: 0,
  chromaIntoLuma: 0.06,
  lumaIntoChroma: 0.12,
  scanlinePhase: 1.0,
  compositeNoise: 0.012,
  lumaNoise: 0.01,
  chromaNoise: 0.02,
  snowIntensity: 0.0006,
  snowAnisotropy: 0.6,
  chromaPhaseError: 0.0,
  chromaPhaseNoise: 0.008,
  chromaLoss: 0.0,
  chromaVertBlend: 1.0,
  ringing: 0.25,
  sharpen: 0.2,
  compositePreemphasis: 0.0,
  headSwitchingHeight: 8,
  headSwitchingOffset: 0,
  headSwitchingShift: 22,
  trackingHeight: 0,
  trackingWave: 0,
  trackingNoise: 0,
  trackingSnow: 0,
  edgeWaveIntensity: 0.7,
  edgeWaveSpeed: 0.6,
  edgeWaveFrequency: 0.06,
  scanlineDarken: 0.12,
  vignette: 0.35,
  saturation: 1.0,
  brightness: 1.0,
};

export const PRESETS: Record<string, NtscSettings> = {
  'CLEAN': {
    ...BASE,
    processingHeight: 480,
    tapeSpeed: null,
    chromaIntoLuma: 0,
    lumaIntoChroma: 0,
    compositeNoise: 0,
    lumaNoise: 0,
    chromaNoise: 0,
    snowIntensity: 0,
    chromaPhaseNoise: 0,
    chromaVertBlend: 0,
    ringing: 0,
    sharpen: 0,
    headSwitchingHeight: 0,
    edgeWaveIntensity: 0,
    scanlineDarken: 0,
    vignette: 0,
  },

  'BROADCAST': {
    ...BASE,
    processingHeight: 480,
    tapeSpeed: null,
    chromaIntoLuma: 0.10,
    lumaIntoChroma: 0.22,
    compositeNoise: 0.008,
    chromaNoise: 0.012,
    ringing: 0.45,
    compositePreemphasis: 0.12,
    headSwitchingHeight: 0,
    edgeWaveIntensity: 0,
    chromaVertBlend: 0,
    scanlineDarken: 0.08,
    vignette: 0.25,
  },

  'VHS SP': { ...BASE },

  'VHS EP': {
    ...BASE,
    processingHeight: 200,
    tapeSpeed: 'EP',
    chromaDelayVertical: 1,
    chromaIntoLuma: 0.10,
    lumaIntoChroma: 0.20,
    compositeNoise: 0.035,
    lumaNoise: 0.03,
    chromaNoise: 0.06,
    snowIntensity: 0.004,
    chromaPhaseNoise: 0.03,
    chromaLoss: 0.02,
    ringing: 0.4,
    sharpen: 0.35,
    headSwitchingHeight: 16,
    headSwitchingShift: 46,
    edgeWaveIntensity: 2.2,
    edgeWaveSpeed: 0.9,
    saturation: 0.85,
    scanlineDarken: 0.16,
  },

  'CAMCORDER': {
    ...BASE,
    processingHeight: 240,
    tapeSpeed: 'LP',
    chromaIntoLuma: 0.05,
    lumaIntoChroma: 0.14,
    compositeNoise: 0.05,
    lumaNoise: 0.045,
    chromaNoise: 0.05,
    snowIntensity: 0.001,
    chromaPhaseNoise: 0.02,
    ringing: 0.3,
    sharpen: 0.45,
    headSwitchingHeight: 10,
    edgeWaveIntensity: 1.1,
    edgeWaveSpeed: 1.4,
    saturation: 1.15,
    brightness: 1.05,
    vignette: 0.5,
  },

  'THIRD GEN DUB': {
    ...BASE,
    processingHeight: 180,
    tapeSpeed: 'EP',
    chromaDelayVertical: 2,
    chromaIntoLuma: 0.16,
    lumaIntoChroma: 0.30,
    compositeNoise: 0.07,
    lumaNoise: 0.05,
    chromaNoise: 0.10,
    snowIntensity: 0.012,
    snowAnisotropy: 0.85,
    chromaPhaseError: 0.04,
    chromaPhaseNoise: 0.07,
    chromaLoss: 0.07,
    ringing: 0.5,
    sharpen: 0.25,
    headSwitchingHeight: 22,
    headSwitchingShift: 70,
    trackingHeight: 26,
    trackingWave: 9,
    trackingNoise: 0.16,
    trackingSnow: 0.05,
    edgeWaveIntensity: 3.4,
    edgeWaveSpeed: 1.1,
    saturation: 0.7,
    brightness: 0.95,
    scanlineDarken: 0.2,
    vignette: 0.55,
  },

  'DEAD CHANNEL': {
    ...BASE,
    processingHeight: 160,
    tapeSpeed: 'EP',
    chromaDelayVertical: 3,
    chromaIntoLuma: 0.3,
    lumaIntoChroma: 0.45,
    compositeNoise: 0.16,
    lumaNoise: 0.12,
    chromaNoise: 0.2,
    snowIntensity: 0.09,
    snowAnisotropy: 0.95,
    chromaPhaseError: 0.12,
    chromaPhaseNoise: 0.2,
    chromaLoss: 0.28,
    ringing: 0.6,
    headSwitchingHeight: 40,
    headSwitchingShift: 120,
    trackingHeight: 60,
    trackingWave: 26,
    trackingNoise: 0.4,
    trackingSnow: 0.2,
    edgeWaveIntensity: 7.0,
    edgeWaveSpeed: 2.2,
    saturation: 0.45,
    brightness: 0.9,
    scanlineDarken: 0.25,
    vignette: 0.7,
  },
};

export const PRESET_NAMES = Object.keys(PRESETS);
