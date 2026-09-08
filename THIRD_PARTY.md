# Third-party code and attribution

## NTSC video emulator (the video pipeline)

The video effect is the **upstream Python NTSC emulator**, running unmodified in
the browser under Pyodide. It lives in `public/pyntsc/ntsc.py`.

Upstream is a Python 3.6 rewrite of
[joncampbell123/composite-video-simulator](https://github.com/joncampbell123/composite-video-simulator),
written for analog-artifact-removal research. `public/pyntsc/UPSTREAM_README.md`
is upstream's own documentation of the artifacts it models, kept verbatim.

This is not a reimplementation or an approximation. `Ntsc.composite_layer` is
called directly, per field, per frame. Everything the GUI exposes is a real
attribute on that class.

### Changes made to ntsc.py

The source is otherwise untouched. Every change is marked with a `ghjk:` comment
and exists only because upstream targeted numpy 1.x, while Pyodide ships
numpy 2.4:

| Change | Why |
| --- | --- |
| `np.float` → `np.float64` | The alias was removed in numpy 1.24. |
| `from scipy.ndimage.interpolation import shift` → `from scipy.ndimage import shift` | Moved in scipy 1.10. |
| `_wrap_i32` / `_wrap_u32` helpers, used in `XorWowRandom` and `vhs_head_switching` | numpy 1.x silently wrapped out-of-range values into fixed-width integers; numpy 2 raises `OverflowError`. The helpers reproduce the original C-style wraparound exactly, so the RNG sequence and the head-switching maths are unchanged. |

No filter, coefficient, or algorithm was altered.

`public/pyntsc/driver.py` is ours, not upstream. It only marshals pixels in and
out and maps a settings dict onto the `Ntsc` object.

`public/pyntsc/ringPattern.npy` is upstream's measured ringing pattern, used by
`ringing2()`.

### Licence

Upstream ships no licence file. It is published as a research tool derived from
composite-video-simulator (LGPL 2.1). The source is vendored here unmodified
apart from the compatibility fixes above, with attribution, and is not
relicensed. If you intend to distribute this commercially, resolve the licensing
with the upstream author first.

## Pyodide

Python in the browser, via [Pyodide](https://pyodide.org/) (Mozilla Public
License 2.0). The runtime and the numpy / scipy / opencv-python wheels are
fetched from the pinned Pyodide CDN on first use.

## webm-muxer

WebM muxing for the WebCodecs encode path, by Vanilagy — MIT.

## iTunes Search API

Track search and 30-second previews come from Apple's public
[iTunes Search API](https://performance-partners.apple.com/search-api). No key
and no account are required. Artwork and preview URLs are hotlinked from Apple's
CDN and are not copied or stored.

## Runtime dependencies

| Package | Licence |
| --- | --- |
| react, react-dom | MIT |
| three | MIT |
| vite, @vitejs/plugin-react | MIT |
| typescript | Apache-2.0 |
