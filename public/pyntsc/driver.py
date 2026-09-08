"""
Glue between the browser and the upstream NTSC emulator.

Everything that actually models the signal lives in ntsc.py, which is the
upstream source. This module only marshals pixels in and out and maps a plain
settings dict onto the Ntsc object's fields.
"""

import json

import numpy as np

import ntsc
from ntsc import Ntsc, NumpyRandom, VHSSpeed, random_ntsc

_STATE = {"ntsc": None, "seed": 0}


def _as_bytes(obj) -> bytes:
    """Accept a frame from JS however Pyodide chose to hand it over.

    Depending on the conversion path a JS Uint8Array arrives as a buffer-protocol
    object, a proxy with to_bytes(), or one with to_py(). Rather than depend on
    which, take whichever is available.
    """
    if isinstance(obj, (bytes, bytearray, memoryview)):
        return obj
    for attr in ("to_bytes", "to_py"):
        fn = getattr(obj, attr, None)
        if fn is not None:
            return fn()
    return bytes(obj)

_TAPE_SPEEDS = {
    "SP": VHSSpeed.VHS_SP,
    "LP": VHSSpeed.VHS_LP,
    "EP": VHSSpeed.VHS_EP,
}

# Settings dict key -> attribute on Ntsc. Names match the upstream fields so the
# GUI, this table and ntsc.py all read the same.
_FIELDS = [
    "composite_preemphasis",
    "composite_preemphasis_cut",
    "vhs_out_sharpen",
    "vhs_edge_wave",
    "vhs_head_switching",
    "color_bleed_before",
    "color_bleed_horiz",
    "color_bleed_vert",
    "ringing",
    "enable_ringing2",
    "ringing_power",
    "ringing_shift",
    "freq_noise_size",
    "freq_noise_amplitude",
    "composite_in_chroma_lowpass",
    "composite_out_chroma_lowpass",
    "composite_out_chroma_lowpass_lite",
    "video_chroma_noise",
    "video_chroma_phase_noise",
    "video_chroma_loss",
    "video_noise",
    "subcarrier_amplitude",
    "subcarrier_amplitude_back",
    "emulating_vhs",
    "nocolor_subcarrier",
    "vhs_chroma_vert_blend",
    "vhs_svideo_out",
    "output_ntsc",
    "video_scanline_phase_shift",
    "video_scanline_phase_shift_offset",
]

_INT_FIELDS = {
    "vhs_edge_wave",
    "color_bleed_horiz",
    "color_bleed_vert",
    "ringing_power",
    "video_chroma_noise",
    "video_chroma_phase_noise",
    "video_chroma_loss",
    "video_noise",
    "subcarrier_amplitude",
    "subcarrier_amplitude_back",
    "video_scanline_phase_shift",
    "video_scanline_phase_shift_offset",
}

_BOOL_FIELDS = {
    "vhs_head_switching",
    "color_bleed_before",
    "enable_ringing2",
    "composite_in_chroma_lowpass",
    "composite_out_chroma_lowpass",
    "composite_out_chroma_lowpass_lite",
    "emulating_vhs",
    "nocolor_subcarrier",
    "vhs_chroma_vert_blend",
    "vhs_svideo_out",
    "output_ntsc",
}


def configure(settings_json: str) -> str:
    """Build an Ntsc from a settings dict. Returns the settings actually applied."""
    s = json.loads(settings_json)
    seed = int(s.get("seed", 0))

    n = Ntsc(precise=bool(s.get("precise", False)), random=NumpyRandom(seed))

    for key in _FIELDS:
        if key not in s:
            continue
        value = s[key]
        if key in _BOOL_FIELDS:
            value = bool(value)
        elif key in _INT_FIELDS:
            value = int(value)
        else:
            value = float(value)
        setattr(n, "_" + key, value)

    n._output_vhs_tape_speed = _TAPE_SPEEDS.get(s.get("tape_speed", "SP"), VHSSpeed.VHS_SP)

    _STATE["ntsc"] = n
    _STATE["seed"] = seed
    return dump_settings()


def randomize(seed: int) -> str:
    """Use the upstream random_ntsc(), which samples every parameter."""
    n = random_ntsc(int(seed))
    _STATE["ntsc"] = n
    _STATE["seed"] = int(seed)
    return dump_settings()


def dump_settings() -> str:
    n = _STATE["ntsc"]
    if n is None:
        return "{}"
    out = {}
    for key in _FIELDS:
        value = getattr(n, "_" + key)
        if isinstance(value, (np.integer,)):
            value = int(value)
        elif isinstance(value, (np.floating,)):
            value = float(value)
        out[key] = value
    for name, speed in _TAPE_SPEEDS.items():
        if n._output_vhs_tape_speed is speed:
            out["tape_speed"] = name
            break
    out["seed"] = _STATE["seed"]
    out["precise"] = n.precise
    return json.dumps(out)


def process_frame(rgba: bytes, width: int, height: int, fieldno: int) -> bytes:
    """One RGBA frame in, one RGBA frame out.

    fieldno advances two per frame so the colour subcarrier phase moves between
    frames — that motion is what turns static dot crawl into crawling dots.
    """
    n = _STATE["ntsc"]
    if n is None:
        raise RuntimeError("configure() must be called before process_frame()")

    src = np.frombuffer(_as_bytes(rgba), dtype=np.uint8).reshape(height, width, 4)
    # Upstream works in BGR, the same convention OpenCV uses.
    bgr = np.ascontiguousarray(src[:, :, ::-1][:, :, 1:])
    dst = bgr.copy()

    n.composite_layer(dst, bgr, field=0, fieldno=int(fieldno))
    n.composite_layer(dst, bgr, field=1, fieldno=int(fieldno) + 1)

    out = np.empty((height, width, 4), dtype=np.uint8)
    out[:, :, 0] = dst[:, :, 2]
    out[:, :, 1] = dst[:, :, 1]
    out[:, :, 2] = dst[:, :, 0]
    out[:, :, 3] = 255
    return out.tobytes()


def upstream_defaults() -> str:
    """The unmodified upstream defaults, for the GUI's reset button."""
    n = Ntsc(random=NumpyRandom(0))
    _saved = _STATE["ntsc"]
    _STATE["ntsc"] = n
    try:
        return dump_settings()
    finally:
        _STATE["ntsc"] = _saved
