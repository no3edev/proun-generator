# Proun Generator — project state and handoff

Written at the end of the "Intelligent Material & Visual Dynamics" work (code state: v0.5.0, unreleased,
delivered as `proun-generator45.zip`). Read this first when continuing the project in a new chat; the
README is the reference for the app itself, this file is the reference for **why it is the way it is, what
was verified, and what is still open**.

## 1. What this is

A generative art tool inspired by El Lissitzky's Proun series (Three.js, plain ES modules, Vite, Vitest). The
current stage turned a static material into a **visual-dynamics system**: a composition change is an *event*
that the shapes' colour and paint, the ground (the paper/canvas behind) and the render react to on their own
timings. The artistic target is *painting on paper that stays synthetic*: procedural pseudo-material, minimum
geometry, maximum expressive behaviour, geometric clarity preserved (see the original brief, summarised in
§3). The reference works are in the Claude Project's files (`01.jpg` … `06.jpg`).

## 2. Continuing: setup and a starter message

```
npm install
npm run dev            # Vite dev server
npm test               # Vitest (node environment)
npm run typecheck      # tsc, JSDoc strict types
npm run build
```

Verification without a GPU: `tools/verify/` (headless Chromium + seeded random streams; see its README).
The user judges visuals in their own browser; everything below marked "checked" was checked in headless
Chromium with software WebGL.

Suggested first message in a new chat: *"Continue Proun Generator. Upload: the latest zip + docs/PROJECT_STATE.md.
Read §9 (open items) and §10 (how we work). Next I want: …"*

## 3. The original brief, condensed

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

## 4. Status against the plan

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

## 5. Architecture of the dynamics

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

## 6. Decision log (what and why)

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

## 7. Evidence

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

## 8. Post-processing assessment

Not built, deliberately. The analog character is carried by materials (paint strokes, cracks, overpaint, ground morph); edges
are crisp like the references. A final pass costs a render target (MSAA-capable), a changed export path (`renderAtScale`), another
full-screen pass on top of the heavy ground, and a new determinism risk. If something transition-specific is wanted later
(slight softness during changes), try it **inside the materials** first.

## 9. Open items (prioritised)

1. **GPU cost of the ground.** It is a full-screen shader (4-octave fbm, Worley crack pass; ×2 during a morph) on every frame, even at rest.
   In software GL it dominated the frame (≈210 ms vs 65 ms without it — only the ratio means anything). The lab shows a frame-rate readout.
   If a target GPU struggles: **cache the ground in a render target and redraw it only while it changes** (morph, lab edits, resize/export scale).
   Cheaper first steps: single-hash `hash22` for the crack cell centres, fewer octaves, 2×2 Worley search.
2. **Sphere** has no paint/overpaint (vertex colours, smooth shading breaks with a procedural field). User: leave it until its role in the
   composition is clearer. Consider texturing via a normal-aware path or removing the shape's flat-shaded facets.
3. **Paint "swim":** physical-scale bands are anchored in world units, so while a shape scales during a change the strokes/tooth slide under the
   surface (continuous, not a jump). Setting both *follow size* sliders to 1 pins it.
4. **Third interruption** settles the oldest colour layer (small pop). Shapes created/removed by a change appear/vanish at once and are not scrubbed.
5. **Cracks vs speckle:** speckle is the only fixed grain left; consider a per-generation speckle or crack-specific morph delay if the ground still
   reads as "the same texture".
6. **Palette-specific ground character** (paper sheet vs cracked ground vs wood) — would need a small palette field; deliberately not added yet.
7. **Narrow screens:** the tab strip should become a bottom bar; the panel overlays the stage below ≈1250 px.
8. **Graduate lab values:** use *Copy defaults* when the user settles values (current defaults in `DYNAMICS`; see the user's review values in
   RELEASENOTES).
9. **Tests:** see §11 — the repository copy this stage started from had no `tests/`; only the new suites exist here.
10. Possible directions: pigment edge irregularity in-material; light gradation per face; a texture "imprint" per generation for shapes too.

## 10. How we work (collaboration protocol)

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

## 11. Merging into the full repository (compatibility notes)

- This stage worked from `proun-generator29.zip` (folder `proun-generator28`), whose `tests/` directory was **absent**, although the README lists many suites.
  Keep your existing tests; this delivery adds: `ground`, `lab`, `noise`, `paintSeed`, `pigmentResponse`, `rhythm`, `tabs`, `tween` tests.
- **Likely to need an update in your own suites:**
  - Tests that expect the classic colour lerp in `Tween` (e.g. an interruption-without-snap test): meshes from `materialSetMesh` now use the overpaint *front*
    by default (colour painted at once, `uFront` driven). Either call `setColorFront({ enabled: false })` in those tests or assert on `userData.front`.
  - UI tests that load `index.html`: the panel is now four `.tab-page` containers (hidden except one once `initTabs()` runs); all previous element ids are unchanged.
    The Lab's left panel and `#lab-toggle` are gone.
  - `Composition` tests: `createInstance` now sets `mesh.userData.front.uSeed` (guarded) — no GL needed.
- Files added/changed: see `RELEASENOTES.md` and the README architecture tree. `ui/PanelTabs.js` (new) ≠ `ui/tabs.js` (existing, used by ShapeTabs).
- The harness in `tools/verify/` is independent of the app and of `npm test`.

## 12. Quick reference

Lab keys (defaults in `DYNAMICS`): Transition `holdOn, hold`; Color change `colorFront, colorDelay(0.10), colorSoft(0.62), colorGrain(0.94), colorTone(0.045)`;
Paint `paintOn, paintVis(0.03), strokeScale(1), strokeLength(5), followStrokes(0.5), followStains(1)`;
Ground `groundOn, groundVis(0.022), groundScale(0.5), groundCracks(0.78), groundCrackSize(0.65), groundCrackStretch(3.2), groundCrackVary(1)`;
Ground motion `gmOn, gmDelay(0.2), gmDuration(1.6), gmEvolve(0.7), gmWarp(0.03), gmLift(0.35)`.
Console hook: `window.__proun = { Rhythm, Lab, groundMotion, getRenderer() }`. Storage keys: lab `proun.lab.v2`, last tab `proun.ui.v1`.
