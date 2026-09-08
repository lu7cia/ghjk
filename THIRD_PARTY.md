# Third-party code and attribution

## ntsc-rs

The composite/VHS video effect in `src/lib/ntsc/` is adapted from
[**ntsc-rs**](https://github.com/ntsc-rs/ntsc-rs) by **valadaptive**.

ntsc-rs is a CPU implementation in Rust that walks each scanline as a signal and
runs real IIR filters along it. It has no browser-WASM build target, so this is
not a compile of that project — it is a re-expression of its pipeline as a WebGL2
fragment shader that runs at video rate:

* A one-sided IIR lowpass becomes a set of exponentially-decaying taps sampled
  backwards along the scan direction.
* A geometric row displacement (edge wave, head switching, tracking) becomes an
  offset applied to the sample coordinate before the texture fetch.
* The chroma modulate/demodulate round trip is reduced to the residue it leaves
  behind — dot crawl and rainbow fringing — rather than being run in full.

Stage names and their ordering in `src/lib/ntsc/shader.ts` deliberately mirror
`NtscEffect::apply_effect_to_yiq_field` in `crates/ntscrs/src/ntsc.rs` so the two
can be read side by side.

Values taken directly from upstream:

| Value | Source |
| --- | --- |
| `NTSC_RATE` = (315000000 / 88) × 4 | `crates/ntscrs/src/ntsc.rs` |
| VHS SP/LP/EP luma & chroma cutoffs, chroma delay | `crates/ntscrs/src/settings/standard.rs` |
| RGB↔YIQ matrices | `crates/ntscrs/src/yiq_fielding.rs` |
| fBm gain (1/√2) and lacunarity (2.0) for edge wave | `crates/ntscrs/src/ntsc.rs` |

### Licence

ntsc-rs is triple-licensed **MIT / Apache-2.0 / ISC** for all source files
outside `crates/gui`. Everything adapted here comes from `crates/ntscrs`, which
is covered by that permissive licensing. The `crates/gui` directory, which is
licensed differently, was not used.

```
Copyright © valadaptive

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

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
