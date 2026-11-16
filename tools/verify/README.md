# Verification harness (headless Chromium, software WebGL)

These scripts are how the visual-dynamics work was checked without a GPU. They drive the real app in
headless Chromium (software WebGL / SwiftShader) with **seeded** `Math.random` and crypto streams, so two
runs are comparable pixel for pixel. They are developer tools, not part of the app or `npm test`.

## Setup

```
pip install playwright numpy pillow scipy && playwright install chromium
npm run build -- --minify false --outDir dist-nomin     # unminified: stack traces keep function names
(cd dist-nomin && python3 -m http.server 8104) &       # or any static server
APP_URL=http://localhost:8104/ python3 tools/verify/export_check.py
```

(`--minify false` matters: `shoot.py` routes three.js's UUID `Math.random` draws to a separate stream by
looking for `generateUUID` in the stack.)

## Scripts

| Script | Checks |
|---|---|
| `compare_builds.py` | two served builds (`BASE_URL`, `NEW_URL`) are pixel-identical at rest and after two settled changes, with the new build's lab set to switch the new effects off. **Only build-to-build:** since the paper overlay and pigment pool are seeded, a build from before that change can no longer be matched. |
| `repro_check.py` | state reached by advancing == same state opened from its share link, in a session with different random streams (canvas and composited stage) |
| `export_check.py` | export sizes, 1x export vs the screen, 4x/2x downsampled vs 1x, ground texture bands per size, export of a paused mid-change scene |
| `scrub_check.py` | pause-and-scrub slider: 0 == before, 1.5 == after, back-and-forth reproducible, release settles exactly; lab groups collapsed |
| `interrupt_check.py` | a change arriving mid-change: no pop in the next frame |
| `resources_check.py` | geometries / textures / programs / heap flat over many changes; relative frame cost with effects on/off |
| `layer_audit.py` | Stage 5.0: what each material layer contributes on one scene (ground, procedural paint, the DOM paper overlay as the exporter composes it): luminance mean, std and std/mean on paper and on shapes, and the overlay's colour shift. `python3 tools/verify/layer_audit.py <strategy> <seed>` against the dev server. |
| `exhibition_check.py` | Stage 7 acceptance, 22 checks in one run against the real app (`APP_URL`, exits 1 on a failure): F / Esc / click policy / Auto while hidden / idle cursor, the start flags, three lost WebGL contexts, an error storm and its reload with the session restored (and no second reload), the curated sequence, the paper fade across a palette change, 1x export = the screen, Custom size single pass, a tiled render = a single-pass render. |
| `ground_cache_check.py` | v0.14.1: the ground cached in a render target (`NEW_URL`) against a build that draws it every frame (`OLD_URL`): settled and mid-morph canvases identical to within 1 level, 0 ground draws at rest, 1 per lab edit, frame cost. |
| `edge_check.py` | v0.14.2: legacy canvas identical to a build without the edge code (`OLD_URL`), the edge band on vs off in one build (share of pixels changed, 1x frame and 4x crop saved). `python3 tools/verify/edge_check.py <strategy> <seed>`. |
| `hatch_check.py` | v0.14.4: hatching on vs off in one build for a list of seeds (share of pixels changed, shader / page errors, 1x pair and 4x crop of the seeds that change). `python3 tools/verify/hatch_check.py <strategy> <seed> ...` |
| `silhouette_check.py` | v0.14.5: the soft, irregular outline: legacy canvas identical to a build without it (`OLD_URL`), silhouette on vs off in one build for a list of seeds (share of pixels changed, shader / page errors, 1x pair and 4x crop where it changed most). `python3 tools/verify/silhouette_check.py <strategy> <seed> ...` |
| `response_check.py` | v0.14.6: `hold`: a change with the clock held at peak energy, the response on vs off; `evolve`: with the switch on, a scene reached by a change equals the same seed made directly, and differs from the fixed surface. `python3 tools/verify/response_check.py hold|evolve <strategy> <seedA> <seedB>` |

## Hard-won pitfalls

- **Wait for the ground.** The ground morphs after every change and settles asymptotically; in software GL the
  sim runs slower than wall-clock (dt is clamped), so a screenshot 5 s after a change may still be mid-morph.
  Poll `window.__proun.groundMotion` until `pos === 0 && level === 0`.
- **A frame can render between two test steps.** To freeze and trigger atomically, do both in one
  `page.evaluate` (set the lab pause and fire the change in the same task).
- **Capture after a frame without the thing you toggled.** After switching the ground off, wait ~1 s before the
  "before" capture, or the canvas still holds the old frame.
- **rAF timing in headless is unreliable** for GPU cost; use it only for ratios between settings, never as a
  frame-rate claim. The lab's own frame readout on a real GPU is the number that matters.
- **Don't compare mid-change geometry frames** to isolate colour/paint: use a palette-only change (layout stays put).
- `window.__proun` (always set) exposes `Rhythm`, `Lab`, `groundMotion` and `getRenderer()` for these scripts.

- `tone_check.py` (Stage 4.1): legacy pixel identity against a baseline build (`BASE_URL`), contact sheets per strategy x tonal mode (`STEPS=legacy,sheet,cubes,full,front`, `OUT=`), and a sampled faceted -> subtle change. It waits for a stable picture, not just the ground; takes about 15 minutes in software GL, so run it detached. A seed change also moves the geometry, so it cannot isolate a tone change.

- `render_guard.py` (Stage 4.4): the render guard. Six stills of the strategies in the three tonal modes against `baseline/*.png` (720x560, a fresh page per scene). Serve the app, then run it detached (about 5 minutes):
  `NEW_URL=http://localhost:5201/ python3 tools/verify/render_guard.py` (exit 1 and a baseline | now | difference image in `GUARD_OUT`, default /tmp, if a scene differs);
  `--only <name>` for a subset; `--update` to re-shoot the baselines when the look is MEANT to change (look at the new PNGs: their diff is the review). Use a freshly started dev server:
  one that has seen edits can serve stale modules (the guard refuses it).

- `glitch_scan.py` (v0.10.8): regeneration pop scan. Freezes the change of the real advance button at slider ~0 and compares it with the picture just before, over pixels that are shape in both
  (a texture or colour that jumps at the first frame shows as a large share differing by more than 12). `APP_URL=... STRATEGIES=axis-thrust,disc-beams REGENS=3 python3 tools/verify/glitch_scan.py`.
  The Lab's slider hides shapes that left (they are disposed when the change ends), which is why only pixels that are shape in both are compared.

- `palette_sheet.py` (v0.11.0): every palette on the same composition (one strategy and seed per run, about 4 minutes per six palettes in software GL; `PAL_FROM`/`PAL_TO` slice the list). Use it after any palette change.

- Library presets: `tools/presets/` (describe_refs.py, specs.mjs, search.mjs, render_candidates.py, library_entries.mjs, build_library.mjs, update_library_golden.mjs, render_library.py); see `docs/PRESETS.md`.
