# Proun Generator — project state and handoff

**Stages 5, 6 and 7 are complete.** This file is delivered with `proun-generator95.zip` (code **v0.23.0**, RELEASENOTES v0.14.0 to v0.23.0: Stage 5 = v0.14.0 to v0.14.8, Stage 6 = v0.14.9 to v0.18.0, Stage 7 = v0.18.1 to v0.23.0). What remains is yours: the real-display and real-GPU checks in `docs/LOCAL_CHECKS.md`, and the open decisions in §14. Updated at the end of roadmap **Stage 4** and the follow-on work (palettes, the Library of presets, the Tower / Cross / Mass strategies): code **v0.13.2**,
delivered as `proun-generator69.zip`. Read this first when continuing the project in a new chat. The README is the reference for the app itself,
`RELEASENOTES.md` is the per-step change log with the measured numbers, `docs/prompt.md` is the roadmap, and this file is the reference for **why it
is the way it is, what was verified, and what is still open**. The earlier "Intelligent Material & Visual Dynamics" handoff (v0.5.0: shape paint,
ground, Rhythm, the lab) is kept as **Appendix A**; it is still accurate about those systems. Documents by topic: `docs/PALETTES.md` (the 11
palettes and why), `docs/PRESETS.md` (the 11 Library presets, how they were made and how close they are).

## 1. What this is, and where we are

A generative art tool inspired by El Lissitzky's Proun series (Three.js, plain ES modules, Vite, Vitest; no other dependencies). The project is
following a staged roadmap (`docs/prompt.md`, also a project file: Stages 0-7, working rules, cross-stage requirements, priority order; it ends with the palettes-and-presets request, which is done). Its central
principle: **improve the generator's ability to construct convincing Proun-like compositions before adding more visual complexity.**

| Stage | Content | Status | Where |
|---|---|---|---|
| 0 | Codebase audit; 0b: regression harness, near-plane clipping fix | **done** | zip 46 |
| 1 | Reference analysis and compositional grammar (16 works) | **done** (findings condensed in §5; they were never in the repo before) | |
| 2 | Geometry and composition engine | **done** | 2.1 strategies + Axis thrust (47); 2.2 shapes: beam (48), segment + crescent (49), frame + ring (50); 2.3 Disc and beams (51); 2.4 Central cluster, selector in the Scene tab (52) |
| (fixes) | Central cluster in portrait / the "F"; the shapes menu follows the strategy; transitions without pops | **done** | 53, 54 |
| 3 | Spatial distribution, collisions, overlap | **done** | 3.0 diagnostics (55); 3.1 real-volume depth solver (56) |
| 4 | Graphic tonal system | **done** | 4.0 tone audit (v0.10.2); 4.0b hairlines in front (v0.10.3); 4.1 tonal profiles (v0.10.4); 4.2 graphic shadow plane (v0.10.5); 4.3 selective highlights (v0.10.6); 4.4 render guard (v0.10.7) |
| (fixes) | Circles take no shadow or highlight; the paint seed rides the colour front (a texture pop on regeneration) | **done** | v0.10.8 |
| (content) | Palettes revised against the references: 15 -> 11, aliases for the old names | **done** | v0.11.0, `docs/PALETTES.md` |
| (content) | Library of presets after Lissitzky's Prouns (read-only LIBRARY in the Presets panel + `presets/proun-library.json`) | **done**, 11 presets | v0.12.0, v0.13.0, v0.13.1; `docs/PRESETS.md` |
| (engine) | Tower, Cross and Mass: upright and assembled compositions; Mass pale backdrops | **done** | v0.13.0, v0.13.1 |
| 5 | Procedural analog materials and edge treatment | **in progress**: 5.0 measurements, 5.1 (DOM paper overlay retired, v0.14.0) and 5.1b (ground cached in a render target, v0.14.1) and 5.2a (edge character on box-like faces, v0.14.2; baselines re-shot) and 5.2b (edge character on extruded outlines and discs through outline distance fields, v0.14.3; baselines re-shot) done; and 5.2c (hatching on the Mass backdrop and half the shadow planes, v0.14.4) done; 5.3 (silhouette softness, irregularity and shadow registration, v0.14.5; baselines re-shot) done; and 5.4 (the materials answer the event clock, fixed or evolving surfaces, lab regrouped, v0.14.6) done: **Stage 5 complete, pending your review** (see §11) | |
| 6 | Long-duration, staggered animation (hold 15 min, transition 1 min) | **complete** (v0.18.0): 6.0 harness, 6.1 time model (config v4), 6.2 per-object schedules, 6.3 colour and material timelines, 6.4 interruption fuzz, 6.5 soak tool; real-GPU checks are the user's | |
| 7 | Exhibition mode, still export, long-session management | **complete** (v0.23.0): 7.0 context-loss recovery, 7.1 presets keep the viewer's timing, 7.2 exhibition display mode, 7.3 unattended recovery, 7.4 curated sequence, 7.5 custom-size tiled export, 7.6 integration; background fade (v0.22.1); real-GPU checks are the user's (`docs/LOCAL_CHECKS.md`) | |

## 2. Continuing: setup, commands, starter message

```
npm install
npm run dev            # Vite dev server
npm test               # Vitest, node environment: 52 files, 786 tests (the render guard and the browser tools are outside them)
npm run typecheck      # tsc, JSDoc strict types
npm run build
npm run diagnose       # solver / layout statistics per strategy over many seeds (read-only)
npm run tone           # displayed tonal ratio of box faces per strategy and mode over many seeds (read-only)
npm run golden:update  # regenerate tests/golden/layouts.json: ONLY when a change to the seed -> composition mapping is approved
```

Browser tools (Python + Playwright, software WebGL; they need the app served, see §7 for the gotchas): `tools/verify/render_guard.py` (six reference
stills, the visual regression guard), `palette_sheet.py`, `tone_check.py`, `glitch_scan.py` (a pop at the moment of regeneration), the older checks in
`tools/verify/README.md`; the preset pipeline is in `tools/presets/` (`docs/PRESETS.md`).

In the new chat, upload the latest zip (the roadmap is `docs/prompt.md` inside it, and in the Project's files; so are the reference images, now 8 of
them, plus the six lithographs that were attached later).
Suggested first message: *"Continue Proun Generator at Stage 5 (procedural analog materials and edge treatment). Read docs/PROJECT_STATE.md §1, §3, §7-§9 and
§11, and the Stage 5 section of docs/prompt.md. Start with the audit and plan only; ask me for the decisions you need."*

## 3. How we work (the protocol that has held up)

- **One stage, or one step of a stage, at a time, with review gates.** Pattern: audit (read the code and measure; assume the docs may be
  wrong) -> a plan with the dependencies, risks, affected files, acceptance criteria and a short list of decisions, with a recommendation for
  each -> the user approves (often "go with your suggestions", or numbered answers) -> the smallest coherent change -> report. Never
  implement several roadmap stages in one unreviewed change.
- **Preserve what works.** The legacy generator (`composition.strategy: 'legacy'`) must stay **byte-identical**: its 8 golden scene groups
  must never change, and old presets, links and seeds must keep producing the same layouts. New shapes start at count 0 for that reason.
- **Honest verification.** Say what was measured, what was only inferred and what was not tested (no real GPU so far). Never claim visual
  correctness that was not looked at. Look at renders; quantify where possible (the audits used pixel and layout measurements).
- **Test the tests.** For each new suite, sabotage the code on purpose and confirm the tests fail, then restore it. This found several weak
  tests (defaults a test could not see, a test that became vacuous once the bug it guarded was fixed).
- **Every step ends with** `npm test`, `npm run typecheck`, `npm run build`, a golden regeneration that shows **no diff** (or a reviewed diff),
  a real-browser check (§7), a docs update (README for how it works, RELEASENOTES for what changed and the numbers), and a delivery zip
  `proun-generatorNN.zip` (folder inside it with the same name, no case-colliding file names) plus contact sheets or screenshots.
