# Proun Generator

A generative art tool inspired by El Lissitzky's *Proun* series, built with
Three.js. A fixed set of geometric primitives (cube, circle, sphere,
triangle…) are placed, colored, and periodically re-randomized within a
palette, easing between compositions with a lightweight tween engine and a
depth-based collision resolver so shapes never truly intersect in 3D.

> **Continuing the project?** Read [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) first: what was built in the
> visual-dynamics stage and why, what was verified, the open items, and how the work is done.
> [`tools/verify/`](tools/verify/README.md) holds the headless-browser verification harness.

## Setup

```bash
npm install
npm run dev       # local dev server with hot reload
npm run build      # production build -> dist/
npm run preview    # serve the production build locally
npm test           # run the unit tests (Vitest)
npm run typecheck  # strict type check of the files marked `// @ts-check`
```

## Deploying (GitHub Pages)

1. `npm run build` — produces `dist/`.
2. Push `dist/` to a `gh-pages` branch (or use a GitHub Action that runs
   `npm run build` and publishes `dist/`), since `vite.config.js` already
   uses a relative `base: './'` so the build works from a project subpath
   like `https://<user>.github.io/<repo>/`.

## Architecture

```
src/
├── main.js               boot sequence + keys: Space advances, ← / → step
│                         through history (ignored while a control is focused)
├── config/
│   ├── defaults.js        every tunable constant and limit in one place:
│   │                      time ranges/defaults, per-shape limits, scene
│   │                      bounds, collision margin, camera, orientations,
│   │                      overlay opacity; plus clampDuration/clampInterval;
│   │                      and DYNAMICS: the visual-dynamics constants
│   ├── SceneConfig.js     the scene's single source of truth: one small
│   │                      serializable object + update/replace/subscribe,
│   │                      validation, clamping, schema version + migrations
│   ├── store.js           the app's SceneConfig instance (wired to the
│   │                      real shape registry, palettes, orientations)
│   ├── History.js         step history: back/forward through seen compositions
│   ├── boot.js            what the app starts with: link > session > defaults
│   ├── session.js         autosave of the config to localStorage (debounced)
│   └── share.js           "#s=…" share links: encode / decode a composition
├── generator/
│   ├── rng.js             seeded PRNG (mulberry32) + hashing; randomSeed()
│   │                      is the app's only source of real entropy
│   ├── generate.js        PURE: (config, palette, shapes, camera) -> Layout[]
│   └── CollisionResolver.js   generic AABB + depth-axis push, shape-agnostic
├── core/
│   ├── SceneManager.js    renderer, camera, resize, render loop; follows the
│   │                      config's orientation/palette
│   ├── Billboard.js       fixed camera-facing orientation (used by circle)
│   ├── Rhythm.js          the shared event clock for visual dynamics (energy,
│   │                      phase, pause/hold), fed by Composition
│   ├── Tween.js           position/rotation/scale + color (classic lerp or the
│   │                      overpaint "front"); keeps each mesh's last tween so
│   │                      the lab can pause and scrub it
│   ├── Composition.js     the scene view: keeps meshes in step with the
│   │                      config (add/remove/dispose, visibility, re-layout)
│   └── AutoAdvance.js     the one timer: advances every time.intervalMs
├── shapes/
│   ├── registry.js        the list every shape must be added to
│   ├── cubeFixed.js
│   ├── cubeVariable.js
│   ├── circle.js
│   ├── sphere.js
│   ├── triangle.js
│   ├── plane.js
│   └── rod.js             thin line in the palette ink; passes through shapes
├── texture/
│   ├── PigmentResponse.js shader injection on the shape materials: the
│   │                      procedural PAINT field and the OVERPAINT colour change
│   ├── GroundLayer.js     the ground: a procedural full-screen layer behind the
│   │                      shapes (mottle, speckle, cracks) and its one-way morph
│   ├── noiseGLSL.js       shared GLSL hash / value noise / fbm
│   ├── paintSeed.js       the deterministic per-slot seed of a shape's paint
│   ├── PaperTexture.js    the paper-grain overlay sheet (cached, tinted per palette)
│   ├── PigmentLayer.js    legacy: pool of grayscale pigment canvases (used when
│   │                      the lab's "Procedural paint" is off)
│   ├── MicroVariation.js  subtle final jitter for the canvas textures
│   ├── noise.js           seeded canvas building blocks (withNoiseSeed)
│   └── materials.js       the shading contract (paintMesh), materialSetMesh
│                          (gives each mesh its colour-front state), boxMesh,
│                          disposeMesh
├── lab/
│   ├── labSettings.js     the lab schema (controls), store, group -> tab map
│   └── Lab.js             applies lab values to the systems; console hook
├── palette/
│   ├── palettes.js        palette data — edit here to add a palette
│   └── Palette.js         palette lookup; the active one comes from the config
├── presets/
│   └── PresetStore.js     localStorage-backed save/load/import/export of
│                          stored SceneConfigs, newest-first, capped at
│                          MAX_PRESETS (20)
├── export/
│   ├── PngExporter.js     canvas + overlay compositing -> PNG download
│   └── hiRes.js           1x/2x/4x export: render at a higher pixel ratio, restore
└── ui/
    ├── Panel.js           panel wiring: Orientation/Palette, the Time
    │                      accordion, shape tabs, Presets, action buttons
    ├── ShapeTabs.js        builds the icon tab row + per-shape settings
    │                      (count, size-range slider, spread, visibility)
    ├── tabs.js             generic tab-strip helper (icon or label tabs,
    │                      active state) used by ShapeTabs.js
    ├── PanelTabs.js        the panel's own tab strip (Scene/Shapes/Motion/
    │                      Surface), built from the .tab-page elements;
    │                      remembers the last tab. NOT tabs.js — names must
    │                      differ by more than case
    ├── LabPanel.js         builds the lab's groups into the Motion/Surface tabs
    ├── clipboard.js        copyText(): Clipboard API with a legacy fallback
    ├── shapeIcons.js       the minimal SVG glyphs used on the shape tabs,
    │                      keyed by shape `type` (unknown types fall back to
    │                      the circle glyph), plus the gear and padlock
    ├── accordion.js        shared collapsible-section helper (Time,
    │                      Presets)
    ├── PresetsPanel.js     builds the Presets accordion section: save,
    │                      the saved-preset list (load/export/delete per
    │                      row), and export-all/import
    └── panel.css           dark editorial panel styling
tests/                     Vitest unit tests (see "Tests" below)
src/generator/strategies/  composition strategies (index.js registry, run.js runner, common.js, axisThrust.js)
src/ui/CompositionControl.js the composition-strategy selector, on the Scene tab
tests/helpers/scene.js     fixtures: the real registry/palettes/camera axis, config builders
tests/golden/              fixed-seed reference layouts (layouts.json) + the scenarios that make them
tools/verify/              headless-browser verification harness (not part of the app)
tools/golden/update.mjs    regenerates tests/golden/layouts.json (`npm run golden:update`)
tools/diagnose.mjs         solver diagnostics over many seeds (`npm run diagnose`)
docs/PROJECT_STATE.md      handoff: decisions, evidence, open items, how we work
src/types.js               shared JSDoc types (SceneConfigState, LayoutEntry, ShapeDef…)
tsconfig.json              opt-in strict type checking (see "Types" below)
```

