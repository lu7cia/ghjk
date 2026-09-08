/**
 * Settings for the upstream NTSC emulator.
 *
 * Field names match the attributes on the `Ntsc` class in ntsc.py exactly
 * (minus the leading underscore), so the GUI, the driver's field table and the
 * upstream source can all be read against each other.
 */

export type TapeSpeed = 'SP' | 'LP' | 'EP';

export interface NtscParams {
  seed: number;
  /** Upstream's slow-but-bit-exact code path for the noise generators. */
  precise: boolean;

  composite_preemphasis: number;        // 0..8
  composite_preemphasis_cut: number;    // Hz
  vhs_out_sharpen: number;              // 1..5
  vhs_edge_wave: number;                // 0..10
  vhs_head_switching: boolean;

  color_bleed_before: boolean;
  color_bleed_horiz: number;            // 0..10
  color_bleed_vert: number;             // 0..10

  ringing: number;                      // 1 = off, 0.3..0.99 sane
  enable_ringing2: boolean;
  ringing_power: number;                // 2..7
  ringing_shift: number;
  freq_noise_size: number;              // 0..1
  freq_noise_amplitude: number;         // 0..5

  composite_in_chroma_lowpass: boolean;
  composite_out_chroma_lowpass: boolean;
  composite_out_chroma_lowpass_lite: boolean;

  video_chroma_noise: number;           // 0..16384
  video_chroma_phase_noise: number;     // 0..50
  video_chroma_loss: number;            // 0..100000
  video_noise: number;                  // 0..4200

  subcarrier_amplitude: number;
  subcarrier_amplitude_back: number;

  emulating_vhs: boolean;
  nocolor_subcarrier: boolean;
  vhs_chroma_vert_blend: boolean;
  vhs_svideo_out: boolean;
  output_ntsc: boolean;

  video_scanline_phase_shift: number;   // 0 | 90 | 180 | 270
  video_scanline_phase_shift_offset: number; // 0..3

  tape_speed: TapeSpeed;
}

/** Upstream `Ntsc.__init__` defaults, mirrored so the GUI can start somewhere. */
export const UPSTREAM_DEFAULTS: NtscParams = {
  seed: 0,
  precise: false,
  composite_preemphasis: 0,
  composite_preemphasis_cut: 1_000_000,
  vhs_out_sharpen: 1.5,
  vhs_edge_wave: 0,
  vhs_head_switching: false,
  color_bleed_before: true,
  color_bleed_horiz: 0,
  color_bleed_vert: 0,
  ringing: 1.0,
  enable_ringing2: false,
  ringing_power: 2,
  ringing_shift: 0,
  freq_noise_size: 0,
  freq_noise_amplitude: 2,
  composite_in_chroma_lowpass: true,
  composite_out_chroma_lowpass: true,
  composite_out_chroma_lowpass_lite: true,
  video_chroma_noise: 0,
  video_chroma_phase_noise: 0,
  video_chroma_loss: 0,
  video_noise: 2,
  subcarrier_amplitude: 50,
  subcarrier_amplitude_back: 50,
  emulating_vhs: false,
  nocolor_subcarrier: false,
  vhs_chroma_vert_blend: true,
  vhs_svideo_out: false,
  output_ntsc: true,
  video_scanline_phase_shift: 180,
  video_scanline_phase_shift_offset: 0,
  tape_speed: 'SP',
};

const vhsBase: Partial<NtscParams> = {
  emulating_vhs: true,
  vhs_head_switching: true,
  vhs_chroma_vert_blend: true,
};

