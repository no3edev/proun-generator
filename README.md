# Proun Generator

A generative art tool inspired by El Lissitzky's *Proun* series, built with
Three.js. A fixed set of geometric primitives (cube, circle, sphere,
triangle…) are placed, colored, and periodically re-randomized within a
palette, easing between compositions with a lightweight tween engine and a
depth-based collision resolver so shapes never truly intersect in 3D.

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
│   │                      overlay opacity; plus clampDuration/clampInterval
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
│   ├── Tween.js           position/rotation/scale/color easing
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
│   ├── PaperTexture.js    layer 1: the paper sheet (cached, tinted per palette)
│   ├── PigmentLayer.js    layer 2: pool of grayscale pigment-coverage canvases
│   ├── MicroVariation.js  layer 3: subtle final jitter (future animation hook)
│   ├── noise.js           canvas building blocks shared by the three layers
│   └── materials.js       the shading contract (paintMesh), materialSetMesh,
│                          boxMesh, disposeMesh
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

Materials are built from three layers, all grayscale and color-independent so
a small pool can be built once and reused for every palette and accent:
`PaperTexture.js` (the sheet; also tinted into the CSS paper overlay behind
the stage), `PigmentLayer.js` (paint coverage, picked from a pool by
`pickStructureTexture()`), and `MicroVariation.js` (a last subtle jitter pass).
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

`npm test` runs Vitest (jsdom for the UI file only):

- `rng`, `generate` — seeded streams, determinism, "never calls
  `Math.random`", per-instance independence, size/spread semantics.
- `SceneConfig` — defaults, clamping, change notification, `replace()`,
  v1 -> v2 migration, garbage input, round-trips.
- `shapes.contract` — every registered shape honors the contract
  (metadata, `randomScale(rng)` draws only from the rng, shading contract,
  `localHalfExtents` matches the real geometry, disposal).
- `shading` — the color math is identical to the pre-refactor formula;
  `Tween` easing, interruption without a color snap, exact end values.
- `Composition` — against a real `THREE.Scene` (no GL): the scene always
  equals `generate(config)`; counts, disposal, tween cancellation,
  visibility, palette, seed restore.
- `ui` — the real `index.html` driven through Panel / ShapeTabs /
  PresetsPanel / the Space key: what each control writes, how controls repaint
  from the config, preset save/load.
- `migration`, `session`, `share`, `boot`, `clipboard` — migration mechanism
  (with an injected table), debounced autosave and flush, the share-link
  format (golden tests, hostile input), startup priority, clipboard fallback;
  plus the "Copy link" button and a full `bootConfig()` run in `ui`.
- `snap` — the setting (booleans only, presets never inherit it), snapped
  angles (always multiples of 45°, never `-0`, same random stream), links, the
  scene, and the checkbox in the real UI.
- `lock`, `rod` — lock validation and generation (locked shapes verbatim,
  fixed obstacles, count forced), the optional shape-contract fields (ink
  color, non-colliding, per-shape defaults); plus, in `Composition`, locking
  against a real scene (nothing moves at lock time, mid-transition,
  palette, presets, history) and, in `share`, locks in links.
- `History`, `hiRes` — back/forward semantics (branching, limit, current
  settings), export scale clamping and the render-and-restore sequence
  (including on failure), overlay compositing, file naming.
- `ui.features` — the lock toggle, history buttons and ← / → keys, the export
  control and the rod tab, driven through the real `index.html`.
- `config`, `CollisionResolver`, `PresetStore` — clamping, collision (incl.
  fixed obstacles), storage (including storage holding valid JSON of the wrong shape).

Not covered on purpose: anything needing a real canvas / WebGL context (the
texture canvases, actual pixels, the render loop).

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
it has to be drawn in manually to match what's on screen) and triggers a
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
