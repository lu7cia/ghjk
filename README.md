# GHJK

A character-first social network with a late-90s survival-horror aesthetic.

You do not upload a headshot and write a bio. You **build a character**, put them
somewhere, and that is your page. Everything you post gets pushed back through
the constraints of the hardware it would have been made on.

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

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

### VHS video — `src/lib/ntsc/`

A real-time GLSL adaptation of the [ntsc-rs](https://github.com/ntsc-rs/ntsc-rs)
composite/VHS pipeline. See [THIRD_PARTY.md](THIRD_PARTY.md) for attribution and
licensing — the short version is that ntsc-rs's core is MIT/Apache/ISC, this
adapts it, and it is not a compile of their Rust.

The picture is encoded to YIQ and then luma and chroma are band-limited
*independently and at wildly different rates* — chroma to roughly 320 kHz against
luma's 2.4 MHz at SP speed. That ratio is the single most recognisable property
of VHS. On top of that: dot crawl, rainbow fringing on luma edges, chroma delay,
per-row chroma phase error, dropped chroma lines, head-switching tears, tracking
noise, edge wave, anisotropic dropout, ringing and tape smear — applied in the
same order ntsc-rs applies them.

Presets: `CLEAN`, `BROADCAST`, `VHS SP`, `VHS EP`, `CAMCORDER`,
`THIRD GEN DUB`, `DEAD CHANNEL`.

The live preview and the exported file run through the same code path, so what
you see is what you get.

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
    ntsc/            GLSL port of the ntsc-rs pipeline
      shader.ts        the pipeline itself
      presets.ts       tape speeds, cutoff -> blur radius maths
      renderer.ts      WebGL2 runner + image/video export
    degrade.ts       photo degradation
    music.ts         iTunes search + preview player
    db.ts            IndexedDB / localStorage persistence
  components/      UI
  data/seed.ts     the other inhabitants
```

## Known limits

* **Video export runs in real time.** The clip is played through the shader and
  the output is captured with `MediaRecorder`, so a 30-second video takes 30
  seconds. WebCodecs would allow faster-than-realtime, but support is uneven
  enough that the reliable path won. Keep clips short.
* **WebGL2 is required.** The character viewport and the VHS effect both need it.
* Exported video is WebM (VP9/VP8) wherever the browser supports it.
* Feed cards each hold a live WebGL context, so they render at 160×120 — browsers
  cap how many contexts a page may hold.