- **The summary is text, not just file cards**: what changed and why, verification tables, known limits, and the decisions needed next.
- **Ask only what is genuinely ambiguous** (artistic intent, schema or UI trade-offs), a few focused questions, each with a recommendation.
- **No new dependencies** without a stated value and maintenance cost (none added so far; the box intersection test is our own code).
  **Keep the UI minimal:** experimental parameters go in the lab, solver constants are not UI at all (they change compositions, and a
  shared link must reproduce).
- **Lessons from the palettes / presets / strategies work:** (a) a **strategy owns the shape counts** (a type's `count` only switches it on or off); (b) a new strategy
  must be **run by `tests/strategySolver.test.js`** (it iterates every strategy: it caught stacks of thick boxes at small depth spacing; depth moves nothing on screen,
  so be generous); (c) a **search score is not a picture**: sweeping spread and size lowered the score by scattering forms, and the renders looked worse; always look
  at the candidates; (d) in the tool sandbox **background processes die between calls**: start the dev server and run the browser tool in the same command, and use
  a *freshly started* dev server (a long-running one can serve stale modules after edits: the render guard now refuses it); (e) software GL is slow (about 15-90 s
  per settled scene; the ground makes it slowest): shoot one scene per fresh page, split long runs over several calls, wait for a stable picture instead of a fixed time;
  (f) golden regeneration is judged by diffing against the previous release's `layouts.json`: the old groups must be byte-identical.
- The user judges visuals in their own browser and replies tersely; they notice behaviour (a pop in a transition, an "F" shape, a cropped
  cluster) that headless checks can miss, so check the unusual cases too (portrait, square, each strategy, shapes enabled and disabled).

## 4. Architecture of the generative system

```
SceneConfig (schema v3): seed, palette, orientation, time, composition { strategy }, shapes[type] { visible, count, sizeMin/Max, spread,
   │                      snapRotation, locked }          presets / share links (field `c`) / session / history all carry the strategy
   ▼
Composition.layoutFor -> generator/generate.js  generateLayout()
   ├─ 'legacy': each shape drawn independently (seeded per (seed, type, index)); depth settled by generator/CollisionResolver.js
   │            (world-axis boxes, push along the view axis). UNCHANGED since v0.5.0.
   └─ a strategy: strategies/run.js runStrategy():  strategy.plan(ctx)  -> screen-space plan (x, y, depth, orientation, scale, colour, role)
                   -> lifted into the scene (a shape's screen position is independent of its depth: ortho camera)
                   -> strategies/volumeSolver.js: depth-only, real volumes, role priority, planned order kept -> LayoutEntry[]
                      (entries carry `role` and `plannedDepth`; locked shapes are replayed verbatim and immovable)
   ▼
Composition.onConfigChange
   legacy:   each (type, index) slot eases to its entry; count changes create/remove shapes at once
   strategy: core/matching.js pairs old and new shapes (same type; same role first, then nearest) -> glide; unmatched new shapes GROW in
             from a speck at their own place, unmatched old ones SHRINK away and are disposed by Tween's onComplete;
             paint is keyed by (type, role, ordinal) so a scene looks the same however it was reached
   ▼
Tween (position / rotation / scale + the colour front) + Rhythm (shared event clock) + ground -> render      (Appendix A)
```

Where things are:

- **Shapes** (`src/shapes/`, 12): cube-fixed, cube-variable, circle, sphere, triangle, plane, rod, beam, segment, crescent, frame, ring. Contract
  (types.js `ShapeDef`): `type, label, facesCamera, collides, defaults, localHalfExtents, volumeKind, randomScale(rng), create(hex)`. Rod, beam,
  segment, crescent, frame and ring start at **count 0**. Rod, frame and ring have `collides: false` (they cross other forms on purpose).
  The ring's origin is its circle's centre (a 270 degree partial ring); the frame is a 2.4:1 outline scaled uniformly; the sphere is tested as a ball.
- **Strategies** (`src/generator/strategies/`): `index.js` (registry, labels, `STRATEGY_USES`), `run.js` (runner), `common.js` (frame, screen
  basis, lift, orientations, palette split into one saturated accent and neutrals), `shared.js` (type names, size/spread, thrust angles),
  `axisThrust.js`, `discBeams.js`, `centralCluster.js`, `volumeSolver.js`. A strategy is `{ label, uses?, plan(ctx) }`. Each element draws from its own
  seeded stream `(seed, strategy, role, i)`. **The strategy owns the counts** (a type's count only includes it, 0 excludes it).
- **Volumes and diagnostics** (`src/generator/`): `volumes.js` (oriented boxes and balls, our own separating-axis test checked against three's `OBB`,
  exact silhouette boxes), `diagnostics.js` (`diagnoseLayout`: real 3D intersections, silhouette overlaps, order flips against the plan, depth shift).
- **Scene** (`src/core/`): `Composition.js`, `matching.js`, `Tween.js`, `Rhythm.js`, `SceneManager.js`, `Billboard.js`. Camera: one fixed orthographic
  camera at (4.2, 3.4, 5.2), clip planes near -100 / far 200 (a negative near plane is legal and was needed: see §6).
- **UI** (`src/ui/`): the Composition selector is in the Scene tab (`CompositionControl.js`), a collapsed read-only **Layout diagnostics** section sits
  below the presets (`DiagnosticsPanel.js`), the Shapes tab shows only the shapes the active strategy uses and wraps its tab strip (`ShapeTabs.js`).
- **Texture and shading** (`src/texture/`): `materials.js` (the per-face tone table `BOX_SHADE_MULTIPLIERS`, `materialSetMesh`), `PigmentResponse.js`,
  `GroundLayer.js`, `paintSeed.js` (`paintSlots`), `noise.js`. This is Stage 4's and Stage 5's territory.

## 5. The visual grammar (Stage 1), condensed

16 distinct works were studied (Prouns, two stage-figure sets, the Proun Room photo); the numbers are from automatic segmentation of the 12-13
flat works, so they are indicative.

- **Ground is most of the picture:** 40-87% (median 65%); the stage figures about 90%. Pale and quiet.
- **Hierarchy:** one primary mass (a disc, a rhomb, a stacked cluster), then beams and planes, then small accents, then hairlines.
- **One dominant diagonal** per work, in families near 12-25, 38-46 and 54-62 degrees, rising or falling; its perpendicular carries almost nothing;
  a horizontal/vertical system supports it. Long elements overshoot the masses and often bleed off the frame; small details float inside.
- **Flat fields versus volumes:** discs, crescents, wedges and rhombs are flat and sit behind the shaded volumes. Beams are 6-20 times as long as
  thick, often stacked in pairs; frames and outlines (thin, coloured, open) cross solids and carry the accent.
- **Interlaced depth:** a bar passes in front of one mass and behind another; overlap is deliberate (the look), its order is the intention.
- **Colour:** greys plus at most **one saturated hue** (red or ochre) at 2-12% of the frame, plus earth neutrals.
- **Tone (Stage 4's input):** two or three modes, set per face role and not by physical light. *Faceted*: a cube's three faces have luminance about
  53 / 160 / 226 (4.3:1), another box 74 against 157-192 (2.6:1). *Subtle*: beams and boxes of about 131-164 or 145-161 (1.1-1.4:1), with a
  dark **graphic shadow plane** (flat, desaturated, offset in one shared direction, not tied to any light) doing the work. *Pale*: almost no dark
  at all (4% dark). The stage figures use graphite hatching for tone (a texture, Stage 5).
- **Surface (Stage 5's input):** matte and flat, slight tooth, uneven pigment, soft crackle; contour irregularity is subtle.

## 6. Decision log

By the user (explicit answers):

- **Stage 0:** add the regression harness first; **existing seeds keep producing today's layouts** (so a "legacy" strategy stays); fix the near-plane
  clipping as a small isolated change; keep the sphere as is; use the supplied reference images; the **paper overlay versus the ground**
  duplication is *undecided* ("I don't know"); no older tests available.
- **Stage 1/2:** keep the **single orthographic camera**; **one saturated accent hue per scene**; **graphic shadow planes derive from their parent
  shape** (not independent objects); the **strategy owns the counts** (count 0 = excluded); the selector in the Lab until the last strategy, then the
  Scene tab; strategy order Axis thrust, Disc and beams, Central cluster; shapes: beam first, then segment/crescent, then frame/ring as **real
  geometry**; Disc and beams: **one main angle plus one or two crossing beams**, with room left for a shadow plane; shadow planes wait for Stage 4.
- **Fixes:** hide the shape tabs a strategy does not use; wrap the tab strip; transitions: match shapes by role and place, new shapes **grow from
  their own centre**.
- **Stage 3:** audit first; the new solver is for **strategies only**; the anchor never moves; own intersection test; diagnostics before the solver;
  solver constants are not UI; move cap 6, margin 0.18, order slack 3.

Technical decisions worth remembering (and why):

- New shapes start at count 0, and a shape type an older preset/link never mentioned takes its own default (off) rather than the viewer's current
  setting, so old records restore their own composition.
- Strategies place shapes in **screen space** and lift them; the solver moves shapes **only along the view axis**, which leaves them exactly where
  the strategy put them on screen. This is also what keeps strategy screen layouts reproducible across solver changes.
- `collides: false` for outlines (rod, frame, ring): a solid collision box around a hollow shape only pushes things apart.
- Paint is keyed by slot: the index for legacy shapes, **(role, ordinal)** for strategy shapes, so a scene reached by advancing looks exactly like a
  fresh load, and a shape that glides as the same part keeps its paint (no flicker).
- The clip planes are wide because depth resolution can slide shapes far along the view axis; an orthographic camera allows a negative near plane.
- The legacy solver tests world-axis boxes (a rotated beam's box is about 43 times its volume). It is deliberately **not** improved for legacy
  (that would change existing seeds); only strategies use the real-volume solver.

## 7. Verification: the regression suite and how to check things

- **Tests:** 52 files, 786 tests (the render guard and the browser tools are outside them). Notable: `golden` (below), `strategySolver` (the Stage 3 acceptance criteria on real layouts), `composition`
  (end to end against a real scene: nothing is removed at once, the scene ends exactly on the new composition, no leaks, paint independent of history;
  only the canvas-dependent materials are stubbed), `volumes` (against three's `OBB` as an oracle on thousands of pairs), `strategyUses`,
  `persistence` (every strategy survives links, presets, session, history).
- **Golden layouts:** `tests/golden/scenarios.js` -> `layouts.json`: **95 reference layouts in 32 scene groups** (the 23 groups of v0.12.0, byte-identical, plus 9 for Tower, Cross and Mass; `tests/golden/library.json` pins the 11 Library presets separately). The 8 legacy groups (default, dense,
  snapped, sizes-spread, large, beams-legacy, flat-forms-legacy, outlines-legacy) must **never change**. Strategy groups change only when a strategy or
  the solver is deliberately changed; regenerate, then check that screen positions, types, colours, roles, rotation and scale are unchanged where only
  depth should have changed (the 3.1 check did this with a script).
- **Measurements:** `npm run diagnose`. Stage 3 results are in `RELEASENOTES.md` v0.9.0 (baseline) and v0.10.0 (after): real 3D intersections 0.00 per
  scene, order flips 0-3% (from 22-35%), mean depth shift 0.03-0.10 (from about 2.5), a layout in 0.1-1 ms.
- **Real browser (headless Chromium, software WebGL).** Serve with `npx vite --port 5201`; drive with Playwright (Python worked); launch flags
  `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`. Useful facts: add an init script `window.__proun = {}` to get
  `window.__proun.getRenderer()`; `await import('/src/config/store.js')` inside the page returns the same module instances the app uses (set a config
  with `SceneConfig.replace(...)`, advance with `SceneConfig.update({ seed })`); read the picture with `document.getElementById('scene').toDataURL()`
  (element screenshots stall because frames take hundreds of milliseconds); `renderer.info.memory.geometries` only counts geometries that have been
  drawn, so **poll until it settles** before comparing; transitions run slowly (the frame step is clamped to 100 ms), so allow several seconds.
  A pixel comparison of legacy renders against the pre-strategy baseline is the standard "legacy untouched" check.
- **Render guard (v0.10.7):** six stills under `tools/verify/baseline/`, 720x560, compared with a tolerance plus a per-tile check; it matched with 0.000% difference at v0.13.1. Re-shoot with `--update` only when the look is *meant* to change, and look at the new PNGs. Stage 5 will change them on purpose.
- **Not verified:** real GPU behaviour and cost (the ground is a full-screen shader: Appendix A §9.1), long sessions (hours), touch/narrow screens.

## 8. Known limits and open items

- **Tone (Stage 4, done):** open: `pale` mode only lightens and flattens faces (it does not lift colours toward the paper); the dark floor (`DARK_FLOOR`, `LIFT_CAP`) lifts black solids to a dark grey in faceted scenes; flat forms keep their two-tone caps and sides; the sphere has no paint (user: keep).
- **Hairlines:** **[Resolved in v0.10.3]** a hairline's planned depth is front-biased (about 80% in front of the anchor, 20% behind to keep the interlaced look); after the solver about 19-21% of rod hairlines are behind it.
- **Paper overlay versus the ground:** **[Resolved in v0.14.0]** the DOM overlay added no measurable texture and only darkened everything about 7% with a warm cast; it is gone, the ground is the only paper layer and colours show as the palette defines them.
- **Composition limits (what the Library presets are loose about):** no hatching or stipple, arcs, perspective grids or fine construction lines; no transparency (everything is opaque); one camera for all forms; no hanging string/sphere assembly. The three diagonal strategies cannot make upright compositions (Tower and Cross do). `docs/PRESETS.md` says how close each preset is.
- **Shape vocabulary gaps:** frames are closed rectangles (the references also have open parallelograms); the ring is one 270 degree partial ring (no
  concentric series, no short arcs); no circle-as-ground nesting.
- **Timing:** every shape moves on the same timing and new shapes grow from their own centre; per-object scheduling is Stage 6. A shrinking shape keeps
  drifting to where it was headed. Time ranges are capped (transition 0.2-6 s, interval 0.5-20 s) and need widening for Stage 6.
- **Large shapes** (size 2-3): about 1 residual intersection in 3,700 pairs under strategies (kept within the move cap and reported). Legacy with large
  shapes still intersects heavily (20-34% of box pairs): by design, see §6.
- **Layout diagnostics** show numbers only; there is no visual overlay of intersections.
- **Never verified:** the Library with the ground on, the pale Mass scenes on every palette, and the 'Save a copy' click in the Presets panel (the store path is tested).
- Everything in Appendix A §9 that is not marked resolved (ground GPU cost, paint "swim", narrow screens, palette-specific ground character).

## 9. Stage 4 (graphic tonal system): decisions and status (done)

Decided (v0.10.2-v0.10.4): mode per scene, seeded, weighted by strategy (axis 40/45/15, disc-beams 20/65/15, central-cluster 60/25/15); faceted about 3:1;
rods and beams always subtle; face roles from the target orientation (`texture/tone.js`); a tone change rides the colour front (`uShadeFrom`/`uShadeMid`);
legacy shading untouched; the shadow plane (4.2, done) is a child mesh of its parent, down-right, derived colour, none in pale scenes, opaque pre-mixed colour instead of alpha (texture/shadow.js); palette variants are derived in code from paper/ink, no palette schema change;
selective highlights (4.3, done): faceted and subtle scenes, the anchor plus the largest one or two forms, a light edge strip up-left in the shader (texture/highlight.js); the render guard (4.4, done) is six reference stills in `tools/verify/baseline/`, compared by `tools/verify/render_guard.py` (a global share plus a per-tile check), not in `npm test`; re-shoot with `--update` only when the look is meant to change. Open: pale does not yet lift colours toward paper (it only lightens and
flattens the faces); the dark floor lifts black solids to a dark grey in faceted scenes (tunable: `DARK_FLOOR`, `LIFT_CAP`).

Details and numbers are in `RELEASENOTES.md` v0.10.2-v0.10.8 and the headers of `texture/tone.js`, `shadow.js` and `highlight.js`.

## 10. Work after Stage 4 (palettes, presets, assembly strategies)

- **Palettes (v0.11.0, `docs/PALETTES.md`):** 15 -> 11, colours measured from the references; classic is pinned and unchanged; old names resolve through `PALETTE_ALIASES`; black is a painter's black, never `#000000`.
- **Presets (v0.12.0-v0.13.1, `docs/PRESETS.md`):** a read-only LIBRARY of 11 in the Presets panel plus `presets/proun-library.json`; each preset is a complete config built on a fresh one; found by a seed search against composition descriptors of the references, chosen by eye; pinned by `tests/golden/library.json`. Four are close to their originals (the floating cube, the red bar, disc and boxes, the cracked-grey blocks).
- **Strategies (v0.13.0-v0.13.1):** Tower (upright stepped stack), Cross (cross and column variants), Mass (assembly on a turned grid, with pale backdrops and a dark field). They share `strategies/assemblyKit.js`; the older strategies were not touched.
- **Fixes (v0.10.8):** circles take no shadow plane or highlight; the paint seed of a shape that takes another part's paint now rides the colour front.
- Decisions on record: classic untouched; no per-palette ground character; strategies carry their own angle (no axis-angle option on the old ones); a preset is replaced only if the new-strategy pick is clearly closer; presets ship as the Library plus a JSON.

## 11. Stage 5 starting notes (procedural analog materials and edge treatment)

**The roadmap text** (`docs/prompt.md`): audit the existing texture and shader system before expanding it. A coordinated material model with three layers: (1) *support*: stable paper
tone, subtle grain, low-frequency variation; (2) *pigment*: uneven coverage, directional texture, controlled tonal variation; (3) *edge and print character*: subtle contour irregularity,
narrow edge softness, restrained registration imperfections. Distinguish antialiasing, material edge softness and global optical post-processing. **Prefer geometry-aware surface effects over
generic noise overlays.** Keep texture deterministic, with explicit control over whether patterns stay fixed or evolve over time. Investigate how Rhythm and composition events can drive subtle
material responses. Acceptance: geometry stays legible and crisp; texture does not overwhelm; edge softness subtle and controllable; patterns reproducible from configuration and seed;
materials can respond to transitions without distraction. Out of scope: heavy blur, pronounced trails, strong chromatic aberration.

**What exists** (read before changing): `texture/PigmentLayer.js` (the structure textures a shape's paint is made from), `PigmentResponse.js` (the injected shader: paint grain, overpaint front,
tone layers, highlight strip; program key `pigment-response-7`), `materials.js`, `paintSeed.js`, `MicroVariation.js`, `noise.js` / `noiseGLSL.js`, `GroundLayer.js` (the ground, a full-screen shader),
`PaperTexture.js` (the paper overlay); Appendix A §A.5-A.9 is the design record (paint seeds per part, the overpaint front, the ground, Rhythm responses, the lab).

**Facts from the reference work that bear on Stage 5:** the lithographs carry **graphite hatching and stipple as tonal fields** (the disc lithograph's dark field, the graphite box's soft planes); the
paintings have matte, slightly toothy surfaces with fine crackle (the cracked grey Proun) and uneven pigment; blacks are a printer's black; edges are crisp with slight irregularity. The Library
presets are loose mainly for lack of these (`docs/PRESETS.md`, "Limits"). The Mass strategy's dark framed field and the shadow planes are flat colour today: natural candidates for a hatched or
stippled treatment.

**Constraints:** legacy renders must stay pixel-identical unless the user approves otherwise (`tools/verify/tone_check.py`'s legacy check; the guard's baselines will change on purpose: re-shoot with
`--update` after review and say so); layouts and goldens must not change (materials are render-only); paint must stay reproducible from config + seed and independent of history; the ground is
a full-screen shader every frame (GPU cost, A.9); Rhythm already drives material responses (A.5). Test the tests by sabotage; the harness for browser checks is in §7 and `tools/verify/README.md`.

**Suggested path (the usual one):** audit and plan first, no implementation. (1) Audit the shader chain end to end (ground, paper overlay, shape paint, the Stage 4 tone and highlight, Rhythm
inputs) and measure what each layer contributes on renders. (2) Candidate design to evaluate, not decided: a hatching/stipple **tonal field** driven by the shape's face roles and geometry (so it
follows the form, not the screen); edge character as a narrow, deterministic contour wobble in the fragment shader; separating the three layers in code and in the lab; what stays fixed vs evolves.
(3) Things to settle with the user: whether hatching is a surface option of the materials or a new shape/element; fixed vs evolving surface patterns; the paper overlay vs the ground question;
the GPU budget; how edge softness relates to antialiasing; what the lab exposes and what stays internal.

---

# Appendix A: the visual-dynamics handoff (v0.5.0)

*Written at the end of the "Intelligent Material & Visual Dynamics" work and kept for the design record of the paint, overpaint, ground, Rhythm and
lab systems. Items marked **[Resolved ...]** have been dealt with since; the rest is still accurate. Its section numbers are prefixed A.*

### A.3 The original brief of the visual-dynamics work, condensed

- **Rhythm and events:** a composition change is an event, not just a tween; different systems (geometry,
  material, colour, ground, final image) react with their own phases/delays/durations/intensities, but feel
  like one rhythm. No full event bus: find the simplest way to share the transition info.
- **Material** responds to the composition's temporal state; base / pigment / microvariation / dynamic response.
- **Colour as a spatial process**, not a linear interpolation; coherent, never random noise.
- **Background** as an independent system; supports the figures, doesn't compete.
- **Post-processing** only if its benefit is obvious (delicate, phase-dependent); consider performance and that PNG
  export must match the screen.
- **Controlled randomness:** reproducible from settings + seed; no flicker; stable procedural structure.
- **Artistic restraint:** one well-integrated mechanism beats many loosely coupled effects.
- **Constraints:** keep existing functionality/architecture; no new libraries, event bus or effects framework;
  no per-frame allocation; manage GPU resources; don't add settings until proven; check tests/types/build and
  *never claim visual correctness that wasn't actually checked in a browser*.

### A.4 Status against the plan

| Plan item | Status |
|---|---|
| A. Conceptual/technical model | done (§5) |
| B. Minimal prototype (pigment thinning) | built, **then removed** — it introduced a third colour (paper) during changes |
| C1. Link the transition to a shared time model | done: `core/Rhythm.js` |
| C2. One expressive material response | done: colour change as **overpainting** + procedural **paint** |
| C3. Spatial colour | done: overpaint coverage ordered by a sweep eroded by the paint grain |
| C4. Independent background | done: **ground** layer + **one-way ground morph** (mottle + cracks) |
| C5. Post-processing | assessed: **not needed** (§8); revisit only with a concrete gap |
| C6. Palette, determinism, performance, export | checked (§7); GPU performance **not** measured |
| Sphere | **explicitly out of scope** (user decision): no paint, plain colour lerp |

### A.5 Architecture of the dynamics

```
Composition change (seed/palette/replace)
   │  Composition.onConfigChange
   ├─► Rhythm.trigger(duration, interval)        core/Rhythm.js   shared event clock: energy / phase / hold
   ├─► Tween.add per mesh                         core/Tween.js    geometry + colour; keeps each mesh's LAST tween (scrub)
   │       └─ colour: paint NEW colour at once; drive per-mesh `front` 0→1 (+ interrupted layer uFrontA)
   └─► (frame loop)  SceneManager.loop:  Tween.update → Rhythm.update → updateGroundMotion(seed)
                                                        │
        shape fragment shaders (texture/PigmentResponse.js, injected via onBeforeCompile on MeshBasicMaterial)
           • procedural PAINT field (3 bands, per-face plane, per-slot seed)
           • OVERPAINT: new colour arrives along the paint's own density, old colour shows through gaps
        ground (texture/GroundLayer.js): full-screen clip-space quad drawn first, procedural, seeded per composition seed
           • mottle + speckle + crack network; one-way morph between the old and new seed's pattern
        DOM paper-grain overlay (constant opacity, multiply) — composed in manually by the exporter
```

Key modules (all new in this stage unless noted):

- `core/Rhythm.js` — the shared clock (`energy`, `phase`, `hold`). Currently **only `hold` and `events/duration` are consumed**
  (energy has no visible consumer since pigment thinning was removed; kept as the hook for future systems).
- `core/Tween.js` (extended) — classic RGB lerp **or** colour *front*; scrubbing via `Rhythm.hold`; `finished` map keeps the last
  tween per mesh so the lab can scrub after a change completed; `setColorFront({enabled, delay})`.
- `texture/PigmentResponse.js` — shader injection (vertex + fragment), per-mesh front state
  (`uFront, uFrontA, uFrom, uMid, uSeed`), shared uniforms; legacy 256-px pattern kept behind `uPaintOn`.
- `texture/GroundLayer.js` — ground shader + the morph follower (critically damped, one-way, retargetable).
- `texture/noise.js` (extended) — seeded canvas noise (`withNoiseSeed`); `noiseGLSL.js` — shared GLSL hash/value-noise/fbm;
  `paintSeed.js` — per-slot seed (type + index); `materials.js` — gives every mesh a `front` state.
- `lab/labSettings.js` — the **schema** (source of truth for lab controls), store (localStorage, only non-default values),
  `LAB_GROUP_TABS`, `defaultsSnippet`; `lab/Lab.js` — maps lab keys onto the systems.
- `ui/PanelTabs.js` (tab strip; **named to avoid colliding with the pre-existing `ui/tabs.js` on case-insensitive file systems**),
  `ui/LabPanel.js` — builds lab groups into the Motion/Surface tabs.
- `config/defaults.js` — `DYNAMICS`: the single place for the new constants.

Shared uniform objects are referenced by every material, so the loop updates a handful of numbers once per frame. Code that is
inactive at rest sits behind **uniform branches** (`uFront < 1.0`, `uMotion > 0.0`, `uMorph > 0.0`), so rest takes the original path.

### A.6 Decision log (what and why)

1. **Pigment thinning removed.** It mixed the colour toward the paper tone → a third colour appeared at the start of every
   change (user: "light patches flash"). Painters overpaint; the ground never shows through paint (references). Replaced by
   **overpaint**: only the two colours + a small tonal shift (`color.tone`) of each; narrow-ish edge; arrival order follows the paint.
2. **Colour front keeps layers on interruption** (`uFrom/uMid/uFrontA`): a change arriving mid-change used to restart from a blended
   colour (a visible pop: 6–15/255 mean on shape pixels). Now ~0. A *third* interruption settles the oldest layer (can still pop).
3. **Paint is procedural, per face plane, three bands with different scale rules** (fine tooth physical; strokes along the long
   side with width following size by `followStrokes`=0.5; stains follow the form `followStains`=1). Chosen from the references
   (§7) and the user's scale question. Fixes rod stretch, tile seam, export softness; sphere excluded.
4. **Stroke direction changes smoothly** (`smoothstep(0.7, 0.9, aspect)`), never a hard `dm.x >= dm.y`: a face whose proportions
   cross square during a tween used to flip its strokes in one frame (reported as sudden change/flicker).
5. **Ground = its own procedural layer**, not the DOM overlay: the overlay multiplied over everything (darkened shapes, brightness
   jump when its opacity was animated). Mean-neutral by construction (variance-preserving blend), so no tone jump.
6. **Ground morph is one-way and per-seed.** First version replayed there-and-back and returned to the same pattern (user:
   "looks strange"). Now every composition seed has its own mottle + crack network; the pattern after a change depends only on
   the current seed (reproducible from a share link) and a change mid-morph retargets smoothly (critically damped follower).
   Cracks morph by drifting the Worley cell centres (continuous, no pops); `crackVary` 0 pins them as the paper's fixed identity.
   A palette-only change (same seed) does not move the ground.
7. **Lab is session-local** (localStorage, outside `SceneConfig`, only non-default values stored) so exploratory knobs never touch
   presets/links/migrations. Values graduate via *Copy defaults* → paste into `DYNAMICS` (or promote to a real setting).
8. **Pause-and-scrub** replaced "Hold the event": the slider scrubs the *last change* (0 = before, 1 = after, geometry and colour)
   even after it finished; release continues to the exact end state. Shapes created/removed by a change are not scrubbed.
9. **Reproducibility:** removed all `Math.random` from texture code (`withNoiseSeed` streams); a share link reproduces the picture
   pixel for pixel. Crack line weight is *physical* (fixed in cell units, AA by `fwidth`), so exports match the screen.
10. **No post-processing** (cost/benefit, §8).
11. **Panel in tabs** (Scene / Shapes / Motion / Surface; Advance, Export, Copy link pinned). Lab groups carry a "lab" tag.

### A.7 Evidence

**Reference works** (measured on hand-picked crops; indicative). Texture variation = std/mean of luminance at 1000 px width:

| Region | Total | Note |
|---|---|---|
| paper sheets (05, 06) | 0.5–1.0 % | nearly flat cream (`#eddecb`, `#e7e0cf`) |
| painted grounds (01, 02, 03) | 2.2–3.4 % | 01: dense crack network + cloud mottle |
| ground 04 | 6.4 % | wood grain + stains |
| painted faces | coarse 3–6 %, mid 2.7–4.3 %, fine 2–2.4 % | strokes (04), dry-brush (03), stain mottle (02) |
| blacks | ≈ `#272727` | never pure black |

Defaults chosen: ground visibility 0.022 (user: "0.02–0.03 feels right"), paint 0.03.

**Checked (headless Chromium, software WebGL):** rest identity vs the previous build (0 px) when new effects are off; one-way ground
morph (similarity to old 1.00→0.61 … to new 0.61→1.00, monotonic); ground continuity through interruptions; mean-luminance change at
the morph peak ≈ 0.2 %; shape colour continuity at an interruption (0.03–0.06/255); pause-and-scrub identities (0 px); share link vs
advanced state (0 px, canvas and stage); export 1×/2×/4× (4× downsampled vs 1×: 0.77/255), paused-scene export vs screen (1.18/255);
resources flat over 43+ changes (geometries 7, textures 21, programs 4); dev server and production build both load without errors.

**Not checked:** any real GPU (performance!), real download dialogs, low-end memory at 4×, narrow-screen layout, the per-shape settings
inside the Shapes tab beyond rendering, live feel of timings (delay/morph time) — the user tunes these in the lab.

### A.8 Post-processing assessment

Not built, deliberately. The analog character is carried by materials (paint strokes, cracks, overpaint, ground morph); edges
are crisp like the references. A final pass costs a render target (MSAA-capable), a changed export path (`renderAtScale`), another
full-screen pass on top of the heavy ground, and a new determinism risk. If something transition-specific is wanted later
(slight softness during changes), try it **inside the materials** first.

### A.9 Open items (prioritised)

1. **[Resolved in v0.14.1: the ground is cached in a render target and redrawn only while it changes; see RELEASENOTES]** **GPU cost of the ground.** It is a full-screen shader (4-octave fbm, Worley crack pass; ×2 during a morph) on every frame, even at rest.
   In software GL it dominated the frame (≈210 ms vs 65 ms without it — only the ratio means anything). The lab shows a frame-rate readout.
   If a target GPU struggles: **cache the ground in a render target and redraw it only while it changes** (morph, lab edits, resize/export scale).
   Cheaper first steps: single-hash `hash22` for the crack cell centres, fewer octaves, 2×2 Worley search.
2. **Sphere** has no paint/overpaint (vertex colours, smooth shading breaks with a procedural field). User: leave it until its role in the
   composition is clearer. Consider texturing via a normal-aware path or removing the shape's flat-shaded facets.
3. **Paint "swim":** physical-scale bands are anchored in world units, so while a shape scales during a change the strokes/tooth slide under the
   surface (continuous, not a jump). Setting both *follow size* sliders to 1 pins it.
4. **Third interruption** settles the oldest colour layer (small pop). Shapes created/removed by a change appear/vanish at once and are not scrubbed. **[Resolved for composition strategies in v0.8.2: new shapes grow in, old ones shrink away, and both follow the pause/scrub. The legacy generator keeps its fixed set of shapes.]**
5. **Cracks vs speckle:** speckle is the only fixed grain left; consider a per-generation speckle or crack-specific morph delay if the ground still
   reads as "the same texture".
6. **Palette-specific ground character** (paper sheet vs cracked ground vs wood) — would need a small palette field; deliberately not added yet.
7. **Narrow screens:** the tab strip should become a bottom bar; the panel overlays the stage below ≈1250 px.
8. **Graduate lab values:** use *Copy defaults* when the user settles values (current defaults in `DYNAMICS`; see the user's review values in
   RELEASENOTES).
9. **Tests:** **[Resolved: Stage 0b added suites for the generator, collision solver, config, share links, presets, history and a fixed-seed golden set; see §7 of this file.]**
10. Possible directions: pigment edge irregularity in-material; light gradation per face; a texture "imprint" per generation for shapes too.

### A.10 How we work (collaboration protocol)

- **Stages with review gates:** analysis/plan → minimal prototype → *stop and let the user judge it in the browser* → iterate in small steps.
  For ambiguous visual decisions, propose options with a recommendation and stills; ask at most one focused question.
- **Honest verification:** say what was measured, what was only inferred, and what was not tested. Never claim visual correctness that wasn't
  actually looked at. Prefer numbers (pixel diffs, band stats) plus stills; state limits of headless/software-GL checks.
- **Lab first:** new tuning knobs go into the lab schema (one entry + one line in `Lab.js`), not into `SceneConfig`, until proven.
- **Rest must stay verifiable:** every new effect has an off switch (or a uniform branch) so rest-state pixel identity against the previous build
  can be asserted.
- **Constraints:** no new libraries/event bus; no render-path change without a cost estimate; no per-frame allocation; mind GPU resources.
- **Delivery:** a zip `proun-generatorNN.zip` containing the folder, plus stills that show what changed. **Never create filenames that differ only by case**
  (an earlier `Tabs.js` vs `tabs.js` collision broke the user's checkout on macOS/Windows; the scan is in the packaging step).
- **User's taste, as expressed:** only the two colours during a colour change (no extra hue); subtle, supporting ground ("looks beautiful" at
  ground vis ≈0.022, scale 0.5, cracks 0.78); strokes on shapes like brushed paint; animations smooth and one-way; no brightness jumps; clean,
  collapsed UI.

### A.11 Merging into the full repository (compatibility notes)

- *(Historical: this stage worked from `proun-generator29.zip`, whose `tests/` directory was absent. The suites have since been rebuilt, see §7.)*
  Keep your existing tests; this delivery adds: `ground`, `lab`, `noise`, `paintSeed`, `pigmentResponse`, `rhythm`, `tabs`, `tween` tests.
- **Likely to need an update in your own suites:**
  - Tests that expect the classic colour lerp in `Tween` (e.g. an interruption-without-snap test): meshes from `materialSetMesh` now use the overpaint *front*
    by default (colour painted at once, `uFront` driven). Either call `setColorFront({ enabled: false })` in those tests or assert on `userData.front`.
  - UI tests that load `index.html`: the panel is now four `.tab-page` containers (hidden except one once `initTabs()` runs); all previous element ids are unchanged.
    The Lab's left panel and `#lab-toggle` are gone.
  - `Composition` tests: `createInstance` now sets `mesh.userData.front.uSeed` (guarded) — no GL needed.
- Files added/changed: see `RELEASENOTES.md` and the README architecture tree. `ui/PanelTabs.js` (new) ≠ `ui/tabs.js` (existing, used by ShapeTabs).
- The harness in `tools/verify/` is independent of the app and of `npm test`.

### A.12 Quick reference

Lab keys (defaults in `DYNAMICS`): Transition `holdOn, hold`; Color change `colorFront, colorDelay(0.10), colorSoft(0.62), colorGrain(0.94), colorTone(0.045)`;
Paint `paintOn, paintVis(0.03), strokeScale(1), strokeLength(5), followStrokes(0.5), followStains(1)`;
Ground `groundOn, groundVis(0.022), groundScale(0.5), groundCracks(0.78), groundCrackSize(0.65), groundCrackStretch(3.2), groundCrackVary(1)`;
Ground motion `gmOn, gmDelay(0.2), gmDuration(1.6), gmEvolve(0.7), gmWarp(0.03), gmLift(0.35)`.
Console hook: `window.__proun = { Rhythm, Lab, groundMotion, getRenderer() }`. Storage keys: lab `proun.lab.v2`, last tab `proun.ui.v1`.

## 12. Stage 6 starting notes (long-duration, staggered animation): audit only, nothing built

Written at the end of the Stage 5 chat so the Stage 6 chat does not redo it. Read the Stage 6 section of `docs/prompt.md` as well. Everything below is from reading the code; nothing for Stage 6 has been run.

**What the code did before 6.1 (this list is the audit; the 6.1 notes below it say what changed)**
- `Tween` and `Rhythm` advance on the loop's clamped `dt` (`MAX_FRAME_MS` = 100 ms per frame, `SceneManager.loop`). Auto-advance is a separate wall-clock `setInterval` (`core/AutoAdvance.js`). In a hidden tab the frame loop stops (tweens freeze) while the interval keeps firing (throttled by the browser), so advances can queue; on return they replay. Not run, only read.
- A 1-minute transition on a slow or hitching machine falls behind real time (every frame is clamped to 100 ms); today's 1 s transitions hide this.
- `Tween.add(mesh, target, duration)` has one duration and one easing (`easeInOutCubic`) for every object. The colour front already has its own delay (`colorFront.delay`, a global fraction of the duration); there is no per-object delay or duration.
- Time ranges: transition 0.2 to 6 s (default 1.1 s), interval 0.5 to 20 s (default 4 s) (`TIME` in `config/defaults.js`).
- Already in place: a new change mid-transition retargets from the current state with the colour layers handled; the ground costs nothing at rest (cached, v0.14.1); the lab `hold` freezes the clock at a fraction of a transition for inspection (it is timing-sensitive in software GL, see below).
- `Rhythm` (energy 0..1, phase 0..1, `hold`) is documented in its header; the materials answer its energy since v0.14.6.

**Proposed steps (each a review gate; run the render guard and the legacy checks after 6.1, 6.2, 6.3)**
6.0 a test harness with an injected clock (simulate a 1-minute transition at 30, 60 and 144 fps and compare; no behaviour change); 6.1 the time model: motion and the hold timer on one shared time-based clock, no wall-clock `setInterval`, wider ranges, Hold and Transition window as two fields, Dev and Exhibition presets, tab suspension per the answer below; 6.2 per-object scheduling in `Tween` (a deterministic delay, duration and easing from the seed and the object's role: anchors slow, details quick); 6.3 independent per-object delay and duration for material and colour changes, the Rhythm envelope following the transition window; 6.4 interruption fuzz tests (retarget at random moments, rapid clicks, a change mid-stagger: no position or rotation jumps, no corrupted tweens); 6.5 an accelerated long-session soak with a fake clock plus resource and heap checks.

**Four questions to put to the user first (with my recommendations)**
1. Cycle semantics of "hold 15 min, transition 1 min": two fields, Hold (rest between transitions) and Transition window, the period being their sum (a change every 16 minutes: 1 moving, 15 still); the alternative is a change starting every 15 minutes (14 still).
2. After a hidden tab or a long freeze: pause everything together (animation and the hold timer on one clock, resume exactly where they left off, advances never queue); the alternative is catching up to wall-clock time.
3. What "per-object movement amplitude" means: how far or how strongly an object moves (anchors drifting less than details), with straight paths kept; or curved paths or overshoot (not recommended, the acceptance criteria stress no position jumps).
4. Default timing: an Exhibition preset (60 s transition, 15 min hold) as the default for new sessions, a visible Preset selector (Dev about 1 s and 4 s, Exhibition), saved configs keeping their own values.

**Lessons from Stage 5 that apply here**
- The lab `hold` harness gave different results on different runs of identical code in software GL (frames frozen at different states), so do not use a held frame as evidence on its own; real un-held frame sampling (`tools/verify/transition_frames.py`) and exact counts (`tools/verify/first_frame_check.py`) held up.
- Dev servers started in one tool call die before the next: start the server and run the check in the same command.
- Two long-standing abrupt-change bugs were found by comparing the exact first frame of a change with the picture before it (hatching set at once, v0.14.7; a white shadow-plane child switched on for the whole change, v0.14.8). Per-object scheduling touches the same code (`Tween.add`, `applyTween`, the shadow child, the colour front): re-run `first_frame_check.py` after every Stage 6 step.
- Per-frame cost is software-GL only here; nothing in Stage 5 or 6 has been run on a real GPU.


**Decisions (Stage 6 chat, answered by the user)**
1. Cycle: Hold (rest between transitions) and Transition window are two fields; the period is their sum.
2. Hidden tab or long freeze: pause everything together on one clock, resume where it left off, advances never queue.
3. Per-object amplitude: how far or how strongly an object moves (anchors drift less, details more), straight paths kept; no curved paths or overshoot.
4. Timing default: **Dev stays the default**; Exhibition (60 s transition, 15 min hold) is opt-in through a visible preset selector (Dev about 1 s and 4 s, Exhibition); saved configs, presets and links keep their own values.
5. Side question, no work now: a PNG export multiplier above 4x (8x). See the RELEASENOTES of the next step that touches export; short version: the scale list is one array (`EXPORT_SCALES` in `export/hiRes.js`, which the `<select>` in `index.html` duplicates by hand), the limits are `EXPORT_LIMITS` (8192 px longest side, 36 MP) and the GPU's own maximum, so 8x is a few lines for a small stage and silently clamps on a big one; see the reply for the numbers.

**6.5 done (v0.18.0, tests only; adjusted: no long runs from me, a tool for you):** `tests/soak.test.js`, 3 cycles in every `npm test`, `SOAK=1` (and `SOAK_HOURS`, `SOAK_CYCLES`, `SOAK_FPS`, `SOAK_HEAP_MB`) for a long simulated session at Exhibition timing; my own runs: 24 h in 2 s, 7 days in 14 s, heap flat (0.1 MB), cadence 960.03 s mean; sabotage-checked four ways. `Tween.stats()` added. A cycle lasts 960 s plus about one frame (the remainder past the deadline is dropped; carrying it is one line in `AutoAdvance.update`). Clock audit: nothing in `src/` accumulates an unbounded clock. Stage 6 acceptance table: RELEASENOTES v0.18.0. Open for you: the real-browser and real-GPU checks in the README ("Long sessions").

**6.4 done (v0.17.1, tests only):** `tests/fuzzInterruptions.test.js` runs in every `npm test` (24 seeds x 16 steps, about 1 s); `FUZZ=1` runs 1500 x 30 (`FUZZ_SEEDS`, `FUZZ_STEPS`, `FUZZ_ONLY=<seed>` to replay). Invariants after every step (finite numbers, one tween per shape, none on a gone shape), after every change (no jump in position, rotation or size; nothing outlasts the new window), and at the end (exactly a fresh scene, nothing left over; every run ends with an advance because size, spread and snap changes wait for the next advance by design). 6000 x 40 passed: no bug found in the code. Sabotage-checked seven ways, including the v0.15.1 ghost bug. `Tween.activeMeshes()` and `Tween.remainingOf()` were added as read-only diagnostics. See RELEASENOTES v0.17.1.

**6.3 done (v0.17.0, no config change):** each shape has three timelines in the window: geometry (6.2), colour (front and tone) and material (highlight amount, shadow colour, hatching); per role the other way round to the geometry (anchors recolour last, details first; `MOTION_PROFILES.<role>.color/.material`); a tween ends at the last of the three; the geometry's numbers are pinned unchanged; Lab Color delay is now a share of the colour's own span; Stagger 0 is still the v0.15.1 motion exactly. The Rhythm envelope already followed the window (pinned by a test). Open: real-time look on a real GPU; the colour and material tables are a first guess to tune by eye. See RELEASENOTES v0.17.0.

**6.2 done (v0.16.0, no config change):** `core/schedule.js` + `MOTION_PROFILES`: heavy overlap as chosen (everything starts within 25% of the window, arrives by its end), role profiles (anchor sine and first, support and connector cubic, accent and detail quart and last), deterministic from (seed, type, role, index); `Tween.add(..., schedule)`; colour, highlight, shadow and hatching follow each shape's own progress; Lab > Transition > Stagger (default 1, 0 = the old motion exactly). Decisions I made and flagged: "amplitude" read as the strength (peak speed) of the easing, not a shorter distance (impossible with straight paths and exact targets); Dev motion is staggered by default. Software GL runs the clock in slow motion (frames over 1 s count 100 ms): do not judge real-time timing there. See RELEASENOTES v0.16.0.

**v0.15.1 fix:** shapes still shrinking away from a slow change now leave with the next change (`Tween.finishWithin`, called by `settleLeaving` in `Composition`); found by the user in Exhibition then Dev, see RELEASENOTES v0.15.1. A timing switch alone does not shorten anything in flight.

**6.1 done (v0.15.0, config version 4):** see `RELEASENOTES.md` v0.15.0 and the README section "Time: the animation clock, transition and hold". Short form: `core/frameClock.js` `frameDt(raw)` is the one clock (frames up to 1 s count in full, longer ones are a suspension worth 100 ms, a hidden tab's gap is dropped); `AutoAdvance` is a hold counter on that clock (no `setInterval`, at most one advance per frame, restarts on any change start and on Auto on, frozen by the lab pause); `time` is `{ durationMs, holdMs, autoAdvance }` (transition 0.2 s to 5 min, hold 0 to 60 min; old `intervalMs` migrates as `max(0, interval - duration)`); the Motion tab has a Timing selector (Dev 1.1 s + 2.9 s default, Exhibition 60 s + 15 min) and fields in seconds. A manual Advance now delays the next automatic change by a full cycle (a decision I made and flagged; easy to reverse in `AutoAdvance.update`). Open: not tried on a really hidden tab or a real 16-minute cycle; the Motion tab on narrow screens; Exhibition is not applied to a saved Library preset (presets carry Dev timing, autoAdvance off).

**6.0 done (v0.14.9, tests only):** `tests/helpers/frameClock.js` (a fake frame source driving Tween and Rhythm as `SceneManager.loop` does) and `tests/timeModel.test.js`. Findings: no drift at 10 fps and above (animation time equals wall time at 30, 60 and 144 fps); below that, or with hitches and stalls, the 100 ms clamp makes animation fall behind real time (4 fps: a 60 s transition takes 150 s); `AutoAdvance` is a wall-clock `setInterval` independent of the frame loop, so advances queue behind a frozen loop; today's ranges (duration 6 s, interval 20 s) cannot hold the target timing. 6.1 rewrote the five "documents today" tests to the new contract (done).

## 13. Stage 7 — Exhibition mode and final integration (in progress)

**Audit findings (v0.18.0):** (1) a lost WebGL context left the ground black after the restore (fixed in 7.0); (2) loading a preset overwrites the viewer's timing and Auto with the preset's own (`SceneConfig.replace` takes `time`; the Library's is Dev timing with Auto off), so on an Exhibition display any preset load resets it; share links already carry the composition only; (3) there is no exhibition display mode: no fullscreen, no UI hiding, no cursor hiding, no wake lock, the stage is capped at its base size (`scale <= 1` in `applyOrientation`) and a stray click advances; (4) fine already: Auto and Exhibition timing, session autosave, presets with migration, the Library of 11, PNG export to 4x, soak and fuzz.

**Decisions (the user: "go with your suggestions"):** presets apply the composition only, timing and Auto stay the viewer's (own saved presets keep storing time but ignore it on load); exhibition mode fills the screen with a black surround, click-to-advance is off there but Space and the arrows stay, the cursor hides after 2 s idle, a screen wake lock is requested, entry by button or `F`, or `?exhibition` for kiosk use (a browser only allows real fullscreen after a gesture), the drawing buffer is capped; an error-triggered reload that restores the session, plus an optional `?reload=<hours>`; an optional curated progression (Auto cycles the Library presets, off by default); an absolute-size tiled still export (longest side in px, beyond 4x); no post-processing.

**Plan:** 7.0 context-loss recovery (done, v0.18.1); 7.1 presets keep the viewer's timing (done, v0.18.2); 7.2 exhibition display mode (done, v0.19.0); 7.3 unattended recovery (done, v0.20.0); 7.4 curated progression (optional; done, v0.21.0); 7.5 absolute-size tiled export and an export-matches-screen check (done, v0.22.0); 7.6 final integration (README, acceptance table, local real-GPU checklist).

**7.0 done (v0.18.1):** `core/contextRecovery.js` `watchContext`, `GroundLayer.invalidateGroundCache()`, the loop skips drawing while lost, export refuses while lost, `__proun.contextStats()`. Browser: five losses in a row and a loss mid-change both restore to 0.0% differing pixels. See RELEASENOTES v0.18.1.

**7.1 done (v0.18.2):** `SceneConfig.replace(raw, { keepTime })` and `presets/applyPreset.js`; both preset buttons use `applyPreset`; the session restore still takes its own timing; a loaded preset no longer switches Auto off. Browser: Library buttons leave Exhibition timing and Auto alone. See RELEASENOTES v0.18.2.

**7.2 done (v0.19.0):** `core/stageFit.js` (pure fit, 8.3 MP buffer budget), `core/ExhibitionMode.js` (class on body, Fullscreen API, wake lock, idle cursor, injected doc and window), `core/exhibitionParams.js` (`?exhibition`, `&auto`), F / Esc / button, click-to-advance off in the mode, `SceneManager.refit()` and a pixel-ratio listener. Verified in a real browser: hidden UI, black surround, fills one side at six window and orientation combinations, input policy, Auto running while hidden, idle cursor, context loss inside the mode, flags, the pixel budget at ratios 2 and 3. Seen and left alone: an orientation change without Advance crops the old layout (pre-existing design; offered to change). See RELEASENOTES v0.19.0.

**7.3 done (v0.20.0):** `core/watchdog.js` (20 errors in 60 s, or `?reload=<hours>`, flush the session, fade, reload; only in exhibition mode; never within 5 minutes of the last reload, kept in localStorage; no reload without usable storage); main.js wiring, `proun-fade-in` in sessionStorage, CSS fade; `__proun.watchdog.stats()`. The scheduled refresh reloads at the first idle moment after it is due, not at the end of a hold (a refinement, explained in RELEASENOTES v0.20.0). Verified in a real browser: storm, restore, no loop, no action in normal mode, scheduled idle and busy. Not detected: a frozen render loop with no errors.

**7.4 done (v0.21.0):** `time.playlist` (default false, in the viewer's own timing preferences), `core/Playlist.js` (shuffle, no repeat before all, no repeat at a round boundary), `AutoAdvance.advanceOnce` applies the next Library preset through `applyPreset` at the display's orientation (a decision flagged in RELEASENOTES v0.21.0, with the all-11 landscape sheet that supports it), checkbox under Auto, `?exhibition&playlist`; the soak runs both modes (7 simulated days pass); Library data regenerated for the new field. Only the Library's presets are in the sequence; the shuffle is not persisted across a reload.

**7.5 done (v0.22.0):** `Custom size…` in the export selector (longest side in px, 512 to 16384 px and 100 MP, never below the screen size); single pass within the old limits, tiles (<= 4096 px) beyond: `hiRes.js` `clampCustomSize` / `planTiles` / `groundTileUv` / `renderTiles`, `SceneManager.renderTiled` (camera `setViewOffset`, ground `uTile`, always restored, synchronous), `exportPNG({ size })`, filename `proun-<seed>@<px>px.png`. Verified in a real browser: tiled against single-pass 0.003% / 0.001% of pixels differ (2x, 3x), a real 9000 x 7000 (63 MP, 6 tiles, 74 s in software GL) export through the panel has no seam. Post-processing was not added (the decision). Not verified: 16384 px / 100 MP, other browsers, a real GPU.

**v0.22.1 fix (user report: no smooth transition between two background colours in the curated sequence):** the paper (ground colour, clear colour, edge tint, hatching paper and ink) was set in one frame when the palette changed; `core/PaperFade.js` now fades it over the transition window on the animation clock (sine ease, from the colours on screen, exact target at the end, follows the lab pause), `SceneManager` calls `paperFade.fadeTo` on a palette change and `setNow` for the first picture; Lab > Transition > Background fade (default on). Browser: 236, 228, 205, 178, 165 across the window against a cut to 165. Render guard 0.000%. See RELEASENOTES v0.22.1.

**7.6 done (v0.23.0, final integration):** `tests/stage7Integration.test.js` (7: the exhibition session round-trips through storage for every strategy; the autosave and `flush()`; corrupt, blocked, full and future storage never throws; v1, v2 and v3 sessions restore and keep their cadence; a share link leaves the display's timing; every Library preset on an exhibition display survives save and restore; the viewer's own preset loads as a composition and survives export and import); `tools/verify/exhibition_check.py` (22 checks against the real app, `SECTIONS=` to run some); `docs/LOCAL_CHECKS.md`; README tree and sections. Final pass: 52 files, 786 tests; FUZZ=1 1500 x 30; SOAK 168 h in both modes (cycle 960.03 s, heap +0.1 MB); 22 of 22 browser checks; full render guard (see RELEASENOTES v0.23.0).

## 14. After Stage 7: acceptance, what is open, how to continue

**Acceptance of the Stage 7 brief** (evidence; "yours" = needs a real display or GPU):

| Criterion | Shown by | Yours |
|---|---|---|
| A scene can run for hours without progressive degradation | soak 7 simulated days, random and curated, heap flat (+0.1 MB), cadence exact; context-loss recovery (browser: 3 losses, 0.000% differ); watchdog (error storm and scheduled refresh) | a real overnight run: GPU memory, geometries, textures, heap |
| Presets and configuration restoration remain reliable | `stage7Integration`, `presetTiming`, `persistence`, `library`, `sceneConfig` (migrations v1 to v4); browser: the session comes back after a watchdog reload | your own presets over time |
| The interface can be hidden without disrupting playback | `exhibition` tests; browser: Auto kept changing the picture while hidden; the clock and Auto are not touched by the mode | kiosk fullscreen on your browser |
| Exported images match the intended rendered composition | `pngExport`, `tiledExport`; browser: 1x export = the screen (0.0000%), a custom 3000 px single pass matches scaled down, a tiled render = a single-pass render (0.003%), a real 9000 x 7000 tiled export with no seam | an 8000+ px export on your GPU, at 100% on the tile boundaries |
| All major systems work together without regressions | 786 tests, fuzz 1500 x 30 and 6000 x 40, soak, golden layouts and Library byte-identical to v0.15.1, render guard, `exhibition_check.py` 22 of 22 | |

**Open decisions (none blocks anything; each is small):**
1. **Orientation change re-lays out at once?** Today an orientation change without Advance leaves the old layout in the new frame (cropped) until the next Advance (existing design). Offered twice; unanswered.
2. **Your own saved presets in the curated sequence** (today only the Library's 11), and persisting the shuffle across a reload (today a reload starts a new shuffle).
3. **Exact cadence:** a cycle lasts 960 s plus about one frame because the remainder past the deadline is dropped; carrying it is one line in `AutoAdvance.update`.
4. **A frozen render loop with no errors** is not detected by the watchdog (it acts on errors and the schedule); a frame-stall check could be added.
5. **The background fade timing:** over the whole window with a sine ease (`PaperFade.js`); the shapes' own colours have per-role timelines, the paper has none.
6. **Decided, not built:** post-processing (a render pass the export would have to reproduce; protects the composition quality).

**How to continue in a new chat:** upload the newest `proun-generator*.zip`; ask to read `docs/PROJECT_STATE.md` (this file), the last entries of `RELEASENOTES.md` and `docs/LOCAL_CHECKS.md`. `npm install`, then `npm test` (52 files) must pass before anything else; `tools/verify/README.md` has the browser setup. Conventions that held through Stages 5 to 7: audit first and ask the open questions before building; one smallest coherent step at a time; every behaviour change gets tests that fail when it is removed (sabotage-check them); verify in a real browser what tests cannot show; report what was not verified; never claim a check that was not run.
