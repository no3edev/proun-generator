# Local checks: what only a real display and GPU can show

Everything below was verified in software WebGL (SwiftShader) and with test doubles. The parts that need your eyes or your hardware are
listed here, with what to look for. Commands assume the repository root.

## 0. The automated suite (run these first, any machine)

| Command | What it covers |
|---|---|
| `npm test` | 51+ files, ~780 tests: generator, strategies, tween and schedules, time model, exhibition mode, watchdog, export, fuzz (24 seeds), soak smoke |
| `npm run typecheck && npm run build` | types and a production build |
| `FUZZ=1 npx vitest run tests/fuzzInterruptions.test.js` | 1500 seeds x 30 random interruptions (`FUZZ_SEEDS`, `FUZZ_STEPS`, `FUZZ_ONLY=<seed>`) |
| `SOAK=1 SOAK_HOURS=168 npx vitest run tests/soak.test.js` | 7 simulated days at Exhibition timing, random and curated: cadence, stillness in holds, flat heap |
| `APP_URL=http://localhost:5173/ python3 tools/verify/exhibition_check.py` | 22 browser checks of exhibition mode, flags, context loss, reload recovery, curated sequence, background fade, export (see `tools/verify/README.md`; fast on a GPU) |
| `python3 tools/verify/render_guard.py` | the reference scenes against their baselines (needs the verify setup in `tools/verify/README.md`) |

## 1. Setting up a display

1. Serve `dist/` (`npm run build`) from any static server, or `npm run dev`.
2. Open the page once in the display's browser profile and set, in the panel: palette, strategy (Composition), shapes, Motion > Time >
   **Timing: Exhibition** (60 s + 15 min), **Auto** on, optionally **Curated sequence**. The session is saved in that profile's
   `localStorage` and restored on every load.
3. Start the display with the interface hidden:
   `index.html?exhibition` (uses the saved timing), `?exhibition&auto` (also sets Exhibition timing and Auto), `?exhibition&auto&playlist`
   (also the curated sequence), optionally `&reload=24` (a refresh every 24 hours, at a moment nothing is moving).
4. A page cannot enter real fullscreen without a gesture: use the browser's kiosk mode (for example Chrome: `--kiosk <url>`) or press **F** once.
   **Esc** or **F** brings the interface back.
5. Do not clear the profile's storage between runs (the session and the reload guard live there). Keep a keyboard away from the public.

## 2. Things to judge by eye (a real display, real time)

- [ ] A transition at 60 s reads as one movement: anchors start first and drift, details start last and travel quickly (Lab > Transition >
      **Stagger**: 0 is the old everything-at-once motion, for comparison).
- [ ] Colour: details recolour early, anchors late (Stage 6.3); nothing flashes or pops at the start of a change.
- [ ] **The background fades** with the shapes when the palette changes (Lab > Transition > **Background fade** off = the old cut): watch
      the curated sequence across presets with very different papers.
- [ ] A 15-minute hold is perfectly still (look for any shimmer, creep or flicker; it should be a still image).
- [ ] The curated sequence: do the Library presets look right at your display's orientation? (They are shown as recipes at the display's
      orientation, not as the exact picture saved for another one; `library-at-landscape.png` shows all 11 at landscape.)
- [ ] The black surround and the stage fit on your actual screen and aspect ratio (4K, portrait, ultrawide).
- [ ] Interrupting: press Space, change the palette, switch Timing mid-transition: no jump of any shape.
- [ ] Orientation: changing it live leaves the old layout (cropped) until the next Advance. That is the existing design; say if you want it to
      re-lay out at once.

## 3. Hours-long behaviour (leave it running)

Paste this in the console and read it every few hours; the numbers must stay flat:

```js
setInterval(() => {
  const i = __proun.getRenderer().info;
  console.log(new Date().toISOString(), 'geometries', i.memory.geometries, 'textures', i.memory.textures,
    'draw calls', i.render.calls, 'JS heap MB', ((performance.memory && performance.memory.usedJSHeapSize) / 1048576 || 0).toFixed(1),
    JSON.stringify(__proun.contextStats()), JSON.stringify(__proun.watchdog.stats()));
}, 600000);
```

- [ ] Geometries, textures and JS heap flat after the first few cycles; draw calls rise in a transition and return to the same number in a hold.
- [ ] GPU memory flat (Chrome `chrome://gpu`, Task Manager, `nvidia-smi` or the OS equivalent).
- [ ] `contextStats()` and `watchdog.stats()` stay at zero losses and zero reloads on a healthy machine.
- [ ] Cycle length is 16 minutes (60 s + 15 min) within a frame or two; compare two timestamps of consecutive changes.

## 4. Forced failures (do these once)

- [ ] **Context loss:** `const e = __proun.getRenderer().getContext().getExtension('WEBGL_lose_context'); e.loseContext(); setTimeout(() => e.restoreContext(), 1500)`:
      the picture, paper included, returns by itself. For a real one: put the machine to sleep and wake it; unplug and replug the monitor.
- [ ] **Error storm:** `for (let i = 0; i < 20; i++) dispatchEvent(new ErrorEvent('error', { message: 'x' }))` in exhibition mode: the stage fades out,
      the page reloads and comes back as it was; do it again within 5 minutes: nothing happens (the guard).
- [ ] **Scheduled refresh:** start with `&reload=0.1` (6 minutes) and watch it dip and return at a quiet moment, then settle back to 24.
- [ ] **Move the window** to a monitor with another pixel ratio (or change the browser zoom): the picture refits and stays sharp.
- [ ] **Hide and show the tab / lock the screen:** no jump, no burst of changes on return (the clock treats it as a pause).
- [ ] **Offline:** disconnect the network and reload: the picture does not need it (only the panel's web font does).

## 5. Export

- [ ] 1x, 2x, 4x PNG match the picture (the render guard and `exhibition_check.py` check 1x and a tiled render against a single pass).
- [ ] **Custom size** 8000 (or the longest side you need) renders in tiles: time it on your GPU (software WebGL needed about 75 s for 63 megapixels);
      open the file at 100% near the tile boundaries (a 3 x 2 grid at 9000 px) and look for seams: there should be none.
- [ ] Try 16384 (100 megapixels is the cap): if the browser cannot encode the PNG the button says "Export failed": lower the size.

## 6. What is not covered anywhere

A frozen render loop with no errors (the watchdog acts on errors and on its schedule only); other browsers than Chromium; touch input on a
real touchscreen; a real GPU driver reset (the browser's `loseContext` is the nearest thing a test can trigger).
