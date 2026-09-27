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
├── main.js               boot sequence
├── core/
│   ├── SceneManager.js    renderer, camera, orientation/resize, render loop
│   ├── Billboard.js       fixed camera-facing orientation (used by circle)
│   ├── Tween.js           position/rotation/scale/color easing
│   └── Composition.js     orchestration: builds candidates, resolves
│                          collisions, drives Tween — no shape-specific code
├── shapes/
│   ├── registry.js        the list every shape must be added to
│   ├── cubeFixed.js
│   ├── cubeVariable.js
│   ├── circle.js
│   ├── sphere.js
│   ├── triangle.js
│   └── plane.js
├── collision/
│   └── CollisionResolver.js   generic AABB + depth-axis push, shape-agnostic
├── texture/
│   ├── PaperTexture.js    procedural grain/blotch canvas generator
│   └── materials.js       shared material-building helpers
├── palette/
│   ├── palettes.js        palette data — edit here to add a palette
│   └── Palette.js         active-palette state
├── settings/
│   └── ShapeSettings.js   per-shape size-multiplier range, position spread, visibility
├── export/
│   └── PngExporter.js     canvas + overlay compositing -> PNG download
└── ui/
    ├── Panel.js           dev control panel wiring
    ├── ShapeAccordion.js  per-shape collapsible settings sections
    ├── accordion.js       shared collapsible-section helpers (used by
    │                      ShapeAccordion.js and the panel's Time section)
    └── panel.css
```

### Adding a new shape

Create a module in `src/shapes/` implementing this contract:

```js
export default {
  type: 'my-shape',          // unique id, used as the instance key
  label: 'My Shape',         // shown in the panel checkbox
  facesCamera: false,        // true only if it should billboard like the circle
  localHalfExtents: { x, y, z }, // unscaled bounding half-extents, for collision
  create(hex) { /* returns a THREE.Mesh */ },
  randomScale() { /* returns a THREE.Vector3 */ }
};
```

Then add one line to `src/shapes/registry.js`. `Composition`,
`CollisionResolver`, and the panel's checkbox list all iterate the registry
generically — nothing else needs to change.

### Per-shape settings (count, size range, position spread)

`settings/ShapeSettings.js` holds, per shape type: an instance **count**,
a size-multiplier range (`sizeMin`/`sizeMax`), a position `spread` (0–2),
and `visible`. These are layered on top of each shape's own logic rather
than replacing it:

- **Count**: `Composition.js` keeps `instances[type]` as an array of
  meshes, not a single mesh — `setCount()` adds or removes entries live,
  canceling any in-flight tween on a removed instance (`Tween.removeForMesh`)
  so nothing keeps animating a mesh no longer in the scene. Each instance
  of the same type independently calls `randomTarget()`, so instances
  never move in sync or share a color — including during collision
  resolution, which treats every instance of every type as just another
  candidate in one flat list (see below).
- **Size**: `Composition.js` multiplies whatever a shape's own
  `randomScale()` returns by a value randomly sampled from
  `[sizeMin, sizeMax]`. At the default 1.0–1.0 this is a no-op — a shape's
  authored proportions (stripe/slab/block moods, the plane's thin-axis
  logic, etc.) are untouched. Widen the range and that shape runs bigger
  or smaller overall while keeping its character.
- **Spread**: multiplies the shared position-sampling bounds (in
  `Composition.js`) per axis. 0 = always at the origin, 1 = the full
  range used today, 2 = double that range.

The panel's per-shape accordion (`ui/ShapeAccordion.js`) reads and writes
these directly from the registry, so a new shape gets working count/size/
spread controls with no UI code changes. New instances added via the
count stepper are placed with their own random target immediately, but
are not collision-resolved against the rest of the scene until the next
`advance()` — a brief, self-correcting overlap rather than added
complexity for an edge case.

### Textures

`texture/PaperTexture.js` generates the grain/blotch canvas used both as the
CSS paper overlay behind the stage and baked into every shape's material.
`texture/materials.js` wires that into `MeshBasicMaterial`s via
`shadeColor()`/`clampColor()` and tags each mesh's `userData` so `Tween.js`
knows how to re-tint it as color eases between states. **Both a shape's
resting-state color and every tween frame's recomputed color must go
through the same `shadeColor()`/`clampColor()` math** — three.js's `Color`
works internally in linear space (color management converts an sRGB hex
string to linear on assignment), so mixing a linear-space multiply with an
sRGB-space one for the same nominal color produces two visibly different
results. An earlier version of this code did exactly that (a separate
integer-sRGB `shadeHex()` for material creation vs. a linear `Color`
multiply in the tween loop) and it caused a visible snap at the start of
every transition. If you add a new shading path, route it through
`shadeColor()`, not through raw hex-string math. To swap in real scanned
paper/watercolor images later, `texture/` is the only place that needs to
change — shape modules just call `materialSetMesh(...)` and don't know
what's behind it.

### Collisions

`collision/CollisionResolver.js` never references a shape type by name —
it only reads each shape's `localHalfExtents` from the registry contract.
Shapes are allowed to overlap visually (the whole Proun look depends on
it) as long as they're at different depths along the camera's line of
sight; a genuine 3D intersection gets resolved by sliding the smaller
shape along the camera-forward axis, in whichever direction keeps the
scene's net depth closest to centered. See the comments in that file for
the full reasoning.

Known limitation: collisions are only resolved on the *target* position
before a transition starts, not continuously during the transition itself,
so a shape's straight-line path can still briefly pass through another
shape mid-ease. Left alone for now since it wasn't visually noticeable at
~1s transition durations — worth revisiting if that changes.

### Export

`export/PngExporter.js` composites the WebGL canvas with the paper-grain
overlay (which lives in a separate DOM layer via CSS `mix-blend-mode`, so
it has to be drawn in manually to match what's on screen) and triggers a
download. This is intentionally its own module — a future SVG, JSON
composition-recipe, or glTF exporter would live alongside it in
`src/export/` without touching rendering code.

### The camera is fixed

There are no orbit controls. `Billboard.js` computes the "face the camera"
orientation once from the camera's fixed position — if you ever add
camera movement, that computation needs to move into the render loop
instead of running once at startup.
