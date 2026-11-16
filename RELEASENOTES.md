## v0.23.0 — Stage 7.6: final integration; Stage 7 complete (unattended: nothing a user can see changed)

Tests, one tool and documents; no `src/` change. Golden layouts and Library byte-identical to v0.15.1.

- **`tests/stage7Integration.test.js`** (7): the session of an exhibition display (every strategy, Exhibition timing, Auto, the curated switch) round-trips through storage; the autosave and `flush()` (what the watchdog relies on before a reload); corrupt, blocked, full and future storage never throws and starts on valid defaults; sessions saved by v1, v2 and v3 restore their composition and keep their cadence (a v3 interval becomes the same period); a share link gives the composition and leaves the display's timing; every Library preset loaded on an exhibition display survives a save and restore as the same composition; the viewer's own preset (saved with its own timing) loads as a composition anywhere and survives export and import. Sabotaged (the curated switch dropped on restore, the v3 migration broken): the tests meant to catch each fail. (A third sabotage produced a syntax error, not a failure, so it proves nothing and is not counted.)
- **`tools/verify/exhibition_check.py`**: 22 checks of what an exhibition display relies on, in one run against the real app (`APP_URL`, `SECTIONS=` to run some, exit code 1 on a failure): F / Esc / click policy / Space / Auto while hidden / idle cursor; the three start flags; three lost WebGL contexts; an error storm and its reload with the session restored, and no second reload; the same storm in normal mode doing nothing; the curated sequence; the paper fade across a palette change; a 1x export equal to the screen; Custom size 3000 as a single pass; a tiled render equal to a single-pass one; the exports leaving the screen untouched; no page errors. **22 of 22 passed** (in two runs: the sandbox dropped a background process after the first 15).
- **`docs/LOCAL_CHECKS.md`**: what only a real display and GPU can show, as a checklist: setting up a display (kiosk, flags, session), what to judge by eye, hours-long monitoring (a console snippet), forced failures to try once (context loss, error storm, scheduled refresh, moving the window, hiding the tab, offline), export, and what no check covers.
- **Final pass over everything:** 52 files, **786 tests** and 1 todo; typecheck and build clean; **fuzz 1500 seeds x 30 steps** (and 6000 x 40 at v0.17.1); **soak 168 simulated hours in both modes** (630 cycles, 12 million frames, cycle 960.03 s mean, 960.214 s at most, heap growth 0.1 MB, 7 to 36 shapes random and 8 to 20 curated); **render guard on all 8 reference scenes: 0.000% of pixels differ**; the first frame of a legacy change: 20.44% of pixels, max 31, 0 near-white, the numbers of v0.15.1 (nothing in Stages 6 and 7 changed the first frame of a change).
- **Stage 7 acceptance** (the table is in `docs/PROJECT_STATE.md` §14): hours without degradation (soak, context recovery, watchdog); presets and restoration reliable (the integration tests, migrations v1 to v4, the session coming back after a reload); the interface hidden without disrupting playback (Auto kept changing the picture while hidden); exported images match the composition (1x = the screen, tiled = single pass, a real 9000 x 7000 export without a seam); all systems together without regressions (the final pass above).
- **Open, none blocking** (§14): orientation changes re-laying out at once; your own presets in the curated sequence; carrying the cadence remainder; detecting a frozen render loop; the paper fade's timing. **Yours:** the real-display and real-GPU checks.

### Stage 7 summary

| Step | Version | What |
|---|---|---|
| 7.0 | v0.18.1 | the paper no longer stays black after a lost WebGL context |
| 7.1 | v0.18.2 | loading a preset keeps the viewer's timing and Auto |
| 7.2 | v0.19.0 | the exhibition display mode: F / button / `?exhibition`, fills the window on black, idle cursor, wake lock |
| 7.3 | v0.20.0 | unattended recovery: an error storm or `?reload=<hours>` reloads the page with the session saved |
| 7.4 | v0.21.0 | the curated sequence: Auto through the Library's presets, shuffled |
| 7.5 | v0.22.0 | Custom size export up to 16384 px and 100 MP, in tiles beyond one drawing buffer |
| fix | v0.22.1 | the background fades over a change instead of cutting (found in the curated sequence) |
| 7.6 | v0.23.0 | integration tests, the browser acceptance tool, the local checklist |

## v0.22.1 — Fix: the background now fades over a change instead of cutting (unreleased)

Reported in use: **in the Curated sequence there was no smooth transition between two background colours.**

