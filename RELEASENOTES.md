# Release Notes

## v0.2.0 — 2026-09-27

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