### State model: the SceneConfig

Everything that describes what's on screen is one small serializable object,
owned by `config/SceneConfig.js`:

```js
{
  version, seed, palette, orientation,
  time:   { durationMs, intervalMs, autoAdvance },
  shapes: { [type]: { visible, count, sizeMin, sizeMax, spread } }
}
```

There is exactly one way to change it and one way to react to it:

- **Write** with `SceneConfig.update(patch)` (validates and clamps every
  field; one call = one notification however many fields change) or
  `SceneConfig.replace(raw)` (a whole config from untrusted input — a preset).
- **Read** with `SceneConfig.get()` (deeply frozen) and **react** with
  `SceneConfig.subscribe((next, prev, { replaced }) => ...)`.

Everything else is a view of it or a reaction to it: the panel controls write
to it and repaint from it; `Composition` adds/removes/shows/hides meshes and
re-lays-out when the seed or palette changes; `SceneManager` follows
orientation and palette; `AutoAdvance` owns the timer. Nothing keeps a
private copy of a setting, and the UI never calls `Composition` or the
renderer to change one. (`Composition.advance()` and Export are actions, not
settings.) A subscriber must not call `update()`/`replace()` from inside a
notification.

### Generation, seeds and determinism

`generator/generate.js` is a pure function: `(config, palette, shapes,
camera view) -> Layout[]`, where a layout entry is plain JSON
(`{type, index, position, rotation, scale, hex}`). It never reads a global
and never calls `Math.random`; every random draw comes from a seeded rng.
Each instance draws from its own stream, keyed by `(seed, type, index)`, so
changing one type's count doesn't perturb any other instance's draws
(collision resolution still runs over the whole set).

**Advancing the composition = picking a new seed** (`Composition.advance()`
-> `SceneConfig.update({ seed })`); the scene then eases to
`generate(config)`. `randomSeed()` (via `crypto.getRandomValues`) is the one
place real entropy enters. So `seed + settings` fully determines the picture
(positions, rotations, scales, colors).

What a seed does *not* fix: the paper/pigment grain textures
(`texture/`), which are generated with their own unseeded noise and chosen
per instance when it's created. Two loads of the same preset are the same
composition, not pixel-identical grain.

Behaviors worth knowing:

- Changing a setting (size, spread…) does **not** re-layout by itself — it
  applies at the next advance, as before. Count changes are immediate (new
  instances appear at their generated position; removed ones are disposed).
- **Loading a preset restores the exact composition** it was saved with
  (provided settings hadn't been changed since the last advance when it was
  saved). `replace()` always re-lays-out, even if the config is unchanged,
  because the scene may be stale. Presets saved before seeds existed (schema
  v1) load their settings with a fresh seed, i.e. a re-roll, as they always did.
- A palette change re-rolls (new seed) in the same transition as the recolor.

### Locking a shape type

The padlock on each shape tab freezes that type **exactly as it is on
screen**: later advances re-roll everything else around it, and the locked
shapes never move, change size or recolor (not even on a palette change).
Nothing moves at the moment you lock, and mid-transition it freezes where the
shapes are *headed*.

How it stays a pure function of the config: a lock stores a frozen copy of
the type's instances (`shapes[type].locked`: position, rotation, scale and
color per instance) inside the SceneConfig. The generator emits them
verbatim and treats them as immovable obstacles, so everything else is placed
around them. Because the lock lives in the config, it also survives presets,
the autosaved session, share links (an optional `l` field) and history.