- **Cause:** the shapes take the whole transition window to change colour (each on its own timeline), but the paper was set in **one frame** the moment the palette changed: the ground's colour, the clear colour, the edge tint and the hatching's paper and ink (`SceneManager.updateBackground`). With random Auto the palette never changes, so it was never seen; every Library preset has its own palette, so each curated change cut the whole background while the shapes were still on their way. A manual palette change did the same.
- **Fix** (`core/PaperFade.js`): a palette change fades the paper and the hatching ink **from the colours on screen to the new ones over the same transition window, on the same animation clock**, with the gentle sine ease. It never jumps (an interruption starts from what is on screen), it ends on **exactly** the target colours (a settled scene is what a fresh start shows: render guard 0.000%), and under the lab pause it shows the state at that fraction of the window like the shapes. The first picture and a restored session still set the paper at once. **Lab > Transition > Background fade** (on by default) switches it off for comparison (off = one frame, as before).
- **Cost:** none you can measure: while the fade runs the ground cache redraws each frame, as it already does during any transition for the ground's own motion; at rest nothing changes.
- **Measured in a real browser** (software GL, the lab pause scrubbing a palette change from the lightest to the darkest paper over a 20 s window, red channel of the ground): fade on: 236, 228, 205, 178, 165 at 0, 25, 50, 75, 100% of the window (the old paper to the new one, smoothly) and 165 after the pause was released; fade off: 165 from the first frame (the old cut). No console errors.
- **Tests:** 51 files, 779 tests and 1 todo. New `tests/paperFade.test.js` (7): the first colours at once and the switch on by default; a change starts with no jump on the old paper, is exactly halfway at half the window and ends exactly on the target, paper and ink both; every channel moves one way and no 50 ms frame steps more than the sine allows (60 s at 20 fps); an interruption starts from what is on screen; no window, nonsense or the switch off is immediate and the same colours do nothing; the lab pause shows the fraction whatever the frame time and the slider can go back; current(). Sabotaged six ways (jump to the target, an interruption restarting from the old target, ending only near the target, the lab pause ignored, the ink not faded, the switch ignored): each fails the tests meant to catch it.
- **A design choice to check:** the background fades over the **whole** window with a gentle ease, together with the shapes. The shapes' own colours follow per-role timelines (anchors recolour late, details early), so the paper has no role; if you would rather it lead or trail the shapes, it is one number in `PaperFade.js`.
- **Not verified:** how the fade reads over a real 60 s Exhibition window on a real display, and whether palettes with very different papers (white to black) look right halfway (a linear mix of the two in the renderer's linear colour space; the measurement above is a light-to-dark pair).

## v0.22.0 — Stage 7.5: custom export size, rendered in tiles beyond one drawing buffer (unreleased)

Golden layouts and Library byte-identical to v0.15.1; the existing 1x/2x/4x export is the same code path as before (the live picture and the render guard are not touched by this step).

- **Custom size…** in the export selector: a number field for the **longest side in pixels**, 512 to **16384 px and 100 megapixels** (the picture's aspect ratio is kept; never smaller than the picture on screen; beyond the caps it is lowered and the button says "(capped)"). The file is named `proun-<seed>@<px>px.png`. Within the single-pass limits (a side up to 8192 px, 36 megapixels, what the GPU gives) it is the same render as 2x/4x; **beyond them it is rendered in tiles** (at most 4096 px each, as few and as equal as possible): the same camera with `setViewOffset` for each, the ground drawn for the same part of the picture (a new `uTile` uniform in the ground shader, part of the ground cache's signature, the identity for everything else), each tile copied into one output canvas; renderer pixel ratio and size and the camera are always restored (a `finally`) and the live picture redrawn. The button says "Saved WxH (tiled)".
- **Synchronous on purpose:** no frame of the live loop may run while the camera has an offset, so the page does not repaint during the render; the button says "Rendering…" first. Cancelling is not possible.
- **Tests:** 50 files, 772 tests and 1 todo. New `tests/tiledExport.test.js` (11): the size is the asked longest side at the picture's aspect, capped at 16384 px and 100 megapixels (a square at 16384 would be 268), never below the screen size, nonsense is survived, single pass versus tiled at 36 megapixels, 8192 px and a small GPU; the tiles cover the frame exactly (rows run on from 0 to the full width, rows run on to the full height, no tile over the side, the minimum count) for nine sizes up to 16384 x 12745, and are as equal as they can be; each tile's ground rectangle (y up) tiles the unit square exactly and the top left tile is the top of the ground; `renderTiles` renders each tile once and puts it at its own place, lets a tile's error out; the ground cache redraws for a new tile, also one that differs only in size, and not for the same one; the filename. Sabotaged five ways (tiles overlapping by a pixel, the ground's y not flipped, the tile uniform's size missing from the signature (a first test did not catch it and was strengthened), the 8192 side ignored in the single-pass decision, no area cap): each fails the tests meant to catch it.
- **Measured in a real browser** (software GL): the same settled scene rendered single-pass and forced into 12 tiles: **at 2x (1440 x 1120) 0.003% of the pixels differ by more than 6 (max 14), at 3x (2160 x 1680) 0.001% (max 22), nothing concentrated on the seams (0.004% and 0.008% there)**; the on-screen picture was unchanged by the exports (0.0%) and the renderer was back at pixel ratio 1 and 720 x 560. A real export through the panel: Custom size 9000 gave **`proun-4242@9000px.png`, 9000 x 7000 (63 megapixels) in 6 tiles, in 74 s**, the button reading "Saved 9000x7000 (tiled)"; the steps between adjacent columns and rows at the tile seams are within the picture's own range (column seams 0.27 and 0.74 against a median of 0.43 and a maximum of 1.17; the row seam 0.24 against 0.31); downscaled to the screen size it matches the screen (0.19% of the pixels more than 24 levels apart, resampling at edges); the screen was unchanged afterwards. I looked at the downscaled picture: no seam, the paper continuous. No console errors.
- **Not verified:** a 16384 px or 100-megapixel export (the browser's canvas and PNG encoder limits, and memory: about 400 MB for the canvas alone, are the likely trouble: lower the size if it fails), the time on a real GPU, Safari and Firefox (only Chromium here), and a context loss in the middle of a tiled render (the render would fail and the renderer is restored; the context recovery of 7.0 then brings the picture back).

## v0.21.0 — Stage 7.4: the curated sequence, Auto through the Library's presets (unreleased, off by default)

Config version stays 4: `time.playlist` is a new boolean with a default of false, so older configs load with it off. The Library data was regenerated to carry the new field (`node tools/presets/build_library.mjs`); its layouts and the golden layouts are byte-identical to v0.15.1. The render path is untouched.

- **What it does.** With Auto on and the curated sequence on, each automatic change is the next Library preset instead of a new random composition. The order is **shuffled, no preset twice before all 11 were shown, and the first of a new round is never the last of the old one** (`core/Playlist.js`); a manual Advance (Space, a click outside exhibition mode) is unchanged, a new random composition. Presets are applied as compositions (`applyPreset`, 7.1): **the viewer's timing, Auto and this switch stay, and the display's orientation stays**.
- **Why the display's orientation stays** (a decision I made, please check): the Library holds 6 portrait, 3 square and 2 landscape presets, and a physical screen does not turn. A preset is therefore shown as its recipe (seed, palette, strategy, shapes) laid out for the display's orientation, not as the exact picture it was saved as for a different one. I rendered all 11 at landscape to judge it: every one gives a coherent composition (some bleed off the edges, as Prouns do; the tall tower and the floating cube are the most cropped, being natively portrait). If you would rather a preset keep the exact native layout, the alternative is to play only presets whose native orientation matches the display (landscape has 2, portrait 6, square 3), which makes for a short playlist.
- **Switch.** A **Curated sequence** checkbox under Auto in Motion > Time (stored with the viewer's other timing preferences, so a session restore and a watchdog reload keep it; not carried by presets or share links); `?exhibition&playlist` turns it on at load (with `&auto` for a fully self-starting kiosk).
- **Not persisted:** the shuffle. After a page reload (the watchdog) a new shuffle starts, so the first preset after a reload may be the one already showing.
- **Tests:** 49 files, 761 tests and 1 todo. New `tests/playlist.test.js` (11): every round shows each item exactly once (200 shuffles x 6 rounds); never the same twice in a row, across rounds and with random sources that always give the same shuffle; really shuffled; one item, none, reset; Auto applies a Library preset as a composition and never calls `Composition.advance`; keeps the display's orientation (22 changes) and the viewer's timing, Auto and the switch; 33 changes show all 11 once per round with no immediate repeat; switch off is what Auto was; the cycle restarts; the switch is off by default, takes a boolean only, round-trips, loads off from a config saved before it existed, and a preset never changes it. The long-session soak (`tests/soak.test.js`) now also runs the curated sequence against the real Composition: **7 simulated days (630 cycles) pass in both modes: cycle length 960.03 s on average, flat heap (0.0 to 0.1 MB growth), 8 to 19 shapes in the curated run**. Sabotaged five ways (curated ignored, preset orientation imposed, no round-boundary guard, the preset's timing replacing the viewer's, no shuffle): each fails the tests meant to catch it. The soak harness had the same artefact as the fuzz one (a scene left subscribed by the previous session), found and fixed.
- **Measured in a real browser:** the checkbox exists, ticking it sets `time.playlist`; with a 1 s cycle, four automatic changes came and every one was a Library preset, none repeated at once, the orientation stayed landscape and the timing and switches stayed; unticking gave random seeds (none in the Library); `?exhibition&playlist` set it, `?exhibition` did not, `?exhibition&auto&playlist` set both. No console errors.
- **Not verified:** how the shuffled sequence reads over hours on a real display, and your own saved presets are not in the sequence (only the Library's 11; including them would be a small change).

## v0.20.0 — Stage 7.3: unattended recovery, an error-storm reload and an optional scheduled refresh (unreleased)

Golden layouts and Library byte-identical to v0.15.1. No config change. The render path is untouched (a CSS opacity transition on the stage was added for the fade).

- **What reloads the page** (`core/watchdog.js`): **20 uncaught errors or unhandled rejections within 60 seconds**, or the optional **`?reload=<hours>`** refresh (0.1 hours to 30 days; anything else is ignored). Both ending in the same way: the session autosave is flushed, the stage fades out (0.7 s), the page reloads, and it fades in; the session (seed, palette, shapes, timing, Auto) comes back as it was, and `?exhibition` in the URL puts it straight back in the mode.
- **Only in exhibition mode.** Someone editing in the panel is never reloaded under their hands; errors are still counted outside the mode, so a storm already in progress is acted on the moment the mode is entered.
- **No reload loop.** A reload is never repeated within **5 minutes** of the last one; the time is kept in `localStorage` (a reload throws every variable away), so it holds across page loads. If storage cannot be read or written the watchdog does not reload at all: it could not promise there is no loop. A failing session save does not stop the reload.
- **The scheduled refresh** counts its hours from when the page started and waits for a moment nothing is moving (no running transition, Rhythm quiet, no lab pause), checked every 30 s. **A refinement of what I proposed:** I said "the end of a hold"; it reloads at the *first* idle moment after it is due, which is just after a transition ended. Reloading at the end of the hold would have cost up to a full hold of the cadence (the new page restarts its cycle), reloading at the start costs only the part of the cycle already run (the restored picture is the finished one, so the fade is the only visible effect).
- **Console:** `__proun.watchdog.stats()` gives `{ recentErrors, reloads, lastReloadAt, suppressed, lastReason, scheduledHours }`.
- **Tests:** 48 files, 749 tests and 1 todo. New `tests/watchdog.test.js` (12): the parameter; 19 errors do nothing and the 20th saves then reloads once; rejections count and old errors expire; errors spread over time never add up (200 over half an hour); nothing outside the mode and action as soon as it is on; the 5-minute gap holds across page loads and ends; no reload without usable storage (three ways); a failing save still reloads; the scheduled refresh waits for its hours and for idleness, once; not without the mode or the parameter; its hours count from page start and respect the gap; dispose stops everything. Sabotaged six ways (no gap, acting outside the mode, scheduled ignoring a running transition, reload without saving, reload with unusable storage, errors never expiring): each fails the tests meant to catch it.
- **Measured in a real browser** (software GL): in `?exhibition`, 20 error events made the stage fade out and reload once; the page came back faded, then cleared the fade; seed, palette, Exhibition timing and Auto on were as before, the mode was on again, and stats showed 1 reload; a second storm within 5 minutes caused no navigation and was counted as held back; the same storm in normal mode did nothing; a scheduled watchdog (shortened limits, injected into the page) did **not** reload during a running 5-minute transition 12 s past its due time and **did** reload, once, on an idle page. No console errors.
- **Not verified:** a real crash or hang (a frozen render loop with no errors is not detected: only errors and the schedule act), a real overnight run of `?reload=24`, localStorage being cleared by the kiosk browser between loads (then the 5-minute gap cannot be enforced and no reload happens), and the fade on a real display.

## v0.19.0 — Stage 7.2: the exhibition display mode (unreleased, no config change)

Golden layouts and Library byte-identical to v0.15.1; render guard 0.000% on axis-thrust-faceted and mass-hatched-529 (the normal-mode stage sizing was refactored into `core/stageFit.js` and gives the same sizes, tested).

- **What it is.** The interface hidden, the picture filling the window on black, the cursor gone when idle, the screen kept awake. It changes how the page *looks* only: a class on `<body>` (`panel.css`) hides the panel and the hint; the animation clock, Auto and the transitions are not touched, so hiding the interface cannot disturb a running show.
- **Enter / leave.** The **Exhibition mode** button (Motion tab > Time) or the **F** key: both are gestures, so the browser grants real fullscreen. **Esc** or **F** leaves; leaving real fullscreen with the browser's own Esc leaves the mode too. For a kiosk (no gesture, so no fullscreen request: the kiosk browser brings its own) the page takes start flags: `?exhibition` (hidden interface only; the viewer's saved timing is used) and `?exhibition&auto` (also Exhibition timing and Auto on); `?exhibition=0`, `false`, `off` and `no` are off.
- **Fit** (`core/stageFit.js`, pure): the stage fills the whole window, upscaled beyond its base size (the normal mode never upscales), in whole CSS pixels rounded down so there is never a sliver past the edge, aspect kept, black surround. The drawing buffer is held to a budget (`EXHIBITION_MAX_PIXELS`, 8.3 megapixels: a 4K screen at pixel ratio 1, or 1080p at 2) and to what the GPU gives per side. A window moved to a screen with another pixel ratio is fitted again (a `matchMedia` resolution listener), as are resize and fullscreen changes.
- **Input policy.** A click or touch on the picture no longer advances it in this mode (a stray touch on a public display); Space and the arrows still work (a keyboard is a maintainer's). F and Esc as above.
- **Cursor** hidden after 2 s idle, shown again on movement or a touch, always restored on leaving. **Wake lock** (`navigator.wakeLock`, screen) requested on entering, asked for again when the page comes back to the front (the browser releases it in a hidden tab), released on leaving; a refusal or a missing API is not an error.
- **Tests:** 47 files, 737 tests and 1 todo. New `tests/exhibition.test.js` (15): normal-mode sizes exactly as before over 3 orientations x 8 windows x 4 pixel ratios; exhibition fits (aspect kept, inside the window, one side filled, whole pixels), upscales, holds the pixel budget at 4K and 8K and at ratio 3, respects the GPU side limit and survives a nonsense ratio; the start flags; the controller with a document, window, fullscreen API and wake lock that are doubles (enter and exit with every side effect, idempotent, toggle, idle cursor on and off and given back on leaving, Esc out of fullscreen, wake lock re-requested and released, no fullscreen or lock available or refusing, a lock that arrives after leaving is released, dispose). Sabotaged six ways (no pixel budget, normal mode losing its cap, the cursor not given back on exit, Esc not leaving, the lock never released, and an idle timer left running): each fails the test meant to catch it, one test was too weak at first and was strengthened.
- **Measured in a real browser** (software GL): F engaged real fullscreen and hid panel and hint, the stage filled 1028 x 800 of 1280 x 800 on a black background with black corners; a click on the picture did not advance it, Space did, the left arrow went back; with the interface hidden and a 1 s cycle, 3 automatic advances came within the wait; the cursor was `none` after 2.6 s idle and back on movement; Esc restored the panel and the exact normal size; a context loss and restore inside the mode brought the paper back; `?exhibition` and `?exhibition&auto` loaded in the mode (the second with Exhibition timing and Auto on, the first with the saved Dev timing) and `?exhibition=0` did not; at 1920 x 1080 the stage was 1388 x 1080 centred, at 800 x 1280 it was 800 x 622, at 2560 x 1080 it was 1388 x 1080, portrait and square windows and orientations fitted and filled one side; pixel ratio 2 gave a 2776 x 2160 buffer (6.0 MP) and ratio 3 gave 3266 x 2541 (8.3 MP, capped). No console errors.
- **Seen, not caused by this step:** changing the orientation without pressing Advance leaves the old layout in the new frame, so a portrait or square frame crops the right side of a landscape composition until the next Advance. This is the same in the normal mode (checked) and is the existing "settings don't re-layout until the next advance" design; a display that starts in portrait is laid out for it. If you want an orientation change to re-lay out at once, say so.
- **Not verified:** a real 4K or kiosk display, a real wake lock refusal, touch input, and how the black surround looks next to your frame or projection; the real fullscreen exit by the browser's own Esc (the doubles test the logic, the headless browser engaged and left fullscreen with F and Esc only).

## v0.18.2 — Stage 7.1: loading a preset keeps the viewer's timing (unreleased)

Found in the Stage 7 audit: `SceneConfig.replace` takes the preset's own `time`, and the Library's presets are Dev timing with Auto off, so on an Exhibition display (60 s + 15 min, Auto on) **loading any preset turned it back into Dev timing with Auto off**. Share links already carried the composition only.

- **Change:** a preset is a composition. `SceneConfig.replace(raw, { keepTime })` keeps the viewer's `time` (transition, hold, Auto) when `keepTime` is set, and `presets/applyPreset.js` (`applyPreset(config, preset)`) is what both preset buttons in the panel (Library and your own) now call. Everything else about loading is as before (the whole composition, an always-notified "replace", migration of older presets). A saved preset still stores the timing it was made with, and it is ignored on load. The restored session (`boot.js`) still goes through plain `replace`: it is the viewer's own state, timing included.
- **Tests:** 46 files, 722 tests and 1 todo. New `tests/presetTiming.test.js` (6): every Library preset gives its composition and leaves Exhibition timing and Auto alone; a preset saved with its own timing or with Auto on does not impose it; older presets (no seed and no version, a v3 interval, no timing) still load and the timing stays; loading is still a notified replace; your own saved preset round-trips its composition; the session restore still takes the timing. Sabotaged two ways (`applyPreset` without `keepTime`, `keepTime` ignored in `replace`): four of the six tests fail each time.
- **Measured in a real browser:** on an Exhibition-timed page with Auto on, the first four of the 11 Library buttons each changed the composition and left the timing as it was, the Timing selector still showing Exhibition and Auto still on; no errors. Golden layouts and Library byte-identical to v0.15.1.
- **Behaviour change to know about:** loading a preset used to switch Auto off. It no longer does, so a display with Auto on keeps advancing after you load a preset (by design here); turn Auto off by hand if you want it to stand still.

## v0.18.1 — Stage 7.0: the paper no longer stays black after a lost WebGL context (unreleased)

Found in the Stage 7 audit, by forcing a context loss in a real browser (`WEBGL_lose_context`): after `restoreContext` the shapes came back and **the ground was black (81% of the pixels differed from before)**. On a display that runs for hours a GPU reset, a driver update, the laptop sleeping or the browser reclaiming memory does this, and nothing in the code handled it.

- **Cause:** the ground is drawn into a cached render target and redrawn only when the numbers it depends on change. After a restore three.js re-creates its GPU objects, so the cache's texture is empty, but none of those numbers had changed, so the cache believed its picture was still there. (While the context was lost the loop also "drew" the ground into nothing and recorded it as done.)
- **Fix:** `core/contextRecovery.js` (`watchContext`): on `webglcontextlost` it prevents the default (otherwise the browser never offers a restore) and the loop stops drawing; on `webglcontextrestored` it calls `invalidateGroundCache()` (`GroundLayer.js`), so the next frame redraws the ground. PNG export refuses with "The graphics context was lost; wait a moment and try again" while the context is away. Counters: `__proun.contextStats()` in the console gives `{ lost, losses, restores }`.
- **Measured in a real browser** (software GL, with the fix): five losses and restores in a row, then 0.0% of the pixels differ from before; a loss in the middle of a change and then back to the same composition: 0.0% differ; counters 5 and 5; no errors.
- **Tests:** 45 files, 716 tests and 1 todo. New `tests/contextLoss.test.js` (5): the watcher prevents the default, counts and survives 50 losses; the ground cache draws once and then not again while nothing changes; after `invalidateGroundCache` it draws again although no number changed (the bug); a loss and restore through the watcher redraws exactly once. Sabotaged (no invalidation): the two tests about the redraw fail.
- **Not verified:** a real GPU reset (the browser's own `loseContext` is the nearest thing I can trigger); that every other texture is re-uploaded by three.js after a restore beyond what the screenshots show (they match pixel for pixel, so I believe so).

## v0.18.0 — Stage 6.5: the long-session soak, as a tool you run yourself; Stage 6 complete (unreleased, no behaviour change)

Adjusted at your request: no long runs from me, a soak you can run locally. Tests plus one read-only diagnostic (`Tween.stats()`); nothing a user can see changed. Golden layouts and Library byte-identical to v0.15.1.

- **`tests/soak.test.js`**: a long session at Exhibition timing (60 s transition, 15 min hold) on the animation clock, played much faster than real time from a fake frame source (20 fps, jitter, hitches of 0.2 to 0.8 s, tab suspensions of 5 to 30 minutes, and now and then a new palette or strategy by hand). The real `AutoAdvance` starts every change; the real `Composition`, `Tween` and `Rhythm` run it. **In every `npm test` it plays 3 cycles** (0.3 s). **To soak:** `SOAK=1 npx vitest run tests/soak.test.js` (24 simulated hours) or `SOAK=1 SOAK_HOURS=72 ...`; `SOAK_CYCLES=n`, `SOAK_FPS=20` and `SOAK_HEAP_MB=25` adjust it. It prints a report.
- **What it checks:** an automatic change starts every transition + hold of animation time, give or take the frame that noticed it, for the whole run; a long hold is still (2 minutes after a change and again just before the next, every shape's position, rotation, size, colour, front and highlight are bit for bit the same, no tween runs); the shapes in the scene equal the layout's every cycle; Tween's bookkeeping is bounded and empty at the end; the heap (after a forced GC) does not grow over the last two thirds of the run (asserted in a SOAK run only, limit `SOAK_HEAP_MB`).
- **My own runs, only to prove the tool works:** 24 simulated hours: 90 cycles, 1.7 million frames, 2 s of real time, 0.1 MB heap growth; **168 simulated hours (7 days): 630 cycles, 12 million frames, 14 s, 0.1 MB heap growth**, cycle length mean 960.03 s (min 960.001, max 960.214), 7 to 36 shapes, at most 45 tweens at once. Sabotaged four ways, each fails: `finished` bookkeeping never cleaned ("432 to be at most 7"), the hold ignored ("60 s between changes"), a leak of removed shapes ("heap grew 79.9 MB over 270 cycles"), a creep of 1e-9 at rest ("the picture moved during the hold").
- **A small finding, not a bug:** the hold timer restarts at 0 on every change, so the part of a frame past the deadline is dropped, and a cycle lasts 960 s plus about 20 to 30 ms (one frame). Over 24 hours that is 2 to 3 seconds. If you ever need the exact cadence, carry the remainder in `AutoAdvance.update` (one line).
- **Clock audit:** nothing in `src/` keeps a clock that grows without bound (no `uTime`, no `performance.now` or `Date.now` in the frame loop; the ground motion is a damped spring with a bounded position; Rhythm and Tween count per event and reset), so there is no float precision to lose after days.
- **Tests:** 44 files, 711 tests and 1 todo.
- **What this cannot show, so you do it locally** (README, "Long sessions"): the real renderer and GPU, the browser's throttling of a background tab, GPU memory over hours (`renderer.info`), and whether the Exhibition motion looks right to your eye.

### Stage 6 summary

| Acceptance criterion | Where it is shown |
|---|---|
| No visible position or rotation jumps | `interruption fuzz` (6000 seeds x 40 steps: no jump in position, rotation or size at any step), `tween` and `schedule` tests (no jump when retargeted while waiting or moving) |
| Motion staggered and coherent | 6.2: role profiles, heavy overlap (`schedule`, `composition` tests); the scrub sheets of v0.16.0 and v0.17.0. **Your eye on a real GPU is still the judge.** |
| A new target does not corrupt active tweens | the fuzz (one tween per shape, none on a gone shape, nothing outlasts the new window, a fresh scene's layout at the end); v0.15.1 fix |
| Long holds stay visually stable | `soak`: bit-identical state across a 15-minute hold, 630 cycles |
| Material follows geometry with independent delays | 6.3: three timelines per shape, tested on a mesh with front, highlight and shadow |
| Playback reliable over extended sessions | `soak` (7 simulated days, flat heap, exact cadence), `timeModel` (suspension, no queued advances); the real browser is yours to confirm |
| Timing configurable, independent of frame rate | `timeModel`: a 1-minute transition at 4, 30, 60 and 144 fps and with hitches; Dev and Exhibition presets, ranges to 5 min and 60 min |

## v0.17.1 — Stage 6.4: interruption fuzz tests (unreleased, no behaviour change)

Tests plus two read-only diagnostics in `Tween` (`activeMeshes()`, `remainingOf(mesh)`); nothing a user can see changed. Golden layouts and Library byte-identical to v0.15.1.

- **`tests/fuzzInterruptions.test.js`**, part of every `npm test` (24 seeds x 16 steps, about a second; 43 files, 710 tests and 1 todo). Each seed draws a random configuration and then random steps, the things a person or the timer can do while a change is still under way: advance, new palette, new strategy, another orientation, shape counts, visibility, sizes, spread and snap, lock and unlock, a preset replacing the whole configuration, another timing (200 ms to 5 min), the lab's Stagger and pause/release, and time passing in frames of any length (0 to a stall to an hour).
- **After every step:** finite numbers everywhere, at most one tween per shape, no tween on a shape that is gone or disposed, no disposed shape in the scene, colour front and highlight inside 0..1, Rhythm finite. **After every configuration change (not under the lab pause):** no shape that stays jumps in position, rotation (billboards excepted) or size, and after a change that re-resolves the frame no tween has more time left than that change's own window (this is what would have caught the v0.15.1 ghosts). **At the end** (every run ends with an advance: see below) nothing is running, the scene holds exactly the layout's shapes, none shrunk to a speck, all fully recoloured, and the scene equals a freshly started one (type, position, size, rotation, colour) with nothing left over.
- **Longer runs on demand:** `FUZZ=1 npx vitest run tests/fuzzInterruptions.test.js` (1500 seeds x 30 steps, about 30 s); `FUZZ_SEEDS=n` and `FUZZ_STEPS=n` set the size; a failure names its seed and the steps before it, and `FUZZ_ONLY=<seed>` replays that seed alone (add `FUZZ=1` and the same `FUZZ_STEPS` if it came from a long run).
- **Result: no bug found in the code.** 1500 x 30 and then **6000 x 40 (240,000 steps)** pass: no jump, orphan, double tween or corrupted number, with the stagger, the three timelines, `finishWithin`, the lab pause and the timing switches all in play. Every failure I met was in the harness or in my expectation, listed so you can judge the fuzz: scenes of earlier seeds left tweens behind (a test artefact: the app removes a shape's tweens with the shape); and a size, spread or snap change leaves the shapes where they are until the next advance, **by design** (`Composition.onConfigChange`: "the next advance re-resolves everything"), so the scene is only owed to equal a fresh one after a change that recomposes, which is why every run ends with an advance.
- **The fuzz is sabotage-checked:** removing `settleLeaving` (the v0.15.1 bug) fails it ("60000 ms left, more than the 200 ms of this change"), as do a tween that does not replace the running one ("two tweens on one shape"), `removeInstance` forgetting the tween ("a tween on a disposed shape"), a new tween starting from the previous target (a 5.9 unit position jump), one starting from a zero rotation (a 2.6 rad jump), a leaving shape never disposed (53 shapes against 17) and a zero span (a non-finite number).
- **Worth your decision (not a bug I could prove):** under a composition strategy, moving a size, spread or snap slider changes nothing on screen until the next advance, and a locked shape is frozen at the position it had when you pressed lock. Both are as designed and documented in the code, and the fuzz treats them as such.
- **Not covered by the fuzz:** the render itself (the fuzz uses test doubles for materials), the real frame loop and AutoAdvance (tested separately in `timeModel`), the export and the panel, and anything on a real GPU.

## v0.17.0 — Stage 6.3: colour and material on timelines of their own (unreleased, no config change)

Config version stays 4. Golden layouts and Library byte-identical to v0.15.1; render guard 0.000% on axis-thrust-faceted and mass-hatched-529; the first frame of a change is unchanged (legacy 3->4: 20.44% of pixels, max 31, 0 near-white).

- **Three timelines per shape** inside the window, each independent of the others (`core/schedule.js`, `Tween`): the **geometry** (position, rotation, scale, the shadow plane's place, the highlight strip following the form: as in 6.2), the **colour** (the new colour's sweep and the tone with it) and the **material** (the highlight's amount, the shadow plane's colour and its hatching). Each has a delay and a span as shares of the window and is over by its end.
- **Per role, as chosen: the other way round to the geometry.** Anchors move first and recolour last (colour starts at 30 to 42% of the window, material at 20 to 32%); details move last and recolour first (colour at 0 to 8%, so often before the shape has moved much; material at 4 to 12%); support, connector and accent in between (table: `MOTION_PROFILES` in `config/defaults.js`). Anchors' colour eases gently (sine), the others' with the plain cubic. The colour and material numbers are drawn after the geometry's, so the geometry of 6.2 is unchanged number for number (pinned in a test).
- **A tween now ends when the LAST of its three timelines is over**, not at the end of the geometry (otherwise a late recolour would have been cut short and jumped). A leaving shape is therefore disposed at that moment, still within the window. `Tween.finishWithin` squeezes all three timelines.
- **Lab > Color delay** now means: coverage starts this share of the *colour's own span* after the colour starts (it was: of the transition after the geometry started). With Stagger 0 the three timelines are the whole window with one cubic and everything is v0.15.1's motion exactly (tested step by step for the front and the highlight).
- **The Rhythm envelope** already runs on the same window (it is given `durationMs`), and every timeline is over inside it; nothing needed changing, and a test now pins it (`Rhythm.duration` is the window, `phase` is 1 when the tweens are through).
- **Tests:** 42 files, 709 tests and 1 todo. New: schedule-level (the 6.2 geometry pinned; deterministic; inside the window for every role, type and 150 seeds; anchors recolour last and details first, the opposite of the geometry; independence; strength 0), Tween-level on a mesh with colour front, highlight and shadow (each follows its own timeline; completes once, at the last of the three; a colour that comes before the move; strength 0 equals the old front and highlight; `finishWithin` keeps all three where they are; an interruption while the colour is still waiting does not jump) and one Composition-level (a third of the way in, details and accents have started to recolour and anchors have not; everything done by the end of the window). Sabotaged six ways (colour on the geometry's timeline, completion at the geometry's end, the shadow's colour on the geometry's timeline, `finishWithin` forgetting the colour, anchors recolouring early, the colour drawn before the geometry): each fails the tests meant to catch it.
- **Seen in a browser** (software GL, lab pause, palette change, Stagger 1 against 0): a third of the way in, the small shapes of the staggered change are already recoloured (a sphere fully dark) while with Stagger 0 colour still trails the movement. Caveat: the lab pause also replays the earlier strategy change in the scene, so those sheets mix geometry and colour and prove the direction, not the exact timing.
- **Not verified:** how it looks in real time on a real GPU and over the real 60 s; whether detail colours that land before the shape has moved read well (a table edit away: raise their delay); a texture-material change other than the highlight, shadow colour and hatching has no timeline of its own (the paint grain and tooth respond to the shared Rhythm energy, as before).

## v0.16.0 — Stage 6.2: per-object motion scheduling (unreleased, no config change)

Config version stays 4. Golden layouts and Library byte-identical to v0.15.1; render guard 0.000% on axis-thrust-faceted and mass-hatched-529 (a scene at rest does not change); the exact first frame of a change is unchanged (legacy 3->4: 20.44% of pixels, max 31, and axis-thrust 3->4: 50.81%, max 217, the same numbers as v0.15.1, 0 near-white pixels in both).

- **Schedules** (`core/schedule.js`, new, DOM-free): inside a transition window each shape gets its own delay, span and easing, drawn from the seed and the shape's (type, role, index), so a composition always moves the same way, and from its role's profile (`MOTION_PROFILES` in `config/defaults.js`): anchors start within 0 to 4% of the window, take 88 to 100% of it and ease gently (sine); supports 2 to 12% / 62 to 85% (cubic, the old easing); connectors 5 to 16% / 55 to 80% (cubic); accents 10 to 22% / 42 to 68% and details 12 to 25% / 35 to 60% (quart, crisp); a legacy shape has no role and moves like a support. **Heavy overlap, as chosen:** every shape starts within the first 25% of the window and has arrived by its end.
- **Tween**: `Tween.add(mesh, target, duration, onComplete, schedule)`: the shape's progress is `(elapsed - delay) / span`, it completes at its own end (a leaving shape is disposed then), and the colour front, highlight, shadow plane and hatching follow that same per-shape progress, so colour still arrives with its own shape. `finishWithin` (v0.15.1) now squeezes the whole timeline, delay included, so it still keeps the picture. The window stays `durationMs`: Rhythm, the lab pause and the hold are unchanged. All four callers in `Composition` (matched pairs, arrivals, leaving shapes, the legacy slot path) pass a schedule.
- **Lab**: Transition > **Stagger** (0 to 1, default 1). 0 gives every shape the whole window and one cubic, the motion of v0.15.1 exactly (tested step by step). It is a lab value (kept in the browser, not in saved configs, like the colour delay).
- **A reading I chose, please check:** you asked for "movement amplitude per object" with straight paths and no overshoot. A shape that must end on its target cannot move *less far* without a jump at the end, so I took amplitude as the **strength of the movement**, the peak speed of its easing (sine 1.57, cubic 3, quart 4, times distance over span): anchors drift, details travel. If you meant something else, tell me before 6.3.
- **Behaviour change in Dev:** the default Dev transition (1.1 s) is now staggered too (details start 130 to 275 ms in), so it feels different. Set Stagger to 0 for the old feel. Colour and material still follow each shape's own geometry progress; independent colour and material delays are 6.3.
- **Tests:** 42 files, 697 tests and 1 todo. New `tests/schedule.test.js` (12: deterministic; inside the window for every role, type and 150 seeds; role order; strength 0 is the old motion; easings monotonic with peak speeds; a scheduled tween waits, lands exactly and completes once; no step larger than the easing allows; a new target while it waits or moves does not jump in position or rotation; `finishWithin` in a delay and in a move; the lab pause) and 3 Composition cases (early roles under way while accents and details have not started, everything arrived by the window end, no leftovers; the same seed moves the same way; no jump when interrupted at five moments of the stagger). Sabotaged eight ways (delay ignored, no schedule in the pairs, `finishWithin` ignoring the delay, delay not capped, span not limited, details not later, and two earlier ones): each fails the tests meant to catch it.
- **Seen in a browser** (software GL, lab pause, same sequence, Stagger on against off): at half the window the staggered scene has its large shapes nearly home with a few details still in flight; the unstaggered one has most shapes mid-air at once. The end states are identical.
- **Found while checking:** software GL renders frames slower than the 1 s stall limit, so the clock runs in slow motion there (frames over 1 s count 100 ms): real-time sampling of a 20 s transition there stays near its start. This is the stall rule working as designed, not a bug, but it means timing on this machine cannot be judged in real time; on a real GPU a frame is far under 1 s.
- **Not verified:** how it looks in real time on a real GPU, and over the real 60 s; whether the profile numbers look right to your eye (they are in one table and easy to change); a legacy-generator change in the scrub sheet.

## v0.15.1 — Fix: shapes still leaving from a slow change lingered in the next one (unreleased)

Found in use: in Exhibition timing, a new composition was started, then the palette and the strategy were changed during the transition, then the timing was switched to Dev and another composition was generated: the new composition appeared, but the old shapes stayed on screen.

- **Cause:** a shape that has no counterpart in the new composition shrinks away with the duration of the change that removed it (60 s in Exhibition). A later, quicker change did not touch it, so it stayed, still large, in the middle of the new composition for the rest of the minute. Nothing leaked for good (it was disposed when its own tween ended); the new change just did not take it along. It was already possible in Dev with very different durations, but a minute-long transition makes it easy to hit.
- **Fix:** `Tween.finishWithin(mesh, ms)` makes a running tween end within `ms` without moving the mesh (the progress is kept, only the rest of the way is faster: no jump, no restart of the easing), and every new change (`recompose`, and the slot-by-slot change of the legacy path) calls it for the shapes still leaving, with the new change's duration. A shape with no more than that left, or no tween, is untouched. Switching the timing on its own does not shorten anything in flight (a transition in progress finishes as it began); only the next change does.
- **Measured in a real browser** (software GL, a 20 s change standing in for the minute; draw calls, about one per shape): old build 69 at 3, 6 and 12 s after the Dev change and 37 only once the original change ended; fixed build 37 at 3 s. In the unit model: 13 or 14 meshes in the scene against 8 or 9 in the final composition before the fix, 9 after.
- **Tests:** 41 files, 682 tests and 1 todo. New: `Tween.finishWithin` (no jump, lands exactly on the target after the new time and completes once; no-op when less is left, with no tween, or for a time that makes no sense) and three Composition cases (the reported sequence, the same with the legacy generator, a same-length change changes nothing). Sabotaged: without the call both sequence tests fail; without the legacy-path call the legacy one fails. Golden layouts and Library byte-identical to v0.14.9.
- **Not verified:** the same sequence at the real 60 s and 15 min on a real GPU; whether anything other than the leaving shapes can outlast a quicker change (matched and arriving shapes are re-tweened by every change, so I believe not).

## v0.15.0 — Stage 6.1: one animation clock, transition and hold, Exhibition timing (unreleased)

Config version 3 -> 4. The picture is unchanged: golden layouts and library byte-identical to v0.14.9, render guard 0.000% on axis-thrust-faceted and mass-hatched-529.

- **One clock** (`core/frameClock.js`, new): `frameDt(raw)` feeds Tween, Rhythm, the ground and the hold timer. Frames up to 1 s count in full (the 100 ms clamp of v0.14.9 made animation time fall behind real time: 4 fps stretched a 1-minute transition to 150 s; now it takes 60 s), a longer frame is a suspension and counts as 100 ms, and `visibilitychange` drops the gap of a hidden tab: everything resumes where it stopped.
- **Hold timer on the same clock** (`core/AutoAdvance.js`, rewritten): the wall-clock `setInterval` is gone. A change every `durationMs + holdMs`, counted from the start of the last change; at most one advance per frame (no catching up, nothing queues in a hidden tab); a change started some other way restarts the cycle; turning Auto on starts a fresh one; the lab pause stands it still. **Behaviour change:** a manual Advance now delays the next automatic change by a full cycle (before, the timer ran on regardless).
- **Two fields** (`time.durationMs`, `time.holdMs`; `intervalMs` is gone) and wider ranges: transition 0.2 s to 5 min, hold 0 to 60 min. The Motion tab shows seconds and a **Timing** selector: Dev (1.1 s + 2.9 s: the default, the old 4 s cadence) and Exhibition (60 s + 15 min); other values show as Custom. Rhythm is given the period (transition + hold) where it was given the interval.
- **Migration** (`CONFIG_VERSION` 4, `MIGRATIONS[3]`): `hold = max(0, interval - duration)`, so a saved preset, session or imported file keeps its cadence; the Library data was regenerated (`node tools/presets/build_library.mjs`: `holdMs` 2900) and its layouts are unchanged. Share links carried no timing.
- **Found by the browser check, not by the tests:** `Composition.js` called `cycleMs` without importing it, which only breaks with Auto on (every unit test ran with Auto off). Fixed, and `tests/composition.test.js` now runs both strategies with Auto on (sabotage: dropping the import fails both).
- **Tests:** 41 files, 677 tests and 1 todo (the five "documents today" tests of 6.0 were rewritten to the new contract; new: `frameDt`, real time at 4 fps and with hitches, a 10-minute suspension resuming exactly, Dev and Exhibition cycles, no timers, one advance at most, restart on a click, the lab pause, Auto off and on, hold 0, migration cases). Sabotage-checked eight ways (pause ignored, old clamp, no restart on a click, no fresh cycle on Auto on, catch-up queue, hold = interval, no version bump, missing import): each fails the tests meant to catch it; one test (Auto on) was too weak at first and was strengthened.
- **Measured in the browser** (software GL): Dev and Exhibition selector, Custom after editing, a hold typed as 99999 s clamps to 3600 s; with a 0.3 s + 0.7 s cycle three advances came from the loop at gaps of 1.03 s and 1.09 s, no console errors and no `setInterval` created by Auto (the two at load are the lab readout and the dev server). First frame of a legacy change: 0 near-white pixels before and after.
- **Not verified:** a really hidden tab (the rules are tested with an injected clock; I could not hide a headless tab), a real GPU, a real 16-minute Exhibition cycle (tested at 20 fps in the harness, not in a browser), the Motion tab's look on a narrow screen.

## v0.14.9 — Stage 6.0: an injected clock for the animation tests (unreleased, no behaviour change)

First step of Stage 6. No source file under `src/` changed: the golden layouts, the render guard stills and every shipped behaviour are as in v0.14.8.

- **Harness** (`tests/helpers/frameClock.js`, new): drives `Tween` and `Rhythm` exactly as `SceneManager.loop` does (per frame `dt = min(raw, MAX_FRAME_MS)`, `Tween.update`, `Rhythm.update`) from a fake frame source: steady fps, hitches, stalls, with wall time and animation time kept apart. It mirrors the loop instead of importing it (the loop needs a renderer and a DOM), so `stepFrame()` is the one place to change when 6.1 replaces the clock.
- **Tests** (`tests/timeModel.test.js`, 11): a 1-minute transition at 30, 60 and 144 fps lands exactly on its target (position and rotation), within one frame of 60 s, the path at fixed wall times agrees across frame rates within one frame of motion, the motion is monotonic with no step above what the easing allows, and Rhythm's phase and energy follow the same window and end at exactly rest. Sabotage-checked: doubling the tween speed fails 6 of them, removing the frame clamp fails 3 (the "documents today" ones).
- **Measured (documents today):** with steady frames up to the 100 ms clamp (10 fps and above) there is **no drift**; animation time equals wall time at 30, 60 and 144 fps. Below it, time falls behind: 250 ms frames (4 fps) stretch a 1-minute transition to 150 s; one 400 ms hitch a second stretches it to about 1.3 minutes; one 5 s stall (a hidden tab coming back) advances the animation by 100 ms only. The wall-clock `setInterval` of `AutoAdvance` fires every interval whether or not a frame runs (15 calls in 60 s at 4 s with no frames at all), so advances queue behind a frozen loop. The ranges today cap the duration at 6 s and the interval at 20 s (a 60 s transition and a 15 min hold cannot be set).
- **Expected to change in 6.1:** the three "documents today" tests in the clamp group and the two in the auto-advance group; rewrite them on purpose to the new contract (one shared clock, no queued advances, wider ranges), do not loosen them.
- **Checks:** 41 files, 661 tests (1 todo), typecheck and build clean, golden unchanged.
- **Not verified:** real-browser frame pacing (the harness has no renderer), real GPU.

## v0.14.8 — the white flash at the start of a change (unreleased)

Reported: at the start of a composition change (click or timer) some shapes suddenly change colour in one frame, whatever the strategy or template; noticed long ago.

- **Cause** (long-standing, from the graphic shadow planes of Stage 4): a shape that can have a shadow plane carries one as a hidden child, a copy of its own geometry in a plain white `MeshBasicMaterial` until it is given a colour. A change tweens the child from where it is to where it is wanted, and `Tween.add` switched it on (`visible = true`) for the whole change **even when it was tucked behind its parent at both ends**, i.e. exactly where its parent is: a white copy of the shape drawn over the shape, winning the depth test in places and flickering, for as long as the change ran. Found by comparing the exact first frame of a legacy change with the picture before it (v0.14.1: 4,734 near-white pixels that were not in the previous picture, a white wedge where a triangle showed behind another shape), then hiding the triangle's children.
- **Fixed** (`Tween.js`, `shadow.js`): (1) a shadow plane that is tucked at both ends is not drawn at all during the change; one that comes out from behind or goes back is drawn, as before; (2) one that comes out from behind starts in the colour it will have, not in the colour it had when it was last tucked away (white by default); (3) the shadow plane's material has a depth offset, so it can never win a depth tie against its parent. Rest images unchanged: render guard 0.000% on axis-thrust-faceted and disc-beams-subtle.
- **Measured** (`tools/verify/first_frame_check.py`, new): near-white pixels in the first frame of a legacy change, 3 to 4: 4,734 before, 0 after; legacy 4 to 5 and 5 to 6, axis-thrust 11 to 159 and back: 0.
- **Tests:** three in `tests/shadow.test.js` (tucked at both ends: never visible through the change, sabotaged: forcing it visible fails; coming out starts in its final colour; the depth offset). 40 files, 650 tests.
- **Also in v0.14.7 and not repeated here:** hatching goes through the transition.
- **Not verified:** real GPU; I looked at the first frames of legacy and axis-thrust changes only, not every strategy and template; if some other abrupt colour change remains, the lab switches (hatching, edge character, event clock, colour front) from the previous message are still the way to isolate it.

## v0.14.7 — hatching goes through the transition (unreleased)

Reported: colours of shapes change abruptly, in a single frame, usually at the start of a transition (on a click and on the timer).

- **Found and fixed:** the hatching of Stage 5.2c was set on a surface at once when a change began (its angle, seed and on/off follow the new composition), so the lines on the Mass backdrop and on shadow planes turned, came or went in the first frame. It now goes through the change like the colour: the surface keeps what it had (`uHatchFrom*`) and the old lines fade out as the new ones fade in, driven by the colour front for a pigment mesh and by the shadow plane's own progress for a shadow (`uHatchMix`, set in `Tween.js`); at rest (progress 1) only the new hatching is drawn, so every still is exactly as before (render guard 0.000% on mass-hatched-529 and axis-thrust-faceted). Program key `pigment-response-13`. Tests: three added to `tests/hatch.test.js` (what a surface had is kept; a shadow plane remembers too; the old hatching is skipped at rest). 40 files, 647 tests.
- **Not reproduced, so not fixed:** real, un-held frames after a change (`tools/verify/transition_frames.py`, new) are smooth on the builds I could run (v0.14.1, 5.2a, 5.2b and the current one; software GL): no frame-to-frame spike for axis-thrust 11 to 159 in any of them, and the first-frame difference on a Mass change was 2.5 before this fix and 2.3 after, against 1.5 for v0.14.1 (frame times differ between the builds, so the numbers are noisy). That leaves something I have not found; see the isolation steps in the reply.
- **A harness that proved nothing:** freezing the clock early in a change (lab hold) showed, in some runs of the 5.2b and later builds, every shape already at the end of its change, and in other runs of the same code the right first frame. The outcome varied between runs of identical code, so I did not use it as evidence either way.

## v0.14.6 — Stage 5.4: the materials answer the event clock; fixed or evolving surfaces; the lab regrouped (unreleased)

Last step of Stage 5. Composition changes already raise a shared `energy` (core/Rhythm.js: it rises over 0.35 transition durations and settles over up to 1.8, capped by the auto-advance interval); until now only the ground's own motion followed it.

- **Response** (`DYNAMICS.response`, per-frame uniform `uEnergy` from the loop): while energy is up, the edge band widens by up to 40%, the silhouette softens by up to 40% and the paint's tooth lifts by 15% (visibility 0.03 to about 0.0345); all by fraction of their value at peak energy, all back to exactly nothing at rest. Hatching stays fixed (it would read as flicker). Strategies only (a per-mesh share, `uRespAmt`); a lab switch and a strength each. Program key `pigment-response-12`.
- **Fixed or evolving surfaces** (`surfaceMode` in `paintSeed.js`, lab switch "Patterns evolve with each change", default off). Fixed: a form's paint, edge and silhouette noise belong to its slot, as before. Evolving: the slot's seed is shifted by an offset that depends on the composition seed only (`paintSeedFor`), so the grain is re-drawn at each new composition seed, the old grain crossfading under the colour front like any change of paint; legacy never evolves. Takes effect at the next change. Hatching follows the picture's seed in both modes.
- **Blending is strategy-only now** (a change to 5.3, found while checking legacy): the silhouette's alpha needs blended materials, and they were blended for every composition; they are now `transparent` only under a strategy (`setEdgeNow` toggles it, with `needsUpdate`), so the legacy generator is drawn exactly as before 5.3.
- **Lab regrouped:** Pigment (Paint and Hatch, plus the evolve switch), Edge, Response (new), Support (the ground, renamed), all on the Surface tab; hatch labels now start with "Hatch". Only group names and order changed: every setting key and its saved value survive (a test lists them).
- **Measured** (`tools/verify/response_check.py`, new; software GL):
  - **Rest unchanged:** render guard against the baselines (energy is 0 at rest, evolve off): axis-thrust-faceted, central-cluster-pale, mass-hatched-11 0.000%; after the blending change disc-beams-pale and axis-thrust-subtle 0.000%.
  - **Response at peak** (axis-thrust 11 to 159, clock held at 0.35 durations, energy 1.00): response on vs off changes 16.56% of pixels, 1.59% by more than 6 levels, max 55; 0 shader errors. Visibly: a slightly grainier paint and slightly softer edges while the shapes move.
  - **Evolve:** the surface of axis-thrust 159 reached by a change from 11 is identical, pixel for pixel, to the same seed made directly (100.000%, max difference 0), and differs from the fixed surface in 24.06% of pixels (16.39% by more than 6 levels); 0 errors.
- **Tests:** `tests/response.test.js` (12: fixed vs evolving seeds, the legacy gate (sabotaged: removing it fails), the response factors in the shader, hatching not among them, a mesh's share only under a strategy, the regrouped lab keeps every old key). 40 files, 644 tests.
- **Not verified:** real GPU; the response and the evolve switch during live playback (stills were taken with the clock held); the evolving surface mid-change (the edge and silhouette noise follow the new seed at once, only the paint grain crossfades; a small, brief step, not looked at); legacy mid-transition against v0.14.1: two attempts at that comparison gave 99.76% and 71.9% identical because the held frames were at different states in the two builds (timing, not a render difference: both showed different layouts), so it proves nothing either way; legacy at rest is identical (guard, legacy checks), and the blending change above makes its draw path the old one again.

## v0.14.5 — Stage 5.3: silhouette softness, irregularity and shadow registration (unreleased)

Third part of the Stage 5 edge work. Where a form's outline meets the paper (or what is behind it) the edge is now narrowly soft and a little irregular, and each graphic shadow plane is a little out of register. Strategies only; legacy has none.

- **Silhouette:** an edge is on the outline when the face beyond it looks away from the camera (the camera is orthographic and the forms convex); a crease between two faces we can see keeps full coverage. The shader tests every edge of a face (`silCover` in `PigmentResponse.js`): a box face's two plane axes, an extruded cap through the 5.2b distance field's direction, an extrusion's side wall through its two caps. Where the edge is on the outline, the fragment's alpha ramps from 0 at the edge to 1 at `softness` inside it, with the distance first eroded by a slow (2.9 per unit) and a fine (18 per unit) noise scaled by `irregularity`. Rods and the sphere have none. Irregularity can only erode: an outline loses about softness/2 plus up to irregularity.
- **Blended, not alpha to coverage.** The first version used alpha to coverage on the multisampled canvas; three r160 forces the alpha of an opaque material to 1, and after working around that it drew bright white fringes in the software renderer the checks run in (a constant 50% alpha turned shapes white). Every pigment material is now `transparent: true`: sorted back to front, depth still decides what is in front, alpha is 1 everywhere except at an outline. Legacy canvas identical (below). Shadow planes stay opaque and are drawn first.
- **Defaults** (`DYNAMICS.silhouette`): softness 0.008 and irregularity 0.006 world units (6 units are the canvas height; about 1 px at 1x). First tried 0.012 and 0.01 (about 1.5-2 px at 1x), judged stronger than "barely noticeable on screen, clear at 4x" and lowered. Lab: "Silhouette softness" and "Silhouette irregularity" in the Edge group. Program key `pigment-response-11`.
- **Registration:** each shadow plane's offset is a little longer or shorter (up to 15%) and turned a little (up to 6 degrees), seeded by scene and form (`shadowJitter`, `SHADOW.jitterLength`/`jitterAngleDeg`); how far behind it lies is not jittered.
- **Measured** (`tools/verify/silhouette_check.py`, new; software GL):
  - **Legacy canvas** (seed 3) identical to v0.14.1: 100.000%, max difference 0 (checked at the final code); shader and page errors 0 on every scene shot.
  - **Silhouette on vs off, 1x** (share of pixels changed / by more than 6 levels / max): disc-beams 122 0.77% / 0.71% / 151; central-cluster 529 0.72% / 0.65% / 161; axis-thrust 11 1.45% / 1.23% / 152; at 4x 0.5-0.9% by more than 6.
  - **Render guard:** all eight scenes now differ from their baselines, as expected: axis-thrust-faceted 1.260% of pixels over tolerance, axis-thrust-subtle 0.961%, central-cluster-faceted 0.764%, central-cluster-pale 0.646%, disc-beams-subtle 0.712%, disc-beams-pale 0.930%, mass-hatched-11 1.288%, mass-hatched-529 1.348% (worst 40 px tile 7-9%, mean abs 0.24-0.51). **Re-shot** (all eight) after you had looked at the stills.
- **Two defects the stills caught and fixed:** (1) spikes at the corners of thin boxes: only the nearest edge was softened, so a corner whose nearest edge was a crease stayed solid; now every edge counts. (2) the white fringes above.
- **Tests:** `tests/edge.test.js` grew to 14 (the silhouette shader's structure; sabotaged: replacing the both-edges rule with the nearest edge fails it), `tests/shadow.test.js` has 3 jitter tests (bounds, determinism, plain offset without jitter) and its offset test now follows the jitter. 39 files, 632 tests.
- **Not verified:** real GPU (alpha blending, sorting); depth sorting where strategy shapes interpenetrate (legacy matched; strategies not examined for this); mid-morph; the shadow jitter in a still (bounds and determinism are tested, not looked at); rings, frames and crescents in a real scene.

## v0.14.4 — Stage 5.2c: hatching (unreleased)

Graphite-style parallel lines as a tonal field, the way the lithographs treat a dark field and a soft plane. Strategies only; legacy has none.

- **Who:** the Mass strategy's backdrop when it is dark (its great disc or large box, its `anchor`, or the large dark plane behind a pale one, a `support` plane; a pale backdrop and the assembled blocks in front of it stay smooth), and about half of the graphic shadow planes of a picture (`DYNAMICS.hatch.shadowShare`, picked by seed so some stay flat).
- **Look:** one angle per picture from six diagonals (35, 45, 55 degrees, rising or falling), shared by every hatched surface in it; spacing 0.06 world units (6 units are the canvas height; a world length, so an export has the same lines, only sharper); width 0.3 of the spacing; a line goes 13% toward the ink on a light or mid surface and 10% toward the paper on a dark one (the switch is the surface's linear luminance, 0.2); each line has its own strength, drifts a little along its length (wander 0.2 of the spacing) and breaks now and then; no cross-hatching.
- **Where it lies:** in the surface's own plane, in world lengths along the form's own axes (the same coordinates the paint uses), so the lines belong to the form: they move, scale and grow with it, nothing swims over it during a morph. The consequence: "one angle per picture" is relative to each form, so a hatched surface that is turned has its lines turned with it.
- **How:** `texture/hatch.js` (new). The pigment shader applies it after the edge block (program key `pigment-response-10`, per-mesh amount, angle and seed on the colour-front state); a shadow plane is a flat `MeshBasicMaterial` child, which now gets the same lines from a small patch (`installShadowHatch`, programs shared by one cache key). Antialiased with `fwidth`.
- **Lab:** new group "Hatch" on the Surface tab: Hatching on, Spacing, Line width, Toward ink, Toward paper, Wander, Breaks. Defaults in `DYNAMICS.hatch`.
- **Measured** (`tools/verify/hatch_check.py`, new; software GL):
  - **Legacy canvas** (seed 3) identical to v0.14.1: 100.000%, max difference 0; shader and page errors 0 on every scene shot.
  - **Hatching on vs off at 1x:** mass 11 9.27% of pixels change (7.51% by more than 3 levels, max 45), mass 529 6.56% (5.37%, max 48); axis-thrust 11 (shadow planes only) 0.19% (max 10), axis-thrust 159 none (no shadow plane picked).
  - **Shadow planes are thin slivers** (an offset of 0.05 to 0.22 units, one to three lines wide), so their hatching reads as fine ticks at 4x and is nearly invisible at 1x. Finer spacing for shadows is the knob if you want it to show.
- **Render guard:** two Mass scenes added (`mass-hatched-11`, `mass-hatched-529`; Mass has no tonal mode, so their mode is `None`), 8 scenes now. The six older scenes still match their baselines (the three shot again after hatching: 0.027% over tolerance at most, max 10; no re-shoot needed).
- **A first version** hatched the dark assembled blocks too (any dark `cube-variable` with role 'support'); seen in the first still, restricted to the backdrop. A first wander of 0.35 with a short period read as wavy lines at 4x; now 0.2 with a longer period.
- **Tests:** `tests/hatch.test.js` (10; sabotaged: letting any 'support' shape count as backdrop fails it, and so does hatching shadow planes under legacy). 39 files, 626 tests.
- **Not verified:** real GPU; hatching during a morph or a seed change (it is attached to the form, but I did not shoot a mid-change still); a shadow plane on a frame, ring or crescent in a still; the Mass backdrop disc at 4x (the stills are boxes).

## v0.14.3 — Stage 5.2b: edge character on extruded outlines and discs (unreleased)

The edge band of 5.2a now also runs on the triangle, frame, circle, crescent, ring and segment (the extruded outlines and the flat disc), in composition strategies only. Rods and the sphere still have none.

- **How:** `texture/edgeField.js`. The outline is read off the geometry itself, so no shape file changed: on the front cap, an edge that belongs to one triangle only is on the outline (a frame's or ring's hole included). For a 128 x 128 grid over the bounding box the field stores the distance to the nearest outline segment and the direction to it (half-float RGBA, 128 KB), one texture per distinct outline, kept for the life of the page. The shapes are scaled non-uniformly, so the shader multiplies the local distance by |scale * direction| to get a world distance; the band applies to the two caps (the sides of the extrusion keep flat edges) and is never wider than 0.3 x the shape's inscribed radius x its smaller scale, so a ring's band fits its width, not its diameter. Program key `pigment-response-9`.
- **`edge.js`:** `edgeKind(mesh)` is 'box', 'field' or null; `setEdgeNow` sets the amount, the kind, the field and its radius, and takes them away again under legacy.
- **Measured** (`tools/verify/edge_check.py`, now with shader and page error capture, an optional legacy comparison and a `CROP` for 4x stills):
  - **Legacy canvas** (seed 3) identical to v0.14.1: 100.000%, max difference 0.
  - **Shader and page errors:** 0 on all four scenes shot. A first version declared `uBBMin`/`uBBMax` in the vertex stage only: the fragment shader failed to compile in the browser (unit tests cannot see that) and the scene went blank; found by the legacy check and the console, fixed, and the check now fails on any shader error.
  - **Edge on vs off** (1x frame, share of pixels changed / by more than 3 levels / max): disc-beams 122 4.42% / 2.23% / 68; central-cluster 529 5.79% / 2.26% / 52 (boxes only); axis-thrust 11 8.32% / 3.60% / 74 (beams and the triangles). The discs and triangles show a rim of the same width as the beams'.
- **Render guard** (against the 5.2a baselines, which are now stale for scenes with discs or triangles): axis-thrust-faceted 0.370% over tolerance (worst 40 px tile 16.5%), disc-beams-subtle 0.532% (9.6%), disc-beams-pale 0.448% (ok); the other three scenes were not shot. **Re-shot** (all six) once you had looked at the stills.
- **Tests:** `tests/edge.test.js` grew from 5 to 11 (outline of a triangle, a hole, a disc; distances and directions of the field; one texture per outline; the set/unset of the field under strategy and legacy). Sabotaged: reversing the direction and counting shared edges as outline both fail it. 38 files, 616 tests.
- **Not verified:** real GPU; the ring, frame, crescent and segment in a real composition (none of the four seeds shot has one: they are covered by the outline tests on stand-in geometry, not by a still); a hole's band at 4x; the field's memory (about 128 KB per outline, six outlines at most).

## v0.14.2 — Stage 5.2a: edge character on box-like faces (unreleased)

First part of the Stage 5 pigment step. Where a face meets its edge the paint is now a little thinner (the paper shows through, broken up by the grain, so it is not an outline) and, a little further in, a little thicker (it pools). Subtle on screen, clear in a 4x export.

- **Where:** the faces of box-geometry shapes (cubes, planes, beams) in **composition strategies only**; rods (a hairline: the whole width would be band) and the extruded outlines (triangle, frame, circle, crescent, ring, segment: stage 5.2b) do not have it. `texture/edge.js` decides (`hasEdge`, `edgeWanted`, `setEdgeNow`), set where a mesh is created and where an existing one is re-targeted (Composition.js), so a mesh that goes from a strategy back to the legacy generator loses it.
- **How:** in the pigment shader, after the highlight. The distance to the face's edge is exact for a box centred on its origin (half the face's size minus the position in the face's plane); the band is capped at 22% of the face's narrower side so a thin plane's side is not all band. Thinning mixes toward the palette's paper (`setEdgePaper`, updated with the ground's paper), pooling darkens a ridge just inside. Program key `pigment-response-8`.
- **Lab:** new group "Edge" on the Surface tab: Edge character on, Band width (0.005-0.1 world units; 6 units are the canvas height), Thinning, Pooling. Defaults in `DYNAMICS.edge` (0.03, 0.18, 0.06); the grain that breaks the band (`DYNAMICS.edgeGrain`: frequency 160, floor 0.35) is compiled in.
- **Measured** (`tools/verify/edge_check.py`, new; axis-thrust seed 11, software GL):
  - **Legacy canvas** (seed 3) identical to v0.14.1: 100.000%, max difference 0 (a first version applied the band to every composition that had a config, legacy included: 2% of pixels, max 55; caught by this check and fixed).
  - **Edge on vs off:** 7.25% of pixels change (2.96% by more than 3 levels, max 46); at 4x (2880x2240) 6.98%: confined to the bands around beams, cubes and planes. The red triangle and the other extruded shapes are unchanged.
- **Render guard:** the strategy baselines now differ on purpose: axis-thrust-faceted 1.311% of pixels over tolerance (worst 40 px tile 8.9%, mean abs 0.349), central-cluster-pale 0.722% (12.7%, 0.249), disc-beams-subtle 0.381% (ok). The other three scenes were not shot. **The baselines are not re-shot yet**, pending your look at the stills (`edge_axis-thrust_11_1x_off_on.png`, `edge_axis-thrust_11_4x_crop_off_on.png`).
- **Tests:** `tests/edge.test.js` (5; sabotaged: dropping the strategy condition from `setEdgeNow` fails it). 38 files, 610 tests.
- **Not verified:** real GPU; edge character with the colour front in flight (the band is added after the front, so it rides the colour, but I did not shoot a mid-change still); the other three render guard scenes.

## v0.14.1 — Stage 5.1b: the ground cached in a render target (unreleased)

Second half of the Stage 5 "support" step. The ground shader (4-octave fbm, Worley cracks, twice during a morph) used to run over every pixel on every frame, even at rest (Appendix A §9.1 of PROJECT_STATE). Now it is drawn into a render target of the drawing buffer's size **only when one of its inputs changes**, and the scene draws a one-texel-per-pixel copy of that target (`texelFetch`, no filtering).

- **Inputs that trigger a redraw** (`groundSignature()`: every ground uniform plus the buffer size): a morph in progress (one redraw per frame while it runs), a lab edit, a palette change (paper colour), an orientation or resize, an export scale (the target is resized for the 2x/4x render and again on restore), the ground switched off and on. At rest: no redraws.
- **Colour:** the target is 8-bit sRGB (`SRGBColorSpace`), written encoded, read back decoded and encoded again by the copy, so the bytes are the ones the shader used to write to the canvas.
- **Measured** (`tools/verify/ground_cache_check.py`, new; v0.13.2 as the reference build; axis-thrust seed 11, software GL, fresh pages):

| | result |
|---|---|
| settled canvas, old vs new | 99.887% of pixels identical, the rest differ by 1 level in one channel (rounding); 0 pixels over 1 level |
| paused mid-morph (hold 1.0), old vs new | the same: 99.887% identical, max 1 level |
| ground switched off and on | back to exactly the same canvas (0 difference) |
| ground draws at rest over 3 s | 0 (82 -> 82); one lab edit: 1 redraw; held (paused) mid-morph: 0 |
| ground draws after rapid changes | 16 per 4 s while morphing, 0 once the morph has ended (about 12 s in software GL) |
| frame interval at rest (software GL, ratio only) | 93 ms -> 17 ms (the display's frame cap); `resources_check.py` with everything on: 193 ms while the ground was still settling, **71 ms** at rest (ground off: 55 ms; the old doc figure was about 210 vs 65) |

- **Unchanged:** render guard 4 of 6 scenes re-shot against the baselines (axis-thrust-faceted, central-cluster-pale, axis-thrust-subtle, disc-beams-pale): 0.000% over tolerance, max 1 level; exports: 1x equals the screen (0.08/255), 4x downsampled vs 1x 0.80/255, paused mid-change export too; geometries, textures and programs stay flat over 49 changes, heap flat (13.2 -> 13.9 MB). Layouts, goldens and legacy canvas pixels: not touched.
- **Tests:** three added to `tests/ground.test.js` (the copy shader, the change detector, the signature: constant at rest, changed by a seed change, the palette, the aspect and the lab). Sabotaged: a detector that never reports a change fails; a signature that leaves out all five motion inputs fails (leaving out only two does not, the others carry the morph, which is fine). 37 files, 605 tests.
- **Tools:** `resources_check.py` now waits for the morph to end before measuring "at rest" (it measured a still-morphing ground before).
- **Not verified:** real GPU behaviour (the saving is large in software GL; on a real GPU the shader is cheaper, so the gain is smaller but at rest the ground now costs one texture copy); a 4x export on a GPU with a small `MAX_RENDERBUFFER_SIZE` (the existing clamp covers the canvas, the extra target has the same size); the other two render guard scenes.

## v0.14.0 — Stage 5.1: the paper overlay retired (unreleased)

First step of Stage 5 (procedural analog materials and edge treatment). Decision: the ground is the only paper layer and the palette colours show as defined.

- **What was measured first** (`tools/verify/layer_audit.py`, new; axis-thrust seed 11 and central-cluster seed 529, 720x560): the DOM paper overlay (a 512 px sheet, `mix-blend-mode: multiply`, opacity 0.5, over the whole stage) added **no measurable texture** (paper std/mean 0.0297 with the ground alone, 0.0297 with the overlay; 0.0270 vs 0.0285 in the second scene) and acted as a uniform darkening and warm cast:
  paper mean luminance 225 -> 209 (-7%), shapes 147 -> 137 (-7%), mean RGB shift of shapes about (-10, -11, -13), of the paper about (-14, -16, -20); the darkest ink 45 -> 42. The paint's own share of shape contrast is small (std/mean 0.370 with, 0.363 without); it lowers the shapes' mean luminance by about 6.
- **Removed:** `#paper-overlay` (index.html, panel.css), `OVERLAY_OPACITY`, `SceneManager.getOverlayCanvas/getOverlayOpacity`, `tintStructure`, and the exporter's manual multiply (`composeExport` now only copies the canvas). `PaperTexture.paperStructure()` stays for the legacy pigment pool.
- **What changes on screen:** the stage shows the WebGL canvas as it is: paper and shapes about 7-8% lighter and cooler than before. **The canvas pixels do not change**: the render guard's six baselines still match with 0.000% difference (they read the canvas, which never included the overlay), the 1x PNG export equals the screen (mean abs difference 0.08/255), 4x downsampled vs 1x 0.80/255 (as before). Layouts and goldens untouched; legacy canvas pixels untouched.
- **Tests:** `tests/pngExport.test.js` (3; sabotaged: re-adding a multiply pass fails it). 36 -> 37 files, 599 -> 602 tests. The verify tools that screenshotted `#paper-overlay` now screenshot `#stage-wrap`.
- **Not yet done from the 5.1 plan:** caching the ground in a render target (5.1b, separate step).

## v0.13.2 — handoff: docs only (unreleased)

No code change. Closes the work after Stage 4 and prepares Stage 5.

- `docs/PROJECT_STATE.md` refreshed: the roadmap table (Stage 4 is done; the fixes, palettes, Library and assembly strategies are listed), the commands and tools, the lessons of this stretch (§3),
  the verification section (36 files, 599 tests; 95 golden layouts in 32 groups; the render guard), the known limits, a compact §9 and a new §10 (work after Stage 4) and §11 (Stage 5 starting notes and a starter message).
- `docs/prompt.md` (the roadmap) is now in the repo, so a new chat has it; it ends with the palettes-and-presets request, which is done.
- **Render guard re-run** at v0.13.1: all six scenes match the baselines with 0.000% difference (closes the 'not re-run' item of v0.10.8-v0.13.1).
- Still not verified: the Library with the ground on, the pale Mass scenes on every palette, the 'Save a copy' click in the panel.

## v0.13.1 — Mass: pale backdrops (unreleased)

The weakest two presets of v0.13.0 (the disc and the box) came out dark where the originals are pale. Mass now gives about 45% of scenes a **pale backdrop**: the backdrop (a great disc, or a large plane) takes the palette's lightest neutral,
and the boxes keep clear of that colour. With planes enabled, a pale disc stands on a **dark framed field** (a large flat plane behind everything, in 70% of such scenes), as the lithograph's disc does: a pale disc on pale paper is nearly invisible.

- Drawn from its own streams (`backdrop-tone`, `field`), so no other draw moved: the scenes that stay dark are identical to before. The three Mass golden groups were regenerated (the 23 original groups are still byte-identical to v0.12.0).
- Tests: a share test (30-65% of scenes pale on the lithograph palette) in `tests/newStrategies.test.js`; the solver tests, which run every strategy, still pass. 36 files, 599 tests; typecheck and build pass.
- Library: **Disc and boxes** re-picked (seed 4740: a pale disc on a dark framed field with a dark assembly and a long rising beam; close), **Great box on a turned grid** keeps seed 9099, now a pale slab with a dark box on it. Re-checked through the panel.
- Preset tools: `specs.mjs` can require a pale backdrop (`lightestOf`).
- Not re-run: the render guard (the scenes it shoots use the older strategies), the Library with the ground on.

## v0.13.0 — Tower, Cross and Mass: assembly strategies; the Library re-picked (unreleased)

Upright compositions and assembled (edge to edge, stepped) forms, the two gaps the reference study found. Three new strategies, after the original three in the selector; nothing existing changed
(the 23 older golden groups are byte-identical to v0.12.0; legacy, Axis thrust, Disc and beams and Central cluster are untouched).

- **Tower**, **Cross** (a cross variant and a column variant) and **Mass**: see the README. They compose in screen space like the others, so size, spread, locks, palettes, the paint slots and the depth solver work as before;
  each owns its shape counts and declares `uses`; `strategies/assemblyKit.js` holds the shared bar builder (size, spread, orientation per type, a thickness cap) and colour plan.
- **Depth**: neighbouring boxes of a tower or a mass are 0.8 apart in depth and blocks are never thicker than a slab (H x 0.08), because the solver tests (which run every strategy) showed that a stack of
  thick boxes at 0.25-0.62 spacing was reordered and shifted too far (mean shift, reversed pairs, intersecting large shapes). Depth moves nothing on screen.
- **Tests**: `tests/newStrategies.test.js` (31: registered, reproducible, owns counts, few types, roles, one chromatic hue on every palette, clip planes at the UI limits, size and spread honoured; tower upright and tall,
  cross both variants upright and level, mass on one turned grid), nine new golden groups (tower, tower-portrait-all, tower-few-types, cross, cross-landscape, cross-few-types, mass, mass-portrait-all,
  mass-few-types), and the existing `strategySolver.test.js` now runs the new strategies too. 36 files, 598 tests; typecheck and build pass.
- **Library: 11 presets.** Re-picked under the new strategies: The floating cube (cross, column), Red bar and frame (cross), Great box on a turned grid (mass), Long diagonal (mass), Disc and boxes (mass), and **The tall tower**
  (tower; left out in v0.12.0). The other five keep their picks. Re-checked through the panel beside their references (`render_library.py`); `docs/PRESETS.md` has the new table (the cube and the red bar are close).
- **Preset search**: a compactness term (separate ink masses against the reference's), `specs.mjs` entries for the new strategies, `VARIANTS=1` sweeps of spread, size and snap rotation. The sweeps lowered the score by scattering
  and shrinking forms, and the renders looked worse (the tower dissolved into floating pieces), so the picks use each strategy's native spread and size; the sweep stays as a tool, with that warning.
- **Not re-run**: the render guard (the scenes it shoots use the three older strategies, unchanged), the ground-on renders of the Library, and the Lab/UI beyond confirming the three names appear in the Composition select.

## v0.12.0 — the Library: ten presets after Lissitzky's Prouns (unreleased)

Phase 2 of the palettes-and-presets work. See `docs/PRESETS.md` for the table, the method and the limits.

- **Presets panel: a read-only LIBRARY** under the saved list: ten compositions, each with Load (▶) and "Save a copy" (⧉, into your own list; the 20 cap applies to copies only). The hover title says what it is after and how close it is.
- **Also a file**: `presets/proun-library.json` in the importable record format (Presets > Import).
- **Complete configs**: each preset is built on a fresh config (`appConfigContext`, now exported from `config/store.js`), so loading one never inherits the loader's settings.
- **Made by search, chosen by eye**: reference descriptors (`describe_refs.py`) -> 12,000 seeds per target scored on a coarse ink raster (`search.mjs`) -> top three rendered beside the reference (`render_candidates.py`) ->
  `library_entries.mjs` -> `build_library.mjs`. Two of the ten are close to their originals (floating blocks on pale ground; black disc and plane), the rest are the same family and feel, loosely.
- **Left out, with reasons**: the tall tower lithograph (vertical, unreachable by the strategies: candidates unrelated) and the two figurines (not Prouns). The strategies cannot make upright compositions;
  "Red bar and frame" is therefore diagonal.
- **Tests**: `tests/library.test.js` (7) and `tests/golden/library.json` pinning every preset's layout; 35 files, 510 tests; typecheck and build pass; the generator's own goldens are unchanged.
- **Browser**: all ten loaded through the real panel (open Presets, click Load) and shot beside their references (`tools/presets/render_library.py`, ground off for speed: the compositions were judged without it).
  Not checked: the Library with the ground on for all ten, "Save a copy" in the UI (the store path is tested), the render guard (unchanged generator and classic palette; not re-run).

## v0.11.0 — palettes revised against the reference Prouns (unreleased)

Phase 1 of the palettes-and-presets work. See `docs/PALETTES.md` for the table and the reasons.

- **15 palettes became 11.** Colours measured from the reference paintings, gouaches and lithographs (clustered in Lab), not remembered. Six near-duplicates (red + warm greys on
  near-white) were merged; "Black Square" (Malevich's) and the flat-primary and cobalt palettes were dropped; new: a mid-grey ground, a pale graphite monochrome, cream-and-vermilion,
  lithograph-on-cream and gouache-on-toned-paper monochromes. Proun 99 (ochre) and 19D were corrected from the images; Red Wedge was made starker. **No pure black anywhere**.
  `Proun — classic`, `Proun — cool grey` and `Wolkenbügel` are unchanged.
- **Old names still load**: `PALETTE_ALIASES` (palettes.js) and `resolvePalette` (SceneConfig, new context option `paletteAliases`) map a removed name to its successor for
  presets, share links, history and saved sessions; an unknown name keeps the palette in force as before.
- **Tests**: `tests/palettes.test.js` (valid hex; classic pinned exactly; greige ground and painter's black; a tonal range of neutrals; at most two saturated hues; no near-duplicates;
  at least two monochromes and a mid-grey ground; every removed name has a live alias; aliases resolve through the app's config, with and without the option). 34 files, 503 tests;
  typecheck and build pass.
- **Goldens**: the scenarios that named removed palettes (Kestner -> cream and vermilion) or a changed one (Red Wedge) were regenerated: 192 of 591 entries changed, **colour only,
  no layout change**. The render guard is unaffected by design (it uses classic); it was not re-run for this change.
- `tools/verify/palette_sheet.py`: every palette on the same composition under the real renderer (tones, shadow planes, highlights, paper). Checked on axis-thrust seed 159: all
  eleven read well; the monochromes carry their tonal range through the Stage 4 tones; cream-and-vermilion's rose-brown beams were desaturated after the first look.

## v0.10.8 — fixes: circles flat, the paint grain no longer jumps on regeneration (unreleased)

- **Circles take no shadow plane and no highlight.** A circle has no volume to lift off the page and looked poor with either. `SHADOW.types` and `HIGHLIGHT.types` are now
  triangle, crescent, segment, beam; a circle is never picked for a highlight, however large, even as the anchor. The disc scenes of the render guard were re-shot.
- **The texture glitch on regeneration.** When a regeneration matched a shape with a different "part" (`setPaintSlot`), its paint seed changed at once, and the old colour
  layer under the overpaint front was drawn with the NEW seed's grain: the whole texture of the shape jumped at the first frame of the change (and, because grain reads as
  light and dark, its colour with it). This predates Stage 4 (the Stage 3 build does the same). The old seed now rides the front like the old colour: new `uSeedFrom` per mesh,
  set by `setPaintSlot` and kept by `Tween.add` (the seed in force when a change interrupts another), and a second paint-field lookup in the shader only while a front is running
  and the seeds differ (`pigment-response-7`). A mesh that keeps its part, a new mesh and a mesh with no front are unaffected.
- **Measured** (`tools/verify/glitch_scan.py`, new: freezes the real advance button's change at slider ~0 and compares it with the picture just before, over the pixels that are
  shape in both; axis-thrust, three regenerations): pixels differing by more than 12 went from 3.6% / 6.6% / 26.8% to 0.4% / 2.5% / 0.8%. Not zero: what remains has not been
  attributed (edge antialiasing, an interrupted change's older layer, which still shares one old seed, and shapes that overlap a leaving one are candidates).
- Tests: seed tests in `tests/composition.test.js` (every strategy: a shape that takes another part's paint keeps the old seed, one that keeps its part and a new one show only their
  own, an interrupting change keeps the seed in force at that moment), sabotage-checked; the circle cases in `shadow.test.js` / `highlight.test.js`. 33 files, 494 tests; typecheck and
  build pass; the 71 golden layouts are unchanged.

## v0.10.7 — Stage 4.4: the render guard (unreleased)

Closes Stage 4. `tools/verify/render_guard.py` shoots six stills and compares them with the PNGs in `tools/verify/baseline/` (about 2.6 MB, in the repo):
axis-thrust faceted and subtle, disc-beams subtle and pale, central-cluster faceted and pale. Not in `npm test` (software-GL rendering takes minutes); run it detached.

- **Fixed capture:** a 1280x800 viewport, which gives the canvas its fixed 720x560 (the app's frame does not allow 800x600 at any viewport; the size is asserted, so a
  layout change fails the guard). Seeded random streams, software WebGL, the picture waited out until three canvases 1.5 s apart are identical.
- **A fresh page per scene**, because the app's seeded streams (paint grain, ground) advance with what was drawn before: a still shot after other scenes is not the same
  still shot alone. With it, any subset (`--only name`, repeatable) reproduces the same pictures; `--update` re-shoots the baselines.
- **Tolerance:** a scene passes if at most 0.5% of its pixels differ by more than 6/255 in any channel **and** no 40x40 tile has more than 15% of its pixels over that
  (the global share alone missed a highlight strength change: 0.15-0.4% of the picture; GPU antialiasing differences are thin lines along edges, a few percent of a tile).
- **Refuses to shoot a stale dev server** (one that serves `store.js` under two URLs after edits: the scene update would go to a copy the app does not use and the still,
  and a baseline, would be the default scene). The mode each seed gets is checked too: if the tone mix changes, it asks for new seeds.
- **Sabotage-checked** on fresh servers (each break must fail the scenes that show it and pass the controls that do not): faceted dark factor 0.39 -> 0.55 fails both faceted
  scenes (4.3% and 13.3% of pixels), the subtle control stays at 0.000%; highlight strength 0.45 -> 0.15 fails both subtle scenes (worst tile 29% and 37%), the pale control stays 0;
  shadow colour mix 0.55 -> 0.20 fails both subtle scenes (worst tile 31% and 40%), the pale control stays 0. A clean run matches the baselines exactly on this machine (max diff 0).
- Tests: 33 files, 488 tests, typecheck and build pass; the 71 golden layouts are unchanged.

## v0.10.6 — Stage 4.3: selective highlights (unreleased)

A narrow light edge strip on the up-left side of the major forms of a faceted or subtle scene, opposite the shadow plane (new `src/texture/highlight.js`).

- **Who:** the scene's anchor and the largest one or two other forms by projected area (a seeded draw), among discs, triangles, crescents, segments and beams,
  never a `detail`. None in pale scenes, none under the legacy generator (legacy pixel-identical to the v0.10 build again: max diff 0, at rest and after a seed change).
- **What:** drawn in the form's own shader (no extra geometry): within a strip of the form's up-left edge (9% of its extent along that direction, clamped to
  0.04-0.16 world units) the colour is mixed 45% toward the palette paper, paint grain kept. Because it mixes whatever colour the form is showing, a colour change
  never leaves it behind. New uniforms `uHiAmt / uHiN / uHiBand / uHiTint / uHiStrength`, skipped by a uniform branch at amount 0; program key `pigment-response-6`.
- **Follows the form:** the strip's direction and edge are recomputed from the form's CURRENT orientation and scale (`updateHighlight`), every frame of a change
  that involves it, so it stays on the up-left edge while the form turns or resizes.
- **Changes:** the amount fades in and out on the geometry's easing; an interrupting change fades from where it is (`target.highlight` in `Tween`).
- Tests: `tests/highlight.test.js` (direction, who is picked and determinism, the object-space maths for any rotation and size, the fade, interruption, following a turn)
  and highlight blocks in `tests/composition.test.js` (every strategy and mode, pale, legacy, a change to and from pale); sabotage-checked. 33 files, 488 tests; typecheck
  and build pass; the 71 golden layouts are unchanged (render-only).
- Browser: the shader compiles and renders; contact sheet and full-size shots show the strip on discs, triangles and beams. Where a form's up-left edge meets the
  paper, the strip (a lighter tint of the form) is low-contrast, by design: it reads as the form losing saturation at that edge.

## v0.10.5 — Stage 4.2: the graphic shadow plane (unreleased)

A flat dark companion pushed down-right and a hair behind a form, as in the references (new `src/texture/shadow.js`). Decisions: a child mesh of its
parent, always down-right (no flip), the derived colour mix, none in pale scenes.

- **Who:** discs, triangles, crescents, segments and beams, unless the entry is a `detail`; not cubes/planks (their faces do the work), not rods, frames or
  rings (outlines would double into two lines). None in pale scenes, none under the legacy generator (legacy pixels unchanged: max diff 0 against the v0.10 build,
  at rest and after a seed change).
- **Where:** a child mesh with the parent's own geometry and one flat material, so it moves, scales, grows, shrinks, hides and is disposed with its parent
  (`disposeMesh` frees its material; the geometry is shared). Offset down-right on screen by 5% of the form's size (beams: half their thickness), clamped to 0.05-0.22,
  and 0.06 behind along the view axis, under the solver's smallest gap (0.18).
- **Colour:** the parent's colour toward the palette ink (55%), desaturated (35%), over the paper at 55%. **Pre-mixed and opaque, not real alpha**: a translucent
  extruded body blends twice where it overlaps itself, and a flat opaque plane is what the references show. (Deviation from the "about 55% opaque" wording:
  the look is the same over paper, flat over other shapes.)
- **Changes:** a shadow no longer wanted slides back behind its parent (offset to zero: hidden by it exactly) and a new one slides out, on the geometry's easing,
  its colour easing like the parent's; an interrupting change starts from where it is. Handled in `Tween` (`target.shadow`), scrub and pause included.
- Tests: `tests/shadow.test.js` (colour, offset, who/when, the frame maths, the easing, interruption, disposal) and shadow blocks in `tests/composition.test.js`
  (every strategy and mode: present when wanted, absent in pale scenes and for details, legacy none, a change to and from pale); sabotage-checked.
  32 files, 470 tests; typecheck and build pass; the 71 golden layouts are unchanged (render-only).
- Browser (`tools/verify/tone_check.py`, steps `legacy,sheet,full`): legacy pixel-identical; the nine strategy x mode scenes and full-size shots show the planes.
  Beam shadows are faint at their small offsets; they read mostly on discs and large flat forms.

## v0.10.4 — Stage 4.1: tonal profiles (unreleased)

The graphic tonal system for box-bodied solids under the composition strategies (new `src/texture/tone.js`). Decisions: faceted about 3:1, scene
mix 40 / 45 / 15 (faceted / subtle / pale), rods and beams always subtle, a mode change rides the colour front, legacy shading unchanged.

- **Mode per scene**, a pure function of (seed, strategy) (`toneModeFor`), weighted per strategy: axis-thrust 40/45/15, disc-beams 20/65/15,
  central-cluster 60/25/15 (average 40/45/15). Legacy: no mode, the fixed face tables, so legacy pixels are unchanged.
- **Roles, not light.** Each visible face of a cube, plank, rod or beam gets a role from the solid's target orientation as seen from the fixed
  camera: light (turned most to the top), dark (of the rest, turned most to the left), mid. Hidden faces are mid. A box that turns during a change
  carries its tones with it.
- **Tones are exact on screen for the solid's colour**: displayed luma factors light/mid/dark of faceted 1.18/0.72/0.39 (3.0:1), subtle
  1.04/0.95/0.86 (1.21:1), pale 1.20/1.15/1.09 (1.10:1), solved per colour (not by a gamma guess). A dark colour is lifted as a whole, up to 2.5x, so its
  darkest face stays above luma 32 (the references' blacks are never pure black). Light faces of pale colours clamp at white.
- **Only box-bodied solids** take part (cube-fixed, cube-variable, plane; rod and beam always subtle). Flat forms keep their cap/side tones, the sphere stays plain.
- **Rides the colour front.** `uShade` is replaced by `uShadeFrom` / `uShadeMid` (per material), driven by `shiftShade` / `setShade` in `materials.js`
  next to the colour layers in `Tween.add`: the tone that was in force shows under the new colour and the new tone arrives with it, including an interrupted change.
- `npm run tone` now measures the modes (300 seeds, landscape, classic palette; cubes/planks, brightest : darkest displayed face):

  | strategy / mode | p10 | median | p90 | before (v0.10) |
  |---|---|---|---|---|
  | faceted (all three) | 1.85-1.86 | 3.03-3.04 | 3.06 | 1.12 |
  | subtle | 1.10-1.21 | 1.21-1.22 | 1.22-1.24 | 1.12 |
  | pale | 1.05-1.09 | 1.10-1.11 | 1.10-1.11 | 1.12 |

  (p10 is low where a cube shows only two faces whose roles are light and mid.) Rods and beams about 1.1-1.2.
- Tests: `tests/tone.test.js` (profiles, mode mix, roles, exact tones, floor, the tone layers incl. interruption and Tween.add); sabotage-checked.
  31 files, 452 tests; typecheck and build pass; the 71 golden layouts are unchanged (tone is render-only).
- Browser (`tools/verify/tone_check.py`): legacy renders are **pixel-identical** to the v0.10 build at rest and after a seed change (max diff 0);
  contact sheets of the nine strategy x mode scenes and of cubes-only scenes show the three modes. The faceted -> subtle change was sampled, but a seed
  change also moves the geometry, so it does not isolate the tone: the ride is covered by the unit tests only.

## v0.10.3 — Stage 4.0b: hairlines run in front of the anchor (unreleased)

Answers the open question from Stage 3 (decision: front-bias, about 80%). A hairline in Axis thrust and Disc and beams drew its planned depth
uniformly from -1..3 around the anchor at 0, so a quarter of them sat behind the anchor, where the solver (which honours the plan since 3.1) hides
them. The one draw is now remapped (`frontBiasedDepth` in `strategies/shared.js`): 20% of the range maps behind the anchor (the interlaced look
stays possible), 80% in front. **No extra random number is taken**, so every other property of a hairline is exactly as before.

- Measured over 400 seeds (rod hairlines behind the anchor, after the solver): axis-thrust 24.0% -> 19.2%, disc-beams 25.6% -> 21.3%;
  central-cluster 0.0% (its edge details already run at depth 0..2; unchanged). Frames and rings (75% front) are not hairlines and are unchanged.
- Golden layouts: 29 of 591 entries changed, **all of them hairline details, position only**; the largest screen-space shift is 1e-6 (rounding),
  so the picture's layout is identical and only the depth order moved (mean depth shift 0.2). The 8 legacy groups are untouched.
- New `tests/hairlineDepth.test.js` (the mapping and the share after the solver); both tests fail with the bias switched off.
- 30 test files, 438 tests; typecheck and build pass. Not checked in a browser (a depth-only change of thin lines).

## v0.10.2 — Stage 4.0: tonal audit (unreleased)

Measurement only: no shape, shader or layout changed (436 tests pass, the 71 golden layouts are unchanged). Adds `npm run tone`
(`tools/tone.mjs`): over N seeds per strategy it takes the generator's layouts and the shapes' face-shade tables, converts them to
**displayed** luma (sRGB, Rec.601) and reports the brightest : darkest ratio among the visible faces of box-shaped solids (cube-fixed,
cube-variable, plane, beam; faces under 10% of the visible area ignored). Paint grain (about 3%) is not included; this is not a pixel render.

200 seeds, landscape, every shape allowed, palette Proun - classic:

| strategy | solids | faces seen | ratio p10 / median / p90 | share <= 1.25 | share >= 2.5 |
|---|---|---|---|---|---|
| axis-thrust | 1096 | 1.87 | 1.02 / 1.03 / 1.26 | 89% | 0% |
| disc-beams | 1002 | 1.74 | 1.02 / 1.02 / 1.24 | 92% | 0% |
| central-cluster | 1654 | 2.22 | 1.03 / 1.12 / 1.14 | 100% | 0% |

An unrotated box shows its three faces at about 1.12:1 on screen (the 1.3:1 quoted earlier is the multiplier ratio 1.05/0.82, before the
display transform). The references: faceted 2.6-4.3:1, subtle 1.1-1.4:1. Most solids show fewer than three faces (about 1.7-2.2 seen).

## v0.10.1 — Documentation handoff (unreleased)

Documentation only: no code changed (all 436 tests pass, the 71 golden layouts are unchanged).

- `docs/PROJECT_STATE.md` rewritten as the project handoff at the end of Stage 3: the roadmap status table (Stages 0-3 done, 4 next), the
  protocol the work follows, the architecture of the generative system (strategies, solver, transitions, paint slots, diagnostics), the Stage 1
  visual grammar in condensed form (it had only ever existed in conversation), the decision log (the user's decisions and the technical ones, with
  why), how things are verified (tests, golden layouts, diagnostics, the headless-browser recipe and its pitfalls), the known limits and open items,
  and starting notes for Stage 4. The earlier visual-dynamics handoff is kept as Appendix A, with the items since resolved marked.
- Every file, module, constant and count named in it was checked against the repository.

## v0.10.0 — Stage 3.1: the depth solver for composition strategies (unreleased)

A new depth solver for the composition strategies (Axis thrust, Disc and beams, Central cluster). **The legacy generator keeps its solver,
unchanged**: all 8 legacy golden scenes are byte-identical and four legacy renders are pixel-identical. For the strategy scenes only depth
changed: type, index, colour, role, rotation and size are identical for all 391 golden shapes, and screen positions are identical
(the largest off-axis movement is the golden file's 1e-6 rounding).

### Changed

- **`strategies/volumeSolver.js` replaces `CollisionResolver` under a strategy.** It tests the shapes' real volumes (not world-axis boxes,
  which for a rotated beam are ~43x its volume), places shapes by role (locked, then anchor, supports, connectors, accents, details: a shape
  only yields to those already placed, and the anchor is never moved for anything else), and slides a shape the smallest distance that clears
  it, one way until clear (no ping-pong), toward the side that keeps the planned front/back order unless that costs more than 3 extra,
  never farther than 6 from the plan, reporting what it cannot clear. A first version that reacted hit by hit left some thin shapes
  intersecting after going back and forth between two shapes; the one-direction sweep fixed it.

### Result (300 seeds per mode, real volumes; before = the 0.9.0 baseline)

| | 3D hits / scene | order flips | depth shift mean / p95 / max | depth span |
|---|---|---|---|---|
| Axis thrust, default shapes | 0.19 -> 0.00 | 35% -> 3% | 2.41 / 7.66 / 10.72 -> 0.10 / 0.72 / 3.69 | 12 -> 4.2 |
| Axis thrust, all shapes | 0.01 -> 0.00 | 22% -> 1% | 2.33 / 7.59 / 11.40 -> 0.06 / 0.49 / 2.01 | -> 5.3 |
| Disc and beams, default shapes | 0.10 -> 0.00 | 34% -> 1% | 2.60 / 8.08 / 10.87 -> 0.04 / 0.30 / 2.74 | -> 3.8 |
| Disc and beams, all shapes | 0.02 -> 0.00 | 25% -> 0% | 2.60 / 8.40 / 9.66 -> 0.03 / 0.20 / 2.34 | -> 5.0 |
| Central cluster, default shapes | 0.00 -> 0.00 | 1% -> 0% | 0.15 / 1.07 / 2.21 -> 0.09 / 0.61 / 0.99 | -> 3.9 |
| Central cluster, all shapes | 0.00 -> 0.00 | 1% -> 0% | 0.18 / 1.16 / 2.21 -> 0.10 / 0.64 / 0.99 | -> 4.7 |

Real intersections are 0 at normal settings in every mode (also portrait), none involve the anchor, and a layout takes 0.1-1 ms. With large
shapes (size 2-3) it stays controlled: about 1 residual in 3,700 pairs (kept within the shift cap and reported), order flips under 10%.
The in-app diagnostics agree (180 scenes: 0 intersections; order flips 17 of 3,560).

### Added

- `tests/volumeSolver.test.js` and `tests/strategySolver.test.js` (the approved acceptance criteria on real layouts); `runStrategy({ solve: false })`
  returns the plan as drawn; solver constants `maxPasses`, `maxShift`, `orderSlack` in `COLLISION`; a bounding-sphere reject in `volumesIntersect`.

### Notes

- The planned depth is now what you get, so a shape a strategy planned behind a mass stays behind it (a hairline planned behind the disc is
  hidden by it; the old solver's reshuffling used to mask this). If hairlines should always cross over the anchor, that is a change to the
  strategies' plans, not to the solver.
- Golden layouts for the strategy scenes were regenerated (depth only); the legacy ones were not touched.

## v0.9.0 — Stage 3.0: layout diagnostics (unreleased)

Diagnostics only: nothing about any composition changes (all 71 golden layouts are byte-identical). This is the baseline, and the way to
see in the app what the depth solver does, before the solver is changed (step 3.1, for composition strategies only).

### Added

- **`generator/volumes.js`**: the real volume of a shape (an oriented box from its half extents, scaled and turned; a ball for the sphere,
  `volumeKind: 'sphere'`) with intersection tests (separating axes for two boxes; closest point for a ball) and exact silhouette boxes.
  Our own code, no new dependency; tested against three's `OBB` on 6,000 random pairs with no disagreement.
- **`generator/diagnostics.js`**: `diagnoseLayout()`: real 3D intersections (and those with the anchor), silhouette overlaps, how far the
  solver moved solids from their planned depth, how many planned front/back orders it reversed, depth span, shapes outside the camera.
  Strategy entries now carry `plannedDepth` (the depth the strategy planned, before the solver); legacy entries do not.
- **Layout diagnostics** readout, a collapsed section at the bottom of the Scene tab (`ui/DiagnosticsPanel.js`), computed only while open;
  `Composition.diagnostics()`.
- `npm run diagnose` reports the same numbers per strategy over many seeds.

### Baseline (300 seeds, real volumes, current solver)

| | 3D hits / scene | overlaps / scene | order flips | depth shift mean / p95 / max |
|---|---|---|---|---|
| Axis thrust, default shapes | 0.19 | 15.7 | 35% | 2.41 / 7.66 / 10.72 |
| Axis thrust, all shapes | 0.01 | 26.6 | 22% | 2.33 / 7.59 / 11.40 |
| Disc and beams, default shapes | 0.10 | 15.0 | 34% | 2.60 / 8.08 / 10.87 |
| Disc and beams, all shapes | 0.02 | 25.4 | 25% | 2.60 / 8.40 / 9.66 |
| Central cluster, default shapes | 0.00 | 5.3 | 1% | 0.15 / 1.07 / 2.21 |
| Central cluster, all shapes | 0.00 | 8.5 | 1% | 0.18 / 1.16 / 2.21 |

So the solver leaves few real intersections but moves shapes about 2.4 units (95th percentile 7.7) from their plan under the two
diagonal strategies, and reverses the planned front/back order of about a third of the overlapping pairs.

## v0.8.2 — Transitions under a strategy no longer pop (unreleased)

Reported: on a click or Advance, some shapes moved smoothly while others appeared or vanished, which broke the fluidity.

### Fixed

- **Shapes popped in and out on every advance under a strategy.** A strategy owns the counts, so each composition has a different number
  of shapes; the scene created new shapes instantly at their final place and deleted extra ones instantly (the "count changed" path
  written for dragging a slider), and only shapes that existed in both got the smooth transition. Measured over 300 advances: about 2-3
  shapes in and as many out per advance, at 99-100% of advances (legacy: none). It was a side effect of 2.1's pool sizing that I did
  not flag then.
  Now each shape on screen **glides to the best new shape of its type** (same role first, then nearest), new shapes **grow in** from a
  speck at their own place, and old shapes **shrink away** and are disposed when their tween ends. Legacy is unchanged.
- **Shapes that did glide were matched by slot, not by what they are**: a beam could turn into a plate (35-49% of glides). Matching by role
  and place keeps the role in 79-87% of glides (the rest are shapes of one type pairing across roles because the counts differ).
- **Paint no longer depends on history.** A shape that glides into another slot used to keep its old marbling, so a scene reached by
  advancing did not look like a fresh load of the same config (a shared link would differ from the original). A strategy shape's paint
  is now keyed by its role and ordinal (legacy: its index, as before), so it is the same through every advance and reload, and a
  same-part glide keeps its paint (no flicker). Legacy scenes render pixel-identically, also after a visit to a strategy.

### Added

- `core/matching.js` (the pure pairing), `Tween.add`'s `onComplete`, `paintSlots`, and tests: `matching`, `composition` (end to end against
  a real scene), the completion hook.

### Known limits

- Shapes still appear and disappear when the strategy gives a composition more or fewer of them (that follows from the strategy owning the
  counts); they now grow and shrink instead of popping. A fixed count per type is another possible design, with less variety.
- New shapes grow from their own centre (not from a nearby shape), and every shape moves on the same timing: per-object timing is Stage 6.

## v0.8.1 — Central cluster fixes; the shapes menu follows the strategy (unreleased)

From a screenshot: a portrait Central cluster showing one big cube, a stray bar and a letter F.

### Fixed

- **Central cluster was cropped in portrait and square frames.** The cluster was sized for a landscape frame, so in a narrower one the
  plate and slab ran off the left edge and the bar sat on the right edge; only the main block was left in view. The whole cluster is
  now scaled to the frame's width (a landscape frame is barely affected).
- **The edge details were always the same "F".** Every scene got a vertical hairline with two ticks in fixed places. They are now one
  of several patterns (a plain line, a line with one tick, a line with two ticks on opposite sides, a parallel pair, a dash, or
  none), with varied positions and lengths; two ticks are never on one side of a line. The dot appears in about three scenes in five.
- **The shape tabs no longer squeeze twelve glyphs into one row.** The strip wraps into rows of about six.

### Changed

- **Strategies declare the shapes they use, and the Shapes tab shows only those.** Central cluster never places a sphere, a segment or
  a ring, and Disc and beams never a sphere, so those tabs are hidden under them (legacy and Axis thrust show all twelve). Hidden
  tabs keep their settings. A test keeps each declaration true both ways. Disc and beams' unused sphere fallback was removed so that
  it matches. (Central cluster scenes changed, so its 4 golden scenes were regenerated; every other golden scene is unchanged.)

## v0.8.0 — Stage 2.4: the Central cluster strategy; the selector moves to the main panel (unreleased)

Stage 2 (shape families and composition strategies) is complete. Legacy, Axis thrust and Disc and beams are unchanged: every earlier
golden scene is byte-identical (71 reference layouts in all).

### Added

- **Central cluster** (`src/generator/strategies/centralCluster.js`): a main block with a plate behind it, a slab beside it and a
  tall upright bar, a small second cluster at the bottom edge, a hairline with ticks and a dot at the edges, one tiny accent, and
  (with frames enabled) a 45 degree diamond outline. All solids world-aligned with one shared orientation (one axonometric view); the
  plate and bar are kept inside the frame; one saturated accent hue. Golden scenes and `tests/centralCluster.test.js`.
- **The Composition control is now in the Scene tab**, beside Orientation and Palette (`src/ui/CompositionControl.js`, replacing the
  experimental accordion on the Shapes tab), with a one-line hint; the count hint on the Shapes tab is unchanged.

### Fixed

- **My 2.1 stylesheet addition overrode the Lab panel's hint spacing.** It re-declared `.lab-hint`, which the Lab already uses;
  the new control now has its own `.field-hint` class and the Lab's original rule applies again.

### Known limits

- The depth solver still spreads shapes through a wide depth range under every strategy (Stage 3), so in-front/behind order is not
  guaranteed; cluster members overlap on screen by design, so how they stack is the solver's call until then.
- Shading is the legacy per-face tones (Stage 4). The cluster is where it shows most: boxes read flatter than the references' three
  clearly separated faces.

## v0.7.0 — Stage 2.3: the Disc and beams strategy (unreleased)

The second composition strategy. Legacy and Axis thrust are unchanged: every earlier golden scene is byte-identical (59 reference
layouts in all), and the shared helpers extracted from Axis thrust did not change its output.

### Added

- **Disc and beams** (`src/generator/strategies/discBeams.js`), selectable in the Lab control: a large flat disc as the anchor field,
  beams across its rim on one main angle (a primary and usually a parallel partner), one or two crossing beams at 40-90 degrees,
  small accents just outside the disc, hairlines, and when enabled a ring concentric with the disc and a frame across it. One
  saturated accent hue; beams and outlines never take the disc's own colour. The disc is kept at the back and the beams in front
  with a clear depth gap, leaving room for a shadow plane (Stage 4).
- `strategies/shared.js`: the helpers both strategies use (shape-type names, size/spread, extents to scale, thrust angle).
- Golden scenes for the strategy (landscape, portrait, every shape enabled, few types); tests in `tests/discBeams.test.js`, and a
  persistence test that runs every registered strategy through share links, presets and history, so a new strategy needs no more wiring.

### Known limits

- Under both strategies the depth solver still spreads shapes through a wide depth range (Stage 3), so intended in-front/behind
  order is not guaranteed.
- The Central cluster strategy (step 2.4) is next; the selector then moves to the main panel.

## v0.6.3 — Stage 2.2 (B2): outline frame and partial ring (unreleased)

Both shapes start at count 0, so no existing scene changes: every earlier golden scene (legacy, beams, flat forms, Axis thrust)
is byte-identical.

### Added

- **Frame** (`src/shapes/frame.js`): an extruded open rectangle with a real hole (2.4:1, uniform scale so the line weight stays in
  proportion).
- **Ring** (`src/shapes/ring.js`): a 270 degree partial ring whose origin is the circle's centre.
- Both are `collides: false` (outlines cross other forms on purpose, like the rod), export their outline and geometry builders, and
  have tab glyphs. Axis thrust places them when enabled (see the README); a very light neutral is used where an outline would
  vanish against a dark anchor.
- Golden reference scenes for both (47 in all); tests in `tests/frameRing.test.js`.

### Fixed

- The beam's tab glyph now reads as a long bar (front, top and end faces) rather than a pencil.

### Known limits

- Concentric ring series and short arcs are not shapes yet (the ring is one 270 degree partial ring; rotate it to place the
  opening). Frames are closed rectangles, not the open parallelograms of some references.
- The outline shapes have the legacy two-tone shading (Stage 4).
- Stage 2.2 (the shape families) is complete; the Disc and beams strategy is step 2.3.

## v0.6.2 — Stage 2.2 (B1): segment and crescent (unreleased)

The segment and crescent start at count 0, so no existing scene changes: every legacy golden scene (and the beam scenes) is
byte-identical. Axis thrust scenes that contain triangles or planks do change, because of a fix below.

### Added

- **Segment** (`src/shapes/segment.js`): a flat circular segment (arc over chord, acute tips), from shallow to nearly a half disc.
- **Crescent** (`src/shapes/crescent.js`): a flat two-arc moon with sharp horns.
- Both export their outline and geometry builders; tests compare their areas with the formulas, check the tips and concavity, and
  check that `localHalfExtents` (the collision proxy) matches the geometry actually built.
- Axis thrust uses them when enabled: a segment as the large flat form (chord along the axis), segments and crescents as accents.
- Tab glyphs for the beam, segment and crescent; golden reference scenes for both shapes (40 in all).

### Fixed

- **Flat forms in Axis thrust were turned by a fixed offset from the axis.** `flatOrientation` rotated a camera-facing form by the
  requested angle, but the camera-facing orientation does not put its x axis along screen-right, so triangles and planks (and the
  circle's neighbours, through collision) sat rotated by the unaccounted offset instead of following the axis. The helper now takes
  the screen basis and puts the form's x axis exactly at the requested angle. This changes the Axis thrust scenes that contain
  triangles or planks (golden layouts regenerated: only triangle, plane and, through resolution, circle entries differ). Legacy is
  untouched.
- The beam's tab glyph read as a pencil.

### Known limits (next step, 2.2 B2)

- Outline frames and rings (or partial rings) are still to come.
- Flat forms use the legacy two-tone shading (caps 1.0, sides 0.7); flat shapes' tonal treatment is Stage 4.

## v0.6.1 — Stage 2.2 (A): the Beam shape (unreleased)

No existing scene changes: the beam starts at count 0 (like the rod), the 27 earlier golden layouts are byte-identical, and the
legacy and Axis thrust scenes render as before unless beams are switched on.

### Added

- **Beam** (`src/shapes/beam.js`): a long bar with predictable dimensions (local x = length 2.6-5.0; section 0.11-0.30 by 0.7-1.6
  of that; at least ~5x as long as thick), with its own face tones (end faces darkest, long faces spread about 1.8:1). Its tab has a
  glyph in `ui/shapeIcons.js`.
- Axis thrust uses the beam for its bars when it is enabled (chunkier than the stand-in boxes: 6-40x as long as thick), and a very
  thin beam for the hairlines when no rod, box or plank is enabled.
- Golden reference scenes for legacy beams and Axis thrust beams (33 in all); tests in `tests/beam.test.js`.

### Fixed

- **A type missing from an older preset or share link kept the viewer's current settings.** With the beam added, someone who had
  beams enabled would get extra beams from an old preset or link, so it would not restore its own composition. A type a record
  never mentions now takes its own default (off for the rod and the beam), and a link turns unlisted types off. (This also
  applies to the rod, which had the same gap when it was added.)

### Known limits (next step, 2.2 B)

- Segment/crescent, outline frame, and ring or partial ring shapes are still to come; the beam's tones are a shape-level first
  step, and the general tonal system is Stage 4.
- Enabled beams push their neighbours through depth like any solid, and their long rotated bounds make the solver spread them
  widely (Stage 3).

## v0.6.0 — Stage 2.1: composition strategies, and Axis thrust (unreleased)

The generator can now compose a scene around a structure instead of placing every shape independently. The original generator is
**legacy** and remains the default: existing seeds, presets and links are unchanged (the 15 legacy golden layouts are byte-identical,
and four legacy scenes render pixel-identically before and after).

### Added

- **Composition strategies** (`src/generator/strategies/`): `composition.strategy` in the config (schema **v3**; v1/v2 configs,
  presets and links load as legacy). The strategy owns the shape counts (a type's count only includes/excludes it). Selected in
  the Lab control on the Shapes tab ("Composition · experimental"); it moves to the main panel at step 2.4.
- **Axis thrust**, the first strategy: a dominant diagonal, one anchor, beams, accents in one accent hue, hairlines; built from the
  existing shapes. Entries carry a `role`.
- **One saturated accent hue per scene**, classified from palette colours by saturation (no palette changes).
- Share links carry the strategy as an additive field `c` (absent for legacy: legacy links are byte-for-byte as before).
- `npm run diagnose` reports the strategy scenes; new golden reference scenes for Axis thrust.

### Fixed

- **History remembered only seed and palette.** Back/forward would have shown a different picture for a composition made under
  another strategy (the same seed means something different per strategy). Entries now carry the strategy, and switching strategy on
  the same seed is a step.
- **Presets did not persist `composition`.** PresetStore stores named fields only; `composition` is now one of them.

### Changed

- `Composition` sizes its mesh pools from the layout when a strategy is active (a strategy's counts are not the config's); with
  legacy it is unchanged. Changing a strategy, the orientation or which types are included recomposes the scene.

### Known limits (next steps)

- Beams are `cube-variable` / `plane` boxes; dedicated beam, segment, frame and ring shapes come in 2.2.
- Volumes shade with the legacy per-face tones (an unrotated cube reads as a hexagon): the tonal system is Stage 4.
- The depth solver is unchanged (Stage 3). Under Axis thrust only ~1% of box pairs truly intersect, but the solver spreads shapes
  over a wide depth range (mean span 12.7 units, legacy 3.3), so intended in-front/behind interlacing is not guaranteed.

## v0.5.1 — Stage 0b: regression harness and clip-plane fix (unreleased)

No change to what any seed produces. Roadmap context: audit, then this prerequisite, before any generator work.

### Fixed

- **Shapes were clipped by the camera's near plane.** Collision resolution slides shapes along the view axis, and with many or
  large shapes it takes them dozens of units either way; the camera's clip planes (0.1 .. 100 from the camera, which sits 7.5 from
  the origin) cut away or sliced anything pushed more than ~7.4 units toward it (in the audit: 67% of scenes with 2 of each box at
  size 2-3, and 90% with 4 of each). The camera is orthographic, so the planes only decide what is clipped, never where anything
  lands: they are now `CAMERA.near = -100`, `CAMERA.far = 200` (config/defaults.js; a negative near plane is legal for an
  orthographic camera). Layouts, seeds, presets and links are untouched; default-size scenes render pixel-identically.

### Added

- `tests/`: `golden` (15 fixed reference scenes), `generate`, `collision`, `sceneConfig`, `camera`; fixtures in `tests/helpers/`.
- `npm run golden:update` (regenerate the reference layouts, deliberately) and `npm run diagnose` (solver overlap / clipping rates).

### Known, not changed here (Stage 3)

- After resolution, 5-6% of box pairs at 3 of each (true oriented-box overlap) still intersect; the solver stops after 8 tries per
  shape and tests conservative axis-aligned bounds. Tracked by a `todo` in `tests/collision.test.js` and by `npm run diagnose`.

## v0.5.0 — Visual dynamics (unreleased)

The image now has behaviour over time: a composition change is an event that the colour, the paint and the
ground react to on their own timings. Handoff and rationale: `docs/PROJECT_STATE.md`.

### New

- **Shared event clock** (`core/Rhythm.js`) fed by composition changes.
- **Colour change as overpainting.** The new colour arrives in broken coverage along the paint's own density, over the old
  one; only the two colours appear, plus a small tonal shift. A change that interrupts another keeps the layer in flight
  (no pop). Switchable against the classic RGB lerp in the lab.
- **Procedural paint on the shapes** (three bands with their own scale rules: physical tooth, strokes along the long side,
  stains with the form), deterministic per-slot seed, no stretching or tile seam, sharp at any export size. The old pattern
  stays behind a lab switch. The sphere is not covered.
- **The ground**: a procedural layer behind the shapes (mottle, speckle, optional hairline cracks), constant seed,
  resolution-independent. It replaces the earlier overlay-opacity pulse (which darkened the shapes and jumped in brightness).
- **Ground morph.** Every composition seed has its own ground imprint (mottle + crack network). After a change the ground morphs
  once, one way, to the new imprint (deforming and condensing a little mid-morph); mean-neutral; a change mid-morph retargets
  smoothly; the pattern at rest depends only on the seed. Lab control to pin the cracks (*Cracks vary*).
- **Material lab** (session-local, outside the `SceneConfig`): generated from one schema, with *Copy defaults* (prints a `DYNAMICS`
  fragment) and *Reset lab*, *Pause and scrub* (a Step slider over the last change, geometry and colour), and a frame-rate readout.
- **Panel in tabs:** Scene, Shapes, Motion, Surface, with Advance / Export / Copy link pinned; lab groups are marked "lab" and
  start collapsed.
- `tools/verify/`: headless-browser verification harness.

### Changed / fixed

- Defaults taken from review: colour edge 0.62, grain 0.94, tone 0.045; ground visibility 0.022, scale 0.5, cracks 0.78, crack size 0.65,
  elongation 3.2.
- Reproducibility: the paper overlay and the pigment pool no longer use `Math.random` (seeded streams): a share link reproduces
  the picture pixel for pixel. Crack line weight is physical, so exports match the screen at every size.
- Stroke direction changes smoothly with a face's proportions instead of flipping in one frame.
- Colour-change arrival order is spread evenly over the paint's density range.

### Notes for merging

- New files: `core/Rhythm.js`, `lab/*`, `texture/{PigmentResponse,GroundLayer,noiseGLSL,paintSeed}.js`, `ui/{PanelTabs,LabPanel}.js`, `tests/*`
  (8 suites), `tools/verify/*`, `docs/PROJECT_STATE.md`. `ui/PanelTabs.js` is **not** `ui/tabs.js` (pre-existing, used by the shape tabs).
- Changed: `index.html` (tab pages; ids unchanged), `core/{Tween,Composition,SceneManager}.js`, `texture/{materials,noise,PaperTexture,PigmentLayer}.js`,
  `config/defaults.js` (adds `DYNAMICS`), `ui/panel.css`, `main.js`.
- Tests that assume the classic colour lerp in `Tween` need `setColorFront({ enabled: false })` (see `docs/PROJECT_STATE.md` §11).

## v0.4.0 — 2026-10-10

The app now remembers where you left off, lets you share and step back through
compositions, and gains new tools for building them: locks, a rod shape,
45° rotation snapping and hi-res export. (Stages 3 and 4 of the refactor
roadmap.)

### New

- **Your session is remembered.** The current composition (seed included) and
  all settings — palette, orientation, timing, every shape's options — are
  autosaved to `localStorage` shortly after they stop changing, and immediately
  when the page is hidden or closed. A reload brings back the same picture. If
  auto-advance was on, it resumes.
- **Copy link.** A new button under Export PNG copies a URL that opens the app
  on the same composition: seed, palette, orientation and per-shape settings
  (including locks and snapped rotation). Timing is *not* part of a link; the
  viewer keeps their own. The link is removed from the address bar once it's
  read, and a link that is invalid or hand-edited is ignored or clamped, never
  fatal.
- **Step history.** `‹` / `›` buttons beside Advance, and the ← / → keys, step
  back and forward through the compositions you've seen. Going back uses your
  *current* settings, so it never rewrites your sliders or counts, and locked
  shapes stay locked. After stepping back, a new composition drops the
  "forward" entries (like a browser). The last 100 are kept, in memory only.
- **Lock a shape type.** A padlock on each shape tab freezes that type exactly
  as it is on screen. Advancing re-rolls everything else around it, and the
  locked shapes never move, resize or recolor — not even on a palette change.
  Nothing moves at the moment you lock, and locking mid-transition freezes
  where the shapes are headed. While locked, the type's count, size, spread and
  snap controls are disabled (they're baked into the frozen instances);
  Visible still works. Locks survive presets, the session and Copy link.
- **Snap rotation to 45°.** A checkbox in each shape's settings (the gear):
  every rotation angle of that type becomes a multiple of 45° instead of an
  arbitrary angle. Off by default; applies at the next advance like Size and
  Spread. The same seed gives the same composition with its angles rounded.
  Not offered for the circle, which always faces the camera.
- **Rod shape.** A thin line in the palette's ink color, long on one random
  axis (horizontal, vertical or into the depth). Rods overlay other shapes
  instead of pushing them. It starts at count 0 — add some from its tab — so
  existing compositions look the same.
- **Hi-res PNG export.** A 1× / 2× / 4× selector next to Export PNG. 1× is
  exactly what it was. Larger sizes re-render the live scene at a higher pixel
  ratio (same colors and antialiasing as the screen) and are capped to what the
  GPU can render, in which case the button says "(capped)". Files are named for
  the seed (`proun-<seed>.png`, `…@2x.png`). A 4× export of a retina stage is
  about 5760×4480.

### Changed

- The Advance button's label is now just "Advance" to make room for the step
  buttons; the full name is in its tooltip.
- The shape tab row adapts to however many shapes there are (it was fixed at
  six columns), so the seventh tab fits.

### Fixed

- A presets list in storage that was valid JSON of the wrong shape (an object,
  a number, `null`) made the presets panel throw. It's now ignored.
- (Test suite) A composition test that depended on the random default seed — it
  passed or failed by chance — now asserts only what is guaranteed.

### Under the hood

- **Explicit schema migration.** Stored configs (presets, session) pass through
  `migrateConfig` before validation, which runs the steps from the data's own
  version up to the current one. Older data upgrades itself, newer data loads
  best-effort, and a failing step never throws. The schema version stays 2 — the
  new per-shape fields (`locked`, `snapRotation`) are optional and default
  safely.
- **Share-link format** is versioned separately from the config schema and
  designed to stay readable forever. Locks and snapped types travel in optional,
  additive fields that are absent when unused. Golden tests pin both the encoded
  and decoded forms so an accidental change fails loudly.
- **Locks are part of the config** (a frozen copy of the instances), so the
  layout is still a pure function of the config and presets, links, the session
  and history all keep working. The generator treats locked shapes as immovable
  obstacles.
- **Shape contract** gained optional `colorRole` (`'ink'`), `collides` and
  `defaults`. `shapes/rod.js` is the worked example and needed no edits outside
  its own file, one registry line and one icon.
- **Opt-in strict type checking:** `npm run typecheck` checks the files marked
  `// @ts-check` — everything in `config/` and `generator/`, `export/hiRes.js`,
  `presets/PresetStore.js` and `core/AutoAdvance.js` — with shared types in
  `src/types.js`.
- **Tests: 382** (175 at v0.3.0), including the real `index.html` driven through
  the panel in jsdom. The core behaviors were also mutation-checked: the code
  was deliberately broken in dozens of ways to confirm a test fails each time,
  which found and closed several gaps in the tests themselves.

### Known limitations

- **Collision resolution is capped** (8 attempts per shape), so overlaps remain
  at higher counts. Measured on synthetic scenes of unit-size boxes: roughly 3%
  of layouts have an overlapping pair with 3 shapes, 0.4 pairs on average with
  6, about 4 with 12 and about 27 with 24.
- **Lock caveat.** The other shapes on screen when you lock were placed before
  the lock existed. Regenerating (loading a preset, stepping back to the same
  seed) places them around the locked shapes and can differ slightly from that
  moment. The locked shapes are always exact.
- Settings (size, spread, snap rotation) apply at the next advance, not
  immediately. Count, visibility and locking are immediate.
- A seed fixes the composition (positions, rotations, scales, colors), not the
  paper/pigment grain, which uses its own unseeded noise.
- ← / → (and Space) are ignored while a control has keyboard focus, so they
  don't interfere with typing or sliders.
- Type checking covers the pure core; the renderer-facing files and UI aren't
  opted in yet.

### Upgrading

Nothing to do. Existing presets, sessions and settings keep working: shapes a
preset doesn't mention keep their defaults, and options it predates (locks,
snap rotation) load as off.

## v0.3.0

Stages 1 and 2 of the refactor roadmap: a cleanup pass, then one source of
truth and seeded, reproducible generation.

**Architecture pass (Phase 2) — one source of truth, seeded generation:**

- **Loading a preset now restores the exact composition** it was saved with
  (it used to re-roll). Presets saved before this version still load, with a
  fresh seed (a re-roll), as before.
- New `SceneConfig` (`src/config/`): the whole scene as one validated,
  serializable object with `update` / `replace` / `subscribe`. The panel,
  scene, renderer, auto-advance timer and presets all read from or react to
  it. `ShapeSettings` and `SceneSnapshot` are gone (the config replaces them);
  duration, interval and auto-advance no longer live only in DOM inputs.
- Generation is a pure, seeded function (`src/generator/`). Advancing the
  composition picks a new seed. No generator code calls `Math.random`; each
  instance draws from its own `(seed, type, index)` stream. Shape modules
  now implement `randomScale(rng)`.
- A single shading contract (`paintMesh` / `applyShade` in
  `texture/materials.js`): `Tween` and `Composition` no longer know how a
  shape is shaded. Color math is unchanged (verified against the old
  formula). The sphere repaints once per facet with no per-frame allocation
  (it used to clone a `Color` per vertex per frame).
- Removed instances are now **disposed** (geometry, materials, textures);
  previously every count decrease leaked GPU memory.
- `Tween` lands on exact end values on its final frame.
- A palette-only change recolors in place; the palette selector still
  re-rolls (it sets a new seed in the same step).
- `collision/` moved to `generator/`.
- Tests: 175 across rng, generator, config store, shape contract, shading,
  Composition (against a real `THREE.Scene`), the UI (jsdom, the real
  `index.html`), presets and collision. Core behaviors were also
  mutation-checked (breaking the code on purpose to confirm a test fails).

**Cleanup pass (no visual or feature changes):**

- **Fixed:** Space no longer advances the scene (and is no longer swallowed)
  while a control has focus. You can now type spaces in the preset name
  field, and toggle checkboxes / press buttons / use slider thumbs from the
  keyboard. Clicking the stage and pressing Space elsewhere still advance.
- **Fixed:** duration and interval inputs are clamped (200–6000 ms and
  500–20000 ms), including values typed by hand and values from imported or
  hand-edited presets. Previously a negative duration made a transition that
  never finished, and a negative interval made auto-advance fire continuously.
  An emptied field falls back to its default.
- The animation loop now caps a single frame at 100 ms, so returning to a
  backgrounded tab no longer fast-forwards every transition.
- Added `src/config/defaults.js` as the single home for limits/defaults
  (time ranges, per-shape limits, bounds, collision margin, camera,
  orientations, overlay opacity). The paper-overlay opacity is now applied
  from JS rather than duplicated in CSS, and the Time inputs get their
  limits from config instead of `index.html`.
- Size-range lower bound is now consistently 0.05 (the settings layer
  previously allowed 0.01 while the slider stopped at 0.05); imported
  presets are clamped to that.
- Removed dead code: `ui/ShapeAccordion.js` (unused, superseded by
  `ShapeTabs.js`), unused `hexToRgb`/`clamp8`, unused `grainTexture`
  parameters, unused `Tween.add` `onComplete`, a duplicated comment in
  `sphere.js`. The three box-based shapes now share one `boxMesh()` helper
  and one shade table instead of three copies.
- Added Vitest and unit tests (`npm test`); refreshed the README's
  architecture, texture and shape-authoring sections.

- Per-shape **Count**, **Size** and **Spread** controls are now collapsed by
  default. A small gear toggle on the shape's "Visible" row reveals or hides
  them. They behave like an accordion: interacting with any other menu item
  (orientation, palette, Time, Presets, another shape tab) collapses them
  automatically; Advance / Export don't, so you can keep re-rolling while tuning. No setting or
  behavior changed — the controls just no longer take up space until needed.

## v0.2.0 — 2026-10-07

- Redesigned the settings panel in a dark, minimalist editorial style
  inspired by El Lissitzky / Proun / Constructivism: charcoal background,
  warm off-white text, thin hairline dividers, and restrained red accents
  in place of the previous boxed/bordered form look. No control, value,
  or behavior changed — this is a visual pass only.
- Shape selection is now a single row of six minimal geometric glyphs
  (cube, cube-variable, circle, sphere, triangle, plane) instead of
  named buttons, with the active shape marked by a small red underline
  rather than a filled button background.
- The size-range controls are now a single dual-handle slider (log-scaled,
  0.05–10, drag, click-track, or arrow-key adjustable) in place of the two
  separate min/max number fields, reporting through the same
  `setSizeRange()` call as before.
- Time and Presets are now plain labeled collapsibles (a `+`/`−` sign,
  no surrounding box) instead of bordered accordion panels.
- Shortened several panel labels: "Transition duration" → "Duration",
  "Auto-advance" → "Auto", "Size range (× multiplier)" → "Size ×",
  "Position spread" → "Spread", "Preset name" → "Name".
- Added a per-shape **instance count**: each shape type can now have
  0–12 independent instances on screen at once, adjustable with a
  numeric stepper (-/+ buttons) in that shape's accordion section.
  Instances of the same type never move in sync or share a color —
  each draws its own independent position, rotation, scale, and color
  on every advance — and collision resolution treats every instance of
  every type as just another candidate in one flat list, so same-type
  instances avoid intersecting each other exactly like different types
  already did.
- Fixed two color bugs. (1) Re-triggering a composition before the
  previous transition finished — a fast double-click, changing the
  palette mid-transition, or an auto-advance interval shorter than the
  transition duration — made color jump to a stale value instead of
  easing smoothly, because the old and new transitions both kept
  animating the same shape's color at once. Re-triggering now cancels
  any in-flight transition on that shape first. (2) A shape's resting
  color and its per-frame transition color were computed through two
  different color-space paths (sRGB-integer vs. three.js's internal
  linear color space), causing a small snap at the start of every
  transition for some colors. Both paths now go through the same
  `shadeColor()`/`clampColor()` math.
- Panel layout: removed the "proun generator — dev controls" heading
  and the shape-count line; moved Orientation to the top of the panel;
  grouped Transition duration, Interval, and Auto-advance into a
  collapsible "Time" section; moved "Advance composition" to the
  bottom, just above "Export PNG". Widened the panel (220px → 280px)
  and loosened its padding/spacing — it was feeling cramped with six
  shape sections in it.
- Raised "Position spread" max from 1 to 2 per shape, so a shape can
  now be pushed out to twice the original edge bounds, not just up to
  the edge.
- Added per-shape settings: a **size range** (min/max multiplier applied
  on top of each shape's own proportions) and a **position spread**
  (0 = origin, 1 = full range, 2 = double that), both adjustable per shape
  from a new collapsible accordion in the panel — one section per shape
  type, replacing the flat visibility checkbox list. Defaults reproduce
  existing behavior exactly (size 1.0–1.0, spread 1.0), so this is
  purely additive.
- Added **Plane** — a box whose thickness is always minimal on one
  randomly-chosen axis, so it reads as a flat rectangular plane rather
  than a volume. Unlike Cube (variable)'s "slab" mood, its two broad
  axes vary independently, so planes range from near-square to long
  rectangular strips. Registered alongside the other five shapes; no
  changes needed elsewhere thanks to the shape-registry contract.
- Expanded the palette library from 3 to 15. New palettes are each keyed
  to a specific Lissitzky work or recurring motif — *Proun 99*, *Proun
  Room*, *Red Wedge*, *The Constructor*, *For the Voice*, *Pelikan*,
  *Wolkenbügel*, *Proun 19D*, *Black Square*, *USSR Pavilion*, *Proun G7*,
  and the *Kestner Portfolio* — all following the existing
  paper/ink/accents schema in `palette/palettes.js`, so no code changes
  were needed beyond the data itself; the panel's dropdown picks them up
  automatically from `Palette.names()`.
- Fixed unreadable Orientation/Palette dropdowns: the open `<option>`
  list was inheriting the `<select>`'s light text color but falling back
  to the browser's default white popup background, making the text
  nearly invisible. Added explicit dark background + light text styling
  for `select option` in `panel.css`.
- Raised the sphere's icosahedron subdivision (`DETAIL` in `sphere.js`)
  from 2 to 3 — 1280 triangles instead of 320 — for a visibly rounder
  silhouette. Stays on the same flat-shaded `MeshBasicMaterial` path as
  every other shape (no lights, no material change); geometry is only
  built at startup or when a shape's instance count increases, so the
  extra triangles cost nothing per frame.

## v0.1.0 — Initial release

First working version of the Proun Generator: a generative art tool inspired
by El Lissitzky's *Proun* series, built with Three.js.

### Shapes

- **Cube (fixed)** — always a true cube, uniform scale only
- **Cube (variable)** — proportions shift between stripe, slab, and block
- **Circle** — a flat disc that always faces the camera and never rotates;
  only position and size change
- **Sphere** — low-poly icosahedron (320 facets) with per-vertex flat shading
- **Triangle 90°** — a right-angle triangle, extruded for volume

All five are on screen simultaneously, each with its own independent
transform and color, and can be shown or hidden individually from the panel.

### Composition

- Position, rotation (quaternion slerp), scale, and color all ease smoothly
  between compositions
- Triggered by click, spacebar, or an auto-advance timer with a configurable
  interval
- Landscape / portrait / square orientation
- Three built-in palettes (classic, warm ochre, cool grey)
- Procedural paper/watercolor grain texture — no external image assets

### Collision handling

Shapes are allowed to visually overlap (the whole Proun look depends on it)
as long as they're genuinely at different depths along the camera's line of
sight. A real 3D intersection is resolved by sliding the smaller shape along
the camera-forward axis, in whichever direction keeps the scene's net depth
closest to centered — so the composition doesn't drift toward piling up on
one side of the camera over many advances.

### Export

- PNG export, compositing the WebGL render with the paper-grain overlay so
  the download matches what's on screen

### Architecture

- Each shape is a self-contained module implementing a shared contract
  (`type`, `label`, `facesCamera`, `localHalfExtents`, `create()`,
  `randomScale()`) and registered in one place — collision resolution, the
  composition loop, and the panel's checkboxes all iterate that registry
  generically
- Texture generation, palette data, and export are each isolated in their
  own module
- Vite + plain JavaScript, no build-time framework beyond that

### Known limitations

- Collisions are resolved on target positions only, not continuously during
  a transition — a shape's straight-line path can still briefly pass through
  another mid-ease. Not addressed yet since it wasn't visually noticeable at
  ~1s transition durations.
- The circle's "face the camera" orientation is computed once from a fixed
  camera position. It would need to be recomputed every frame if camera
  movement (orbit/zoom) is ever added.
- Textures are procedurally generated noise/grain, not real scanned
  paper or watercolor images.