export const PARAM_PRESETS: Record<string, NtscParams> = {
  'BROADCAST': {
    ...UPSTREAM_DEFAULTS,
    video_noise: 300,
    video_chroma_noise: 600,
    ringing: 0.85,
    composite_preemphasis: 1.0,
  },

  'VHS SP': {
    ...UPSTREAM_DEFAULTS, ...vhsBase,
    tape_speed: 'SP',
    video_noise: 600,
    video_chroma_noise: 1600,
    video_chroma_phase_noise: 2,
    video_chroma_loss: 800,
    vhs_edge_wave: 2,
    vhs_out_sharpen: 1.8,
    ringing: 0.8,
    color_bleed_horiz: 1,
  },

  'VHS EP': {
    ...UPSTREAM_DEFAULTS, ...vhsBase,
    tape_speed: 'EP',
    video_noise: 1400,
    video_chroma_noise: 4200,
    video_chroma_phase_noise: 6,
    video_chroma_loss: 6000,
    vhs_edge_wave: 4,
    vhs_out_sharpen: 2.4,
    ringing: 0.6,
    freq_noise_size: 0.7,
    freq_noise_amplitude: 1.2,
    color_bleed_horiz: 3,
    color_bleed_vert: 1,
    composite_preemphasis: 2.0,
  },

  'CAMCORDER': {
    ...UPSTREAM_DEFAULTS, ...vhsBase,
    tape_speed: 'LP',
    video_noise: 2200,
    video_chroma_noise: 3000,
    video_chroma_phase_noise: 4,
    video_chroma_loss: 1500,
    vhs_edge_wave: 1,
    vhs_out_sharpen: 3.2,
    ringing: 0.7,
    composite_preemphasis: 3.5,
  },

  'THIRD GEN DUB': {
    ...UPSTREAM_DEFAULTS, ...vhsBase,
    tape_speed: 'EP',
    video_noise: 2600,
    video_chroma_noise: 9000,
    video_chroma_phase_noise: 14,
    video_chroma_loss: 22000,
    vhs_edge_wave: 6,
    vhs_out_sharpen: 2.0,
    ringing: 0.45,
    enable_ringing2: true,
    ringing_power: 4,
    freq_noise_size: 0.85,
    freq_noise_amplitude: 1.8,
    color_bleed_horiz: 6,
    color_bleed_vert: 2,
    composite_preemphasis: 5.0,
    video_scanline_phase_shift: 90,
  },

  'DEAD CHANNEL': {
    ...UPSTREAM_DEFAULTS, ...vhsBase,
    tape_speed: 'EP',
    video_noise: 4200,
    video_chroma_noise: 16000,
    video_chroma_phase_noise: 40,
    video_chroma_loss: 70000,
    vhs_edge_wave: 10,
    vhs_out_sharpen: 4.5,
    ringing: 0.35,
    enable_ringing2: true,
    ringing_power: 6,
    freq_noise_size: 0.95,
    freq_noise_amplitude: 2.5,
    color_bleed_horiz: 8,
    color_bleed_vert: 3,
    composite_preemphasis: 8.0,
    video_scanline_phase_shift: 270,
  },

  'NO COLOUR': {
    ...UPSTREAM_DEFAULTS, ...vhsBase,
    tape_speed: 'EP',
    nocolor_subcarrier: true,
    video_noise: 1800,
    vhs_edge_wave: 3,
    ringing: 0.6,
  },
};

export const PARAM_PRESET_NAMES = Object.keys(PARAM_PRESETS);

/** Everything the GUI renders, grouped and bounded. */
export interface ParamSpec {
  key: keyof NtscParams;
  label: string;
  kind: 'slider' | 'toggle' | 'choice';
  min?: number;
  max?: number;
  step?: number;
  choices?: (string | number)[];
  hint?: string;
}

export interface ParamGroup {
  name: string;
  specs: ParamSpec[];
}