- A locked type's count is its number of instances, so the count, size and
  spread controls are disabled while it's locked (they're baked into the
  frozen instances); Visible still works. Unlock it and it is generated from
  the seed again at the next advance.
- A preset or link describes the whole composition, so one that doesn't lock a
  type unlocks it; it never inherits your current lock.
- Stored locks are validated like any other stored value, all-or-nothing: one
  malformed entry (or none) means no lock, so count and instances can't disagree.
- **Caveat.** The *other* shapes on screen when you lock were placed before
  the lock existed. Regenerating (loading a preset, or stepping back to the
  same seed) places them around the locked shapes, which can differ slightly
  from what was on screen at that moment. The locked shapes are always exact.
  (The alternative — re-laying-out the others when you click the padlock — would
  make shapes visibly shift on lock.)

### Composition strategies

The original generator places every shape independently (it is called **legacy**, and stays the default, byte-for-byte
unchanged: every existing seed, preset and link gives the layout it always did). A **composition strategy** instead
composes the whole scene around a structure, in screen space, and lifts the result into the scene. Selected with
`composition.strategy` in the config (schema v3; absent = legacy), from the Composition control on the Scene tab.

- **The strategy owns the counts.** A type's `count` only says whether the type may be used (0 = excluded); how many of each
  appear, and where, is the strategy's. `visible` is still only a display toggle. A *locked* type is replayed verbatim and
  taken out of the plan, as in legacy. `Composition` therefore sizes its mesh pools from the layout, not the config counts.
- **Screen space first.** `strategies/common.js` gives a strategy the frame (from the orientation) and the camera's screen
  basis; it plans screen positions, depths, angles and sizes. Because the camera is orthographic and the solver only moves
  shapes along the view axis, what the strategy places on screen stays exactly there; the solver (unchanged) only settles depth.
- **One saturated accent hue per scene.** The palette's accents are split by saturation (`splitPalette`): one saturated
  colour is picked per scene from the seed; everything else is a neutral. No palette data changes.
- **Roles.** Entries from a strategy carry `role` (anchor, support, connector, accent, detail); legacy entries have none.
- **Seeding.** Each element draws from its own stream keyed by (seed, strategy, role, i), so changing one element never
  changes another.
- A strategy is a module exporting `{ label, plan(ctx) }` (see `axisThrust.js`), one line in `strategies/index.js`, and tests.

**Axis thrust** (the first strategy): one diagonal organises the scene, chosen from the angle families found in the reference
works (about 12-25, 40 and 55-60 degrees, rising or falling). One primary mass sits near the centre (a disc, block, cube, sphere
or wedge); 2-3 long beams run along the axis across it and past the frame, at different depths; 2-3 small accents in the one
accent hue (smaller than the anchor by construction); 1-2 hairlines. It builds from whichever shapes are enabled, and uses the
Beam shape for its bars when that is enabled, a Segment as its large flat form, and Segments and Crescents as accents. Frames and rings (outline details that cross the masses) when those are enabled. Shading is still the legacy per-face tones, so
volumes read flatter than in the references (a tonal system is a later stage).

**Disc and beams** (the second strategy): a large flat disc is the anchor field (0.5-0.78 of the frame's height, a little off
centre and free to bleed off the frame; the circle shape when it is enabled, else a segment, sphere or block). Beams cross its
*rim*, not its middle: **one main angle** (the same angle families as Axis thrust), a primary beam and usually a parallel partner
beside it, then **one or two beams crossing them** at 40-90 degrees over the rim. One or two small accents (at most a fifth of the
disc) just outside it, one or two hairlines along the main angle, and, when enabled, a **ring concentric with the disc**
(1.12-1.45 times its size) and a frame across it. One saturated accent hue as always; the beams are never the disc's own colour.
The disc stays at the back and the beams in front of it with a clear depth gap, leaving room for a graphic shadow plane between
them (a later stage; nothing is cast yet).

**Central cluster** (the third strategy): a calm, upright composition, the white-ground cluster of the references. One tight
cluster near the middle (slightly above it): a main block, a large flat **plate behind** it (kept inside the frame), a low
**slab beside** it and a **tall bar** on the other side, standing upright and clearly taller than the block. A small second cluster
of two boxes against the bottom edge, a vertical hairline with two ticks and a dot at the edges, one tiny accent against the cluster
and, when frames are enabled, a **diamond outline** around the cluster (a frame at 45 degrees). All the solids are **world-aligned
with one shared orientation**, so the whole cluster is seen in one axonometric view (three faces each); through the fixed camera a
world-vertical edge is exactly vertical on screen, so the bar stands upright without turning, and `snapRotation` has nothing to
snap. The boxes' bounding boxes cover well under half the frame (tested: under 55% in every scene, under 40% on average).

The strategies share `strategies/shared.js` (the shape-type names, size and spread, the world-extents to scale conversion, and
the thrust angle, which the two diagonal strategies use) and `strategies/common.js`.

Diagnostics: `npm run diagnose` includes the strategy scenes. History entries (back/forward) and share links carry the
strategy; a link or preset that does not mention one is legacy.

### Step history

The `‹` / `›` buttons beside Advance (and the ← / → keys) step back and forward
through the compositions you've seen (`config/History.js`). A composition is
identified by its seed and palette; going back asks the config for that seed
again **with your current settings**, so it never rewrites your sliders or
counts, and locked shapes stay locked. Like a browser, moving to a new
composition after stepping back drops the "forward" entries. It keeps the last
100 in memory; a reload starts a fresh history from the restored composition.

### Rods

The Rod shape (`shapes/rod.js`) is a thin line in the palette's ink, long on
one random axis. It overlays other shapes rather than pushing them (`collides:
false`), and it starts at count 0 — add some with the stepper on its tab.

### Beams

The Beam shape (`shapes/beam.js`) is the long structural bar of the reference works: local x is the length (2.6-5.0), the
section is 0.11-0.30 wide by 0.7-1.6 of that, so it is always at least about five times as long as thick (the variable cube
can come out as a stripe, a slab or a chunk; a beam is always a beam). It has its own face tones, with the end faces darkest and
the long faces spread more than a plain box (about 1.8:1 against 1.3:1), so the cut ends read. Like the rod it starts at
count 0, so nothing existing changes; add some with the stepper on its tab. Under **Axis thrust**, an enabled beam makes the
scene's bars (chunkier than the stand-in boxes used otherwise, 6-40 times as long as thick), and a very thin beam stands in for
the hairlines when no rod, box or plank is enabled.

### Segments and crescents

Two flat, extruded forms (like the triangle: thin in z, turned in the picture plane by their rotation), both starting at count 0:

- **Segment** (`shapes/segment.js`): a circular segment, an arc over its chord. Local x is the chord, the arc bulges toward +y.
  It is a true circular segment, not a half-ellipse, so the arc leaves the chord at an acute angle (about 62 degrees at the
  base shape), the sharp-tipped cap of the large forms in the reference works. `randomScale` runs it from shallow to nearly a
  half disc.
- **Crescent** (`shapes/crescent.js`): a disc less a smaller, offset disc, with two sharp horns pointing toward +x.

Each module exports its outline and geometry builders (`segmentShape()`, `crescentGeometry()`, ...) so tests can check the
collision proxy (`localHalfExtents`) against the real geometry and the areas against the formulas. Under **Axis thrust**, an
enabled segment can be the large flat anchor (its chord along the axis) or an accent, and the crescent is an accent; neither
appears unless enabled.

### Outline frames and rings

Two thin outline forms, both extruded from real geometry (not built from bars), both starting at count 0, and both with
`collides: false` like the rod: an outline crosses other forms on purpose, and a solid collision box around a hollow frame would
only push things apart. They pass through other shapes and do not move them in depth.

- **Frame** (`shapes/frame.js`): one extruded rectangle with a real hole, a fixed 2.4:1, line weight 2.2% of its length. Local x
  is the long side. It scales uniformly (scaling a hollow rectangle unevenly would thicken one pair of sides more), so its line
  weight stays in proportion to its size.
- **Ring** (`shapes/ring.js`): a 270 degree partial ring, 2.5% of its diameter wide, the opening centred on local +x. Unlike
  the other flat forms its origin is the **circle's centre**, not the middle of its bounding box, so placing the shape places the
  circle and turning it swings the opening about the centre; its `localHalfExtents` are the whole circle's envelope.

Under **Axis thrust**, an enabled frame (long side along the axis, or across it) and ring (centred near the anchor, opening in a
random direction) each appear in about three scenes in four, in front of or behind the masses, in the accent hue or ink, or in
the lightest neutral when the anchor is dark (so they don't vanish against it).

Shape types added after a preset or link was made: a type the record never mentions takes its own default (off for the rod and
the beam), not the viewer's current settings, so an older preset or link restores its own composition.

### Adding a new shape

Create a module in `src/shapes/` implementing this contract:

```js
export default {
  type: 'my-shape',          // unique id, used as the instance key
  label: 'My Shape',         // shown in the panel checkbox
  facesCamera: false,        // true only if it should billboard like the circle
  localHalfExtents: { x, y, z }, // unscaled bounding half-extents, for collision
  create(hex) { /* returns a THREE.Mesh honoring the shading contract */ },
  randomScale(rng) { /* returns a THREE.Vector3; draw ONLY from `rng` */ },

  // all optional:
  colorRole: 'ink',          // always the palette's ink instead of a random accent
  collides: false,           // passes through other shapes (not pushed, not an obstacle)
  defaults: { count: 0 }     // starts differently from the global per-shape defaults
};
```

`rng` is a `() => [0, 1)` function (same contract as `Math.random`); using
`Math.random` inside `randomScale` would silently break seeds, and the shape
contract test (`tests/shapes.contract.test.js`) fails if you do.

Then add one line to `src/shapes/registry.js`. `Composition`,
`CollisionResolver`, and the panel's tab row all iterate the registry
generically. Two practical notes:

- For a box-based shape, `create()` can just `return boxMesh(hex, TYPE)`
  (`texture/materials.js`); for anything else build the geometry and call
  `materialSetMesh(geo, hex, shadeMultipliers, TYPE)`. A shape with unusual
  shading (the sphere's per-vertex colors) implements the **shading
  contract** itself: the mesh carries `userData.shapeType`, `baseColor` and
  an `applyShade(base)` function (see the header of `texture/materials.js`).
  Nothing outside that file and the shape knows how it's shaded — `Tween`
  and `Composition` only call `paintMesh(mesh, color)` — so a new shading
  scheme needs no edits elsewhere.
- Add a glyph for the new `type` in `ui/shapeIcons.js`, otherwise its tab
  shows the circle glyph.
- `rod.js` is the worked example of the optional fields: a hair-thin line in
  the palette's ink that overlays other shapes instead of pushing them, and
  starts at count 0 so existing compositions are unchanged. It needed no
  edits outside its own file, the registry line and one icon.

### Per-shape settings (count, size range, position spread)

`config.shapes[type]` holds, per shape: an instance **count**, a
size-multiplier range (`sizeMin`/`sizeMax`), a position `spread` (0–2), and
`visible`. They're layered on top of each shape's own logic rather than
replacing it:

- **Count**: `Composition` keeps `instances[type]` as an array of meshes and
  adds/removes entries when the config's count changes. A removed instance
  has its in-flight tween canceled (`Tween.removeForMesh`), is removed from
  the scene and **disposed** (`disposeMesh`: geometry, materials and
  textures) so nothing keeps animating or holding GPU memory. Each instance
  draws from its own `(seed, type, index)` stream, so instances never move in
  sync or share a color — including during collision resolution, which treats
  every instance of every type as one flat list (see below).
- **Size**: the generator multiplies whatever a shape's own `randomScale(rng)`
  returns by a value sampled from `[sizeMin, sizeMax]`. At the default
  1.0–1.0 this is a no-op — a shape's authored proportions are untouched.
- **Spread**: multiplies the shared position-sampling bounds
  (`BOUNDS` in `config/defaults.js`) per axis. 0 = always at the origin,
  1 = the full range, 2 = double.
- **Snap rotation to 45°** (`snapRotation`, off by default): every rotation
  angle of that type becomes a multiple of 45° instead of an arbitrary angle.
  It's applied *after* the random draws, so the stream is untouched: the same
  seed gives the same composition with its angles rounded (the generator's
  slight "lean" of up to ±0.3 rad rounds to exactly upright). Like size and
  spread it takes effect at the next advance. The circle has no such checkbox:
  it always faces the camera, so it has no rotation to snap. A locked type
  keeps its frozen rotations, and the checkbox is disabled while it's locked.

The panel's per-shape tab (`ui/ShapeTabs.js`) reads these from the registry
and writes them with `SceneConfig.update({ shapes: { [type]: {...} } })`, so
a new shape gets working count/size/spread controls with no UI code changes.
Size is edited with a dual-handle slider (log-scaled from 0.05 to 10).

### Startup, autosave and share links

What the app starts with is decided once, before anything subscribes to the
config (`config/boot.js`, called from `main.js`), in this order:

1. **A share link** in the URL fragment (`#s=…`) — the composition someone sent you.
2. **The autosaved session** — where you left off.
3. **The defaults.**

A link is applied *on top of* the session and carries only the composition
(seed, palette, orientation, per-shape settings). Timing — duration,
interval, auto-advance — is the viewer's own preference and stays whatever
their session had. After a link is read it is removed from the address bar
(so a reload doesn't re-apply it over later changes) and saved as the new
session, even if it was invalid.

**Autosave** (`config/session.js`) stores the whole SceneConfig under
`proun-session` shortly after it stops changing (400 ms debounce — an
auto-advance tick or a slider drag can change it many times), and
immediately when the page is hidden or closed. A reload therefore brings
back the same composition (the seed is part of the config) and settings.
Storage being missing, full or blocked is tolerated: autosave is best-effort
and never throws.

**Share links** (`config/share.js`, the "Copy link" button): the format is
`#s=` + base64url of a small JSON object `{v, s: seed, p: palette,
o: orientation, h: { [shapeType]: [visible(0/1), count, sizeMin, sizeMax,
spread] }}` — roughly 300 characters. Decisions worth knowing:

- The link format is versioned on its own (`SHARE_FORMAT`), independent of
  the config schema, and is meant to stay decodable forever: per-shape
  settings are keyed by shape *type* (not registry position) in a fixed
  field order, and nothing is left to defaults that might change later. A
  golden test pins both the encoded text and the decoded result, so an
  accidental format change fails loudly instead of breaking old links.
- Types with snap-rotation on are listed in another optional, additive field
  (`r`), so links carry it too; absent when nothing snaps, and a link that
  doesn't list a type turns it off for the viewer.
- A locked shape type travels with the link as an optional, additive `l`
  field (one flat array per instance, numbers rounded to 5 places), so a link
  to a composition with locks reproduces the locks. It is absent when nothing
  is locked, so such links are byte-for-byte what they were before locks
  existed, and the format version stays 1.
- Decoding yields a *patch* for `SceneConfig.update()`, which validates and
  clamps every value; unknown palettes, orientations and shape types are
  ignored. A hand-edited or corrupt link can't put the scene out of range,
  and a link that can't be decoded at all is simply ignored.
- Like presets, a link regenerates the composition from its settings, so if
  sliders were moved after the last advance the link reproduces what those
  settings generate, not necessarily what was on screen.

### Presets

`ui/PresetsPanel.js` + `presets/PresetStore.js` save the **whole
SceneConfig** (including the seed) under a name, reload it, delete it, and
import/export it as JSON — up to `MAX_PRESETS` (20, oldest dropped first).
Save writes `SceneConfig.toJSON()`; Load calls `SceneConfig.replace(preset)`,
which validates, clamps and migrates (unknown shape types dropped, shapes the
preset predates left alone, a missing seed replaced by a fresh one) and never
throws on malformed input. The panel and scene follow the config, so there's
no separate apply step. Presets persist in `localStorage`; if that's
unavailable the store falls back to an in-memory list for the session.

Schema and migration: `CONFIG_VERSION` (currently 2) is stamped on every
saved preset and on the autosaved session. Stored data goes through
`migrateConfig` (`config/SceneConfig.js`) before it is validated: it runs
`MIGRATIONS[n]` for every version from the data's own up to the current one,
so an old preset or session upgrades itself on load. Data with no/invalid
version is treated as v1; data from a *newer* version is loaded best-effort
(what's understood is kept); a failing step stops migration without throwing.
To change the stored format: bump `CONFIG_VERSION` and add `MIGRATIONS[old]`
(a test fails if you forget the step). v1 presets (no seed) load with a fresh
seed.

### Textures

What a shape's surface shows is now **procedural** (see "Visual dynamics" below): `PigmentResponse.js` computes
the paint in the fragment shader, and `GroundLayer.js` draws the paper/canvas behind the shapes. The older
canvas-based pieces remain: `PaperTexture.js` (the paper-grain overlay sheet, tinted into the CSS overlay on
top of the stage), and, behind the lab's *Procedural paint* switch, `PigmentLayer.js` (a pool of grayscale
pigment-coverage canvases picked by `pickStructureTexture()`) with `MicroVariation.js` (a last jitter pass).
All canvas noise is **seeded** (`withNoiseSeed` in `noise.js`), never `Math.random`.
All the *color* a shape shows comes from `material.color`, set via
`shadeColor()` in `texture/materials.js`, which also tags each mesh's
`userData` so `Tween.js` knows how to re-tint it as color eases between
states. **Both a shape's resting-state color and every tween frame's
recomputed color must go through the same `shadeColor()`/`clampColor()`
math** — three.js's `Color` works internally in linear space (color
management converts an sRGB hex string to linear on assignment), so mixing a
linear-space multiply with an sRGB-space one for the same nominal color
produces two visibly different results. An earlier version of this code did
exactly that (a separate integer-sRGB `shadeHex()` for material creation vs. a
linear `Color` multiply in the tween loop) and it caused a visible snap at the
start of every transition. If you add a new shading path, route it through
`shadeColor()`, not through raw hex-string math. To swap in real scanned
paper/watercolor images later, `texture/` is the only place that needs to
change — shape modules just call `materialSetMesh(...)`/`boxMesh(...)` and
don't know what's behind it.

### Visual dynamics

A composition change is an *event*. `core/Rhythm.js` is the shared clock for it:
`Composition` calls `Rhythm.trigger()` where it starts the tweens and the render
loop calls `Rhythm.update(dt)`. Anything that wants to react reads
`Rhythm.energy` (0..1 envelope, quick attack, slow release, exactly 0 at rest),
`Rhythm.phase`, .
Timing is relative to the transition duration and capped by the auto-advance
interval; a retrigger mid-event continues from the current energy. Constants
live in `DYNAMICS` (`config/defaults.js`).

**Color change = overpainting** (`texture/PigmentResponse.js`, `core/Tween.js`).
`Tween` paints a mesh its new color at once and drives a per-mesh `front`
(0 → 1, after a delay measured in transition durations); the shader blends back
toward the old color wherever the new paint has not arrived. The order of
arrival is a sweep through the form's own space, eroded by the pigment grain, with
a narrow edge, so only the two colors appear, plus a small tonal shift of each
(never paper, never a third hue). At rest the code is skipped by a uniform branch.
The sphere has no pigment map and keeps the classic color lerp. A change that
interrupts another keeps the layer it interrupted (frozen where it was) under the
new one, so patches that had already changed stay changed; interrupting a third
time settles the oldest layer, the one case that can still pop. (Earlier builds had a
"pigment thinning" toward the paper color; it was removed because it introduced
an extra color during changes.)

**Paint** (`texture/PigmentResponse.js`, `texture/paintSeed.js`): the grain on the
shapes is a procedural field computed in the shader in each face's own plane,
replacing the 256-pixel pattern (still used when *Procedural paint* is off in the
lab). Three bands with their own scale rules, after the reference works: fine
tooth is physical (the same size on every shape); strokes run along each face's
long side (the direction changes smoothly as a face's proportions change, so it never flips in one frame) at a width that follows the shape's size by `followStrokes`; coarse
stains follow the form by `followStains`. No stretching on thin shapes, no tile
seam, sharp at any export size. Each shape slot has a fixed seed
(`paintSeed(type, index)`), so the paint is reproducible and stays the same
through composition changes. The overpaint's order of arrival uses the same field,
so new color arrives along the strokes. The sphere (vertex colors) is not covered yet.

**Ground** (`texture/GroundLayer.js`): the paper/canvas texture behind the
shapes is a procedural full-screen layer drawn first (cloud mottle, fine
speckle, optional hairline cracks), seeded by a constant, in the picture's own
coordinates: the same for every composition and palette, sharp at any export
size. It varies the paper color around its mean, so its visibility changes the
texture, not the overall tone. The old DOM grain overlay stays at its constant
opacity over everything. `DYNAMICS.ground.visibility` is std/mean of luminance
(references: paper sheets ≈ 0.005–0.01, painted grounds ≈ 0.02–0.06).

**Ground morph** (`texture/GroundLayer.js`): every composition seed has its own
ground imprint: the mottle and the crack network (the fine speckle is the paper's
fixed grain).
When the seed changes the ground morphs **once, one way**, from the old pattern to the
new and stays there — the crack cells drift into their new positions on the same
morph, so the network rearranges continuously and never pops — after a delay, settling smoothly (a critically damped follower,
so a change that arrives mid-morph just retargets it: no restart, no going back).
While it morphs the patches also deform, condense and gain a little contrast, strongest
mid-morph and nil at both ends. The blend keeps the spread the same, so the paper's
overall tone never moves (no brightness jump). At rest the pattern depends only on the
current seed, so it is reproducible from a share link. A palette-only change (same
seed) does not move the ground. The code is skipped by a uniform branch at rest.

### Reproducibility, export and cost

Nothing in the picture is random at load: the paper-grain overlay and the legacy pigment pool are
built from seeded streams (`withNoiseSeed` in `texture/noise.js`), the paint and ground are pure
functions of position and a seed, and every layout/palette/accent comes from the composition seed.
A state reached by advancing and the same state opened from its share link render identically
(checked pixel for pixel, canvas and composited stage, in sessions with different `Math.random`
streams). PNG export re-renders the scene at 1×/2×/4× and composes the overlay; the ground and paint
are resolution-independent, and the ground's crack lines have a fixed physical width, so every
size shows the same picture (4× downsampled vs the 1× export: ≈0.8/255 mean difference; ground
texture bands agree across sizes). Exporting a paused (mid-change) scene matches the screen.
Resources stay flat over many changes (geometries, textures and shader programs constant; heap steady).
The ground is the heaviest layer — a full-screen shader with four-octave noise and a Worley crack
pass — so the lab shows a frame-rate readout; if a target GPU struggles, the structural fix is to
render the ground into a texture only while it changes and draw that at rest.

### Material lab

The panel is organised in four tabs — **Scene** (orientation, palette, presets: what the picture
is), **Shapes** (what is in it), **Motion** (time and how it changes) and **Surface** (what it is made
of) — with Advance, Export and Copy link pinned below. The material lab's controls live in the Motion
and Surface tabs as groups marked *lab* (generated from `LAB_SCHEMA`; `LAB_GROUP_TABS` in
`lab/labSettings.js` says which tab a group goes on). Tabs are `.tab-page` elements in `index.html`;
the strip is built from them (`ui/PanelTabs.js`) and the last open tab is remembered. Every section starts
collapsed. The lab holds the tuning controls:
pausing and scrubbing the last change (a *Step* slider: 0 = the scene before it, 1 = after, geometry and color together; works after the change has finished, and releasing mid-way lets it carry on to the exact end state), the paint (procedural
on/off, visibility, stroke width/length, how strokes and stains follow shape size),
the color change
(overpaint on/off against the classic lerp, delay, edge width, grain erosion,
tonal shift) the ground (on/off, visibility, patch size, cracks, crack size and elongation) and
the ground's morph (delay, morph time, condense, deform, contrast lift) and *Cracks vary*
(0 pins the cracks as the paper's fixed identity). It is
generated from `LAB_SCHEMA` (`lab/labSettings.js`) — a new shader parameter is
one schema entry plus a line in `lab/Lab.js`.

The lab is **session-local on purpose**: its values live in this browser's
localStorage (only those that differ from the defaults) and are not part of the
SceneConfig, so they never travel with presets, share links or history, and need
no migrations. When a value proves itself, *Copy defaults* prints the changed
values as a `DYNAMICS` fragment to paste into `config/defaults.js` (or promote it
to a real setting). *Reset lab* returns to the defaults. `window.__proun` exposes
the clock and the lab to the console.

### Types

The code stays plain JavaScript with no build step; type checking is opt-in.
`npm run typecheck` runs `tsc` (with `@types/three`) in strict mode, but only
reports files that start with `// @ts-check`. Currently checked: everything
in `config/` and `generator/`, `export/hiRes.js`, `presets/PresetStore.js`
and `core/AutoAdvance.js` — the pure, DOM-free core, where the data contracts live
(`SceneConfigState`, `LayoutEntry`, `ShapeDef`, … in `src/types.js`). The
renderer-facing files (`Composition`, `Tween`, `materials`, shapes, UI) aren't
opted in yet: they lean on `mesh.userData` and DOM lookups and would need
their own typing work first. Add `// @ts-check` to a file when you touch it
and fix what it reports.

### Constants and limits

Anything tunable lives in `config/defaults.js` — time ranges, per-shape
count/size/spread limits, scene bounds, collision margin, camera, stage
orientations, overlay opacity. The HTML number inputs get their
min/max/step/default from there at startup (`index.html` no longer carries
them), and values typed into the UI or loaded from an imported preset are
passed through `clampDuration()` / `clampInterval()`, so a bad number can no
longer produce a never-finishing tween or a runaway auto-advance timer.

### Tests

`npm test` runs Vitest (node environment).

**Seed -> composition regression suite (Stage 0b).** `golden` compares the generator's exact output for 15 fixed
(configuration, seed) reference scenes against `tests/golden/layouts.json`. A change to the generator, a shape's
`randomScale()`, the collision solver or the rng that moves any shape fails it. That is the contract *existing seeds keep
producing today's layouts*. If a change to the mapping is intended and approved, regenerate with `npm run golden:update` and
review the diff. Alongside it: `generate` (purity, ordering, snap rotation, locks, rods, circle bounds, depth-only
resolution), `collision` (separation, margin, fixed candidates, determinism, screen position unchanged), `sceneConfig`
(defaults, clamping, `replace()` semantics, locks, migrations) and `camera` (every shape stays inside the clip planes at the
UI's limits). `npm run diagnose` prints the solver's residual AABB / true-volume overlap and clipping rates over many seeds
(read-only; the baseline for Stage 3).

Strategy suites (Stage 2.1): `strategyCommon` (screen basis, lift, orientations, palette split), `axisThrust` (determinism, count ownership,
one anchor and subordinate accents, one dominant axis from the angle families, one saturated hue on every shipped palette, locks,
orientations, clip planes), `centralCluster` (world-aligned solids, an upright bar, the plate in the frame, the edge cluster, the 45 degree diamond, coverage),
`discBeams` (the second strategy: structure, one main angle with one or two crossing beams, the beams crossing the rim, colour,
ring concentricity), `layoutCounts`, and `persistence` (every registered strategy surviving share links, presets, session and
history; and types added later staying off). `beam` covers the shape's contract and proportions, its legacy and Axis thrust use, and the registry-wide contract;
`segmentCrescent` checks both outlines against the formulas (areas, tip angles, concavity), the collision proxies against the real
geometry, and their use in Axis thrust; `frameRing` checks the frame's hole and area, the ring's opening, area and pivot, that
both stay inside their envelopes and scale uniformly, and their use in Axis thrust.

The suites **added with the visual-dynamics work**:

- `rhythm` — the shared clock: envelope shape, continuity on retrigger, pause (`setHold`).
- `tween` — pause-and-scrub over finished and running changes, release mid-way, removal, replacement.
- `pigmentResponse` — the shader injection (anchors present in this three.js version, uniform branches, no randomness/time,
  smooth stroke direction, interrupted-layer support).
- `ground` — the ground shader's contract (procedural, seeded, physical crack width, per-seed crack morph) and the morph follower
  (delay, one-way, retargeting without a jump, history-independence, palette-only change, switched off).
- `lab` — schema (unique keys, defaults from `DYNAMICS`, group -> tab), normalization, "Copy defaults", the store (only non-default values persisted).
- `noise`, `paintSeed` — seeded streams are deterministic and independent of draw order.
- `tabs` — the panel's tab memory.

Earlier versions of this README also described suites for `rng`, `generate`, `SceneConfig` (the last two now exist again, rebuilt in Stage 0b), `shapes.contract`, `shading`,
`Composition`, `ui`, `migration`, `session`, `share`, `boot`, `clipboard`, `snap`, `lock`, `rod`, `History`, `hiRes`, `config`,
`CollisionResolver` and `PresetStore`. **The archive the visual-dynamics work started from did not contain a `tests/` directory**,
so those were not run or modified there. If they exist in your repository, keep them; two things may need updating (details in
`docs/PROJECT_STATE.md` §11): tests that expect the classic colour lerp in `Tween` (meshes now use the overpaint front by default;
call `setColorFront({ enabled: false })` or assert on `userData.front`), and UI tests that load `index.html` (the panel is now tab pages;
element ids are unchanged).

Not covered on purpose: anything needing a real canvas / WebGL context (the shaders' pixels, the render loop). That is what
`tools/verify/` is for.

### Collisions

`generator/CollisionResolver.js` never references a shape type by name —
it only reads each shape's `localHalfExtents` from the registry contract.
Shapes are allowed to overlap visually (the whole Proun look depends on
it) as long as they're at different depths along the camera's line of
sight; a genuine 3D intersection gets resolved by sliding the smaller
shape along the camera-forward axis, in whichever direction keeps the
scene's net depth closest to centered. See the comments in that file for
the full reasoning.

Known limitations:

- Resolution makes at most `COLLISION.maxIterations` (8) attempts per shape,
  so it is not a guarantee. Measured on synthetic scenes of unit-ish boxes:
  with 3 shapes about 3% of layouts leave an overlapping pair, with 6 about
  0.4 overlapping pairs on average, with 12 about 4, and with 24 about 27.
  Overlap is part of the look, but at high counts it is chance, not design.
- Collisions are only resolved on the *target* position
before a transition starts, not continuously during the transition itself,
so a shape's straight-line path can still briefly pass through another
shape mid-ease. Left alone for now since it wasn't visually noticeable at
~1s transition durations — worth revisiting if that changes.

### Export

`export/PngExporter.js` composites the WebGL canvas with the paper-grain
overlay (which lives in a separate DOM layer via CSS `mix-blend-mode`, so
it has to be drawn in manually to match what's on screen; the ground and paint are
inside the WebGL render, so they are re-rendered at the export size) and triggers a
download, named after the seed (`proun-<seed>.png`, `…@2x.png`). This is
intentionally its own module — a future SVG, JSON composition-recipe, or glTF
exporter would live alongside it in `src/export/` without touching rendering
code.

**Resolution.** The selector beside Export PNG sets 1× / 2× / 4× — multiples of
what's on screen (1× is exactly the old behavior). `export/hiRes.js` renders
the *same live renderer* at a higher pixel ratio, draws the result, and always
restores it (even if drawing fails), without touching the CSS size, so the stage
doesn't resize or flicker and color/antialiasing are identical to the screen.
The paper grain is stretched over the whole image the way CSS stretches it over
the stage, so it keeps the same proportions at every size. Sizes are capped
(8192 px on the longest side, 36 megapixels, and whatever the GPU reports); the
button says "(capped)" when that happens. A 4× export of a retina stage is about
5760×4480.

### The camera is fixed

There are no orbit controls. `Billboard.js` computes the "face the camera"
orientation once from the camera's fixed position — if you ever add
camera movement, that computation needs to move into the render loop
instead of running once at startup.
