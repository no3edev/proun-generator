# Release Notes

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