# Release Notes

## Unreleased

- Added **Plane** — a box whose thickness is always minimal on one
  randomly-chosen axis, so it reads as a flat rectangular plane rather
  than a volume. Unlike Cube (variable)'s "slab" mood, its two broad
  axes vary independently, so planes range from near-square to long
  rectangular strips. Registered alongside the other five shapes; no
  changes needed elsewhere thanks to the shape-registry contract.

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