export const PARAM_GROUPS: ParamGroup[] = [
  {
    name: 'TAPE',
    specs: [
      { key: 'emulating_vhs', label: 'Emulate VHS', kind: 'toggle', hint: 'Adds the tape stage on top of composite encoding.' },
      { key: 'tape_speed', label: 'Tape speed', kind: 'choice', choices: ['SP', 'LP', 'EP'], hint: 'Slower speed, less bandwidth. EP is the third-gen look.' },
      { key: 'vhs_out_sharpen', label: 'Head sharpen', kind: 'slider', min: 1, max: 5, step: 0.1 },
      { key: 'vhs_edge_wave', label: 'Edge wave', kind: 'slider', min: 0, max: 10, step: 1, hint: 'Horizontal wobble per scanline.' },
      { key: 'vhs_head_switching', label: 'Head switching', kind: 'toggle', hint: 'The torn band at the bottom of the frame.' },
      { key: 'vhs_chroma_vert_blend', label: 'Chroma vert blend', kind: 'toggle' },
      { key: 'vhs_svideo_out', label: 'S-Video out', kind: 'toggle', hint: 'Skips re-encoding to composite on the way out.' },
    ],
  },
  {
    name: 'NOISE',
    specs: [
      { key: 'video_noise', label: 'Luma noise', kind: 'slider', min: 0, max: 4200, step: 10 },
      { key: 'video_chroma_noise', label: 'Chroma noise', kind: 'slider', min: 0, max: 16384, step: 64 },
      { key: 'video_chroma_phase_noise', label: 'Chroma phase noise', kind: 'slider', min: 0, max: 50, step: 1, hint: 'Hue drifting line to line.' },
      { key: 'video_chroma_loss', label: 'Chroma loss', kind: 'slider', min: 0, max: 100000, step: 500, hint: 'Odds of a scanline dropping colour entirely.' },
    ],
  },
  {
    name: 'RINGING',
    specs: [
      { key: 'ringing', label: 'Ringing', kind: 'slider', min: 0.3, max: 1, step: 0.01, hint: '1 is off. Lower rings harder.' },
      { key: 'enable_ringing2', label: 'Pattern ringing', kind: 'toggle', hint: 'Uses the measured ring pattern instead.' },
      { key: 'ringing_power', label: 'Pattern power', kind: 'slider', min: 2, max: 7, step: 1 },
      { key: 'ringing_shift', label: 'Pattern shift', kind: 'slider', min: 0, max: 1, step: 0.01 },
      { key: 'freq_noise_size', label: 'Freq noise size', kind: 'slider', min: 0, max: 0.99, step: 0.01 },
      { key: 'freq_noise_amplitude', label: 'Freq noise amp', kind: 'slider', min: 0, max: 5, step: 0.1 },
    ],
  },
  {
    name: 'COLOUR BLEED',
    specs: [
      { key: 'color_bleed_horiz', label: 'Horizontal', kind: 'slider', min: 0, max: 10, step: 1 },
      { key: 'color_bleed_vert', label: 'Vertical', kind: 'slider', min: 0, max: 10, step: 1 },
      { key: 'color_bleed_before', label: 'Bleed first', kind: 'toggle', hint: 'Before the other degradations, or after.' },
    ],
  },
  {
    name: 'COMPOSITE',
    specs: [
      { key: 'composite_preemphasis', label: 'Pre-emphasis', kind: 'slider', min: 0, max: 8, step: 0.1 },
      { key: 'composite_preemphasis_cut', label: 'Pre-emph cutoff', kind: 'slider', min: 100000, max: 4000000, step: 50000 },
      { key: 'subcarrier_amplitude', label: 'Subcarrier in', kind: 'slider', min: 0, max: 100, step: 1 },
      { key: 'subcarrier_amplitude_back', label: 'Subcarrier out', kind: 'slider', min: 0, max: 100, step: 1 },
      { key: 'video_scanline_phase_shift', label: 'Phase shift', kind: 'choice', choices: [0, 90, 180, 270] },
      { key: 'video_scanline_phase_shift_offset', label: 'Phase offset', kind: 'slider', min: 0, max: 3, step: 1 },
      { key: 'composite_in_chroma_lowpass', label: 'Chroma LP in', kind: 'toggle' },
      { key: 'composite_out_chroma_lowpass', label: 'Chroma LP out', kind: 'toggle' },
      { key: 'composite_out_chroma_lowpass_lite', label: 'Chroma LP out lite', kind: 'toggle' },
      { key: 'nocolor_subcarrier', label: 'Kill colour', kind: 'toggle', hint: 'Encode the subcarrier but never decode it back.' },
      { key: 'output_ntsc', label: 'NTSC', kind: 'toggle' },
    ],
  },
];
