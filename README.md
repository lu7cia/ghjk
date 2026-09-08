# GHJK

A character-first social network with a late-90s survival-horror aesthetic.

You do not upload a headshot and write a bio. You **build a character**, put them
somewhere, and that is your page. Everything you post gets pushed back through
the constraints of the hardware it would have been made on.

```bash
npm install
npm run dev
```

Then open http://localhost:5173. Works on a phone — the layout collapses to a
single column with a bottom nav bar.

---

## What is in here

### Character creator — `src/character/`

A procedural low-poly humanoid, assembled from tapered boxes and rendered
through a shader that fakes a PlayStation 1 rasteriser. Four things gave PS1
characters their look, and all four are deliberate:

* **Vertex snapping.** The GTE had no sub-pixel precision, so vertices rounded to
  a coarse grid. That is the signature wobble on moving geometry.
* **Affine texture mapping.** No perspective-correct interpolation, so textures
  swim across large triangles. Implemented by premultiplying UVs by `w` in the
  vertex stage and dividing it back out in the fragment stage, which cancels the
  hardware's perspective correction.
* **Per-vertex Gouraud lighting.** No per-pixel anything.
* **15-bit colour with ordered dithering**, using the same 4×4 Bayer matrix the
  hardware used when packing 24-bit colour down.

The scene renders into a 320×240 framebuffer and is scaled up with
nearest-neighbour. Rendering small and upscaling is what actually sells the era —
a 4K render with a posterise filter on top never looks right.

Adjustable: skin tone, build, height, face preset, brow/eye-spacing/jaw, hair
style and colour, top and bottom garments, accessories, and the rasteriser
settings themselves (jitter, colour depth, dither).

**Clothing textures.** Upload any image and it maps onto the garment. It gets
crushed to 128px and quantised first, so a photo sits on the model like
era-appropriate texture art rather than a sticker.

Faces are painted into a 128×128 canvas rather than modelled, because the
geometry was far too coarse to carry an expression — all the character lived in a
tiny hand-drawn map.

### Habitat — `src/character/habitat.ts`

The backdrop your character stands in: six painted presets (Dead Orbit, Hab
Module, Wet Market, Sublevel 3, Greenhouse, The Channel), or upload your own
image. Fog colour, fog density, key light colour and intensity are all yours.

Pre-rendered backgrounds behind a real-time character is the exact Resident Evil
trick. Dense fog was how these games hid a short draw distance; here it just
makes everything look better, which was always the other reason.

### Photo degradation — `src/lib/degrade.ts`

Every uploaded photo is put back through a period-appropriate camera, in the
order a camera actually did it:

1. **Resample** to the target sensor size, in halving steps. A single large
   `drawImage` jump aliases in a way that reads as *broken* rather than *old*.
2. **Optics and sensor** — chromatic aberration, oversharpening (early digicams
   were brutal about this), and chroma averaged over 2×2 or 4×4 blocks while luma
   stays full-resolution.
3. **Response curve** — colour cast, vignette, grain, then palette reduction with
   an ordered dither.
4. **Generation loss** — encoded to JPEG and decoded again, up to six times on
   the harsher presets. Real codec artefacts compounding on each other, not a
   filter laid on top.

Presets: `UNTOUCHED`, `DIGICAM 2003`, `WEBCAM 1999`, `DISPOSABLE`,
`CURSED JPEG`, `PHOTO BOOTH`. A 3.2 MB source lands at ~17 KB on `CURSED JPEG`.

### VHS video — `public/pyntsc/`, `src/lib/pyntsc/`

The **upstream Python NTSC emulator runs in your browser**, unmodified, under
Pyodide. Not a shader approximating it — `Ntsc.composite_layer()` is called
directly, per field, per frame, with numpy and scipy doing the filtering.

