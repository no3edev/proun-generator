# Release Notes

## Unreleased

- **Snap rotation to 45°.** Each shape type's settings (the gear) gained a
  "Snap rotation to 45°" checkbox. When on, every rotation angle of that type
  is a multiple of 45° instead of an arbitrary angle. Off by default, so
  nothing changes until you turn it on; applies at the next advance, like size
  and spread. The same seed gives the same composition with its angles
  rounded. Not offered for the circle (it always faces the camera). Saved in
  presets, the autosaved session and Copy link (links without it are
  unchanged); disabled while a type is locked.
- Tests: 382 (was 355).

**Features (Phase 4) — history, locks, rods, hi-res export:**

- **Step history.** `‹` / `›` buttons beside Advance (its label is now just "Advance" to make room; the full name is in its tooltip) (and the ← / → keys) step
  back and forward through the compositions you've seen. Going back uses your
  current settings, so it never rewrites your sliders or counts.
- **Lock a shape type.** A padlock on each shape tab freezes that type exactly
  as it is on screen: later advances re-roll everything else around it. Nothing
  moves when you lock. Locked shapes also survive presets, the autosaved
  session and Copy link. While locked, the type's count/size/spread controls
  are disabled; unlock to generate it from the seed again.
- **Rod shape.** A thin line in the palette's ink color, long on a random
  axis, that overlays other shapes instead of pushing them. It starts at count
  0 (add some from its tab), so existing compositions are unchanged. The
  shape contract gained optional `colorRole`, `collides` and `defaults`.
- **Hi-res PNG export.** A 1× / 2× / 4× selector beside Export PNG. 1× is
  exactly what it was; the larger sizes re-render the live scene at a higher
  pixel ratio (same colors and antialiasing), are capped to what the GPU can
  render (the button says "(capped)"), and files are named for the seed.
- Locks travel in share links via an optional field; links without locks are
  unchanged and the link format version stays 1.
- Tests: 354 (was 234).

**Persistence pass (Phase 3) — autosave, share links, explicit migration, types:**

- **Your session is remembered.** The current composition (seed included) and
  all settings are autosaved to `localStorage` and restored on reload.
- **Copy link** (new button under Export PNG): copies a URL that opens the app
  on the same composition (seed, palette, orientation, per-shape settings).
  Timing is not part of a link; a viewer keeps their own. The link is removed
  from the address bar once read. Links use their own versioned format and are
  designed to stay valid across future releases; invalid or hand-edited links
  are ignored or clamped, never fatal.
- **Explicit schema migration**: stored configs (presets, session) pass through
  `migrateConfig` before validation; the mechanism is tested with an injected
  migration table. Presets/sessions from older or newer versions load
  best-effort instead of failing.
- **Fixed:** a presets list stored as valid JSON of the wrong shape (an
  object, a number, `null`) used to throw and break the presets panel.
- **Fixed (test suite):** a Phase 2 composition test that depended on the
  random default seed (it passed or failed by chance) now asserts only what is
  guaranteed.
- Opt-in strict type checking (`npm run typecheck`, `// @ts-check`) for the
  config, generator and preset modules, with shared types in `src/types.js`.
- Tests: 234 (was 175).

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
