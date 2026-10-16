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