Upstream is a Python rewrite of
[composite-video-simulator](https://github.com/joncampbell123/composite-video-simulator),
and it models dot crawl, ringing, Y/C delay error, rainbow effects, chrominance
noise, head-switching noise, luminance noise and oversaturation. See
[THIRD_PARTY.md](THIRD_PARTY.md) for attribution, licensing, and the three
numpy-2 compatibility fixes that are the only changes to the source.

The GUI in `VhsLab` exposes the real attributes on that class — tape speed,
edge wave, chroma loss, ringing power, subcarrier amplitude, scanline phase
shift and the rest. **RANDOMIZE** calls upstream's own `random_ntsc()`.

Working on a clip goes:

1. **Load a tape.** First time only, the Python runtime and numpy/scipy/opencv
   download (~40 MB) and cache.
2. **Tune on one frame.** Scrub anywhere, change anything, and the still
   re-renders through Python. The preview is the same code path as the render,
   so it cannot lie to you about the output.
3. **Render.** Frames are pulled by seeking, processed, and encoded with
   WebCodecs at explicit timestamps — so a render that takes four minutes still
   plays back at the right speed. A live preview and an ETA run alongside.

Presets: `BROADCAST`, `VHS SP`, `VHS EP`, `CAMCORDER`, `THIRD GEN DUB`,
`DEAD CHANNEL`, `NO COLOUR`.

Photos can take the same treatment — switch on **composite pass** in the photo
composer and the degraded still goes through the identical chain.

### Music — `src/lib/music.ts`

* **Top 3.** Search the iTunes catalogue and pin three tracks. Previews are the
  real 30-second clips, and they play in-page.
* **My Own Music.** Upload your own tracks and they get a player on your page.
  MySpace-style.

The iTunes Search API was chosen because it needs no key, no OAuth and no backend
to hold a secret — and, critically, it still returns preview URLs. Spotify
removed previews from its search responses, and Deezer's API will not talk to a
browser origin.

---

## Storage

**Everything stays on your device.** Media blobs live in IndexedDB, profile text
in localStorage. Nothing is uploaded anywhere.

That is the honest description of what this is right now: a fully working
single-player build of a multiplayer idea. The feed is seeded with four other
inhabitants so it is not an empty room, but there is no server, no accounts, and
no way to actually reach another person yet. Everything is routed through
`src/lib/db.ts`, so swapping in a real API is a single-file job.

`WIPE` in the header clears everything.

---

## Layout

```
src/
  character/       PS1 renderer, procedural rig, faces, habitats
    ps1Material.ts   vertex snapping, affine mapping, dither, fog
    rig.ts           procedural humanoid + wardrobe
    faces.ts         128x128 painted face textures
    habitat.ts       painted backdrop presets
  lib/
    pyntsc/          the Python NTSC emulator, driven from the browser
      client.ts        main-thread handle on the worker
      worker.ts        boots Pyodide, imports upstream ntsc.py
      params.ts        the Ntsc attribute surface + presets
      render.ts        frame-by-frame clip rendering
      encode.ts        WebCodecs encode, MediaRecorder fallback
    degrade.ts       photo degradation
    music.ts         iTunes search + preview player
    db.ts            IndexedDB / localStorage persistence
  components/      UI
    VhsLab.tsx       the video tools
    WinampPlayer.tsx the media player
  data/seed.ts     the other inhabitants
public/pyntsc/     vendored upstream ntsc.py + driver + ring pattern
```

## Known limits

* **Video rendering is slow, and that is inherent.** This is CPU Python doing
  per-scanline signal processing, one frame at a time. Expect roughly half a
  second per frame at 240p — a 10-second clip at 15fps is around 150 frames.
  The height, frame rate and length caps in the deck exist to keep that
  bounded, and there is an ETA and an abort button.
* **First video render needs network.** Pyodide and the numpy/scipy/opencv
  wheels are fetched from the pinned Pyodide CDN, then cached by the browser.
  To run fully offline, drop a Pyodide distribution somewhere static and set
  `VITE_PYODIDE_BASE` (or `window.__GHJK_PYODIDE_BASE__`) to point at it.
* Without WebCodecs the encoder falls back to holding frames as stills and
  replaying them into a `MediaRecorder`, which is slower and lossier.
* **WebGL2 is required** for the character viewport.
* Exported video is WebM (VP9/VP8).
* Feed cards each hold a live WebGL context, so they render at 160×120 — browsers
  cap how many contexts a page may hold.
