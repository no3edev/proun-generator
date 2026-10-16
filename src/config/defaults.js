// @ts-check
// The one home for tunable constants and limits, so UI limits, state
// clamping (config/SceneConfig.js) and imported-preset validation can
// never drift apart. DOM-free and three.js-free on purpose (safe to
// import from tests).

// --- time ---------------------------------------------------------
export const TIME = {
  durationMs: { min: 200, max: 6000, step: 100, default: 1100 },
  intervalMs: { min: 500, max: 20000, step: 100, default: 4000 }
};

/**
 * @param {{ min: number, max: number, default: number }} range
 * @param {unknown} value
 */
function clampTo(range, value) {
  // null / '' / whitespace would coerce to 0 and clamp to `min`; an empty
  // field should mean "use the default", as it did before
  const blank = value == null || (typeof value === 'string' && value.trim() === '');
  const n = blank ? NaN : Number(value);
  if (!Number.isFinite(n)) return range.default;
  return Math.max(range.min, Math.min(range.max, Math.round(n)));
}

/**
 * Always returns a usable transition duration (ms), whatever it's given.
 * @param {unknown} value
 */
export function clampDuration(value) {
  return clampTo(TIME.durationMs, value);
}

/**
 * Always returns a usable auto-advance interval (ms), whatever it's given.
 * @param {unknown} value
 */
export function clampInterval(value) {
  return clampTo(TIME.intervalMs, value);
}

// --- per-shape settings ------------------------------------------
export const SHAPE_LIMITS = {
  // a soft cap — collision resolution is O(n^2)-ish per advance
  count: { min: 0, max: 12 },
  // multiplier applied on top of each shape's own randomScale();
  // the UI slider is log-scaled across this span
  size: { min: 0.05, max: 10, step: 0.05 },
  spread: { min: 0, max: 2, step: 0.01 }
};

export const SHAPE_DEFAULTS = {
  visible: true,
  sizeMin: 1.0,
  sizeMax: 1.0,
  spread: 1.0,
  count: 1,
  snapRotation: false,
  locked: /** @type {import('../types.js').LockedEntry[] | null} */ (null)
};

// The step used when a shape type's "snap rotation" option is on: every
// rotation angle is rounded to a multiple of this (45 degrees)
export const ROTATION_SNAP = Math.PI / 4;

// Sanity bounds for a locked type's stored instances (they come from
// presets, links and the autosaved session, so they're validated like any
// other stored value)
export const LOCK_LIMITS = {
  position: 50,      // |x|, |y|, |z|
  rotation: 1000,    // radians
  scale: { min: 0.001, max: 100 }
};

// --- scene geometry -----------------------------------------------
// The full-spread (spread = 1) region shapes are placed within. z is
// wider than a purely cosmetic range since depth is an active axis
// collision resolution can push shapes along.
export const BOUNDS = { x: 1.9, y: 1.4, z: 1.5 };

export const COLLISION = {
  margin: 0.18,      // minimum gap left between resolved shapes
  maxIterations: 8   // per-shape resolve attempts before giving up
};

// --- camera / stage ------------------------------------------------
export const CAMERA = {
  frustumSize: 6,
  position: [4.2, 3.4, 5.2], // fixed oblique axonometric-style viewpoint
  // Clip planes, as distances from the camera along its view direction. The
  // camera is orthographic, so these only decide what is clipped, never where
  // anything lands on screen. They are deliberately wide, and `near` is
  // negative (legal for an orthographic camera: the near plane may lie
  // behind the camera). Collision resolution slides shapes along the view
  // axis and, with many large shapes, takes them dozens of units either way
  // (+-57 measured at the UI limits: 12 of each shape, size 10); with the
  // former 0.1..100 planes everything pushed past ~7.4 toward the camera was
  // cut away. tests/camera.test.js asserts the range covers those limits.
  near: -100,
  far: 200
};

export const ORIENTATIONS = {
  landscape: { w: 720, h: 560 },
  portrait: { w: 560, h: 720 },
  square: { w: 640, h: 640 }
};

// Opacity of the DOM paper-grain overlay. Applied from JS (SceneManager)
// and reused by the PNG exporter, so on-screen and exported images match.
export const OVERLAY_OPACITY = 0.5;

// Longest single frame the animation loop will integrate, so a tab
// returning from the background doesn't fast-forward every tween.
export const MAX_FRAME_MS = 100;

// --- visual dynamics ------------------------------------------------
// Timing for the shared event clock (core/Rhythm.js), and the constants of
// the color change and the ground layer. Units are relative to the
// transition duration so everything scales with the rhythm instead of being
// tied to specific milliseconds. Tuning knobs, not user settings: the
// material lab (lab/labSettings.js) edits them live and "Copy defaults"
// prints the values to paste back here.
export const DYNAMICS = {
  envelope: {
    attack: 0.35,              // energy rises over this many durations ...
    release: 1.8,              // ... and falls over this many (a slow settle) ...
    releaseMaxOfInterval: 0.6, // ... but never longer than this share of the auto-advance interval
    releaseMin: 0.3            // ... nor shorter than this many durations
  },
  // The pigment map every shape carries, read as a density field: the value
  // range (green channel, measured on the generated pool) that maps to 0..1.
  grainMap: { low: 0.885, high: 0.95 },
  // Color change as overpainting (texture/PigmentResponse.js, core/Tween.js):
  // the new color arrives in broken coverage over the old one. Only the two
  // colors ever appear, plus a small tonal shift of each.
  color: {
    delay: 0.1,  // coverage starts this share of the transition after the geometry starts moving
    soft: 0.62,  // width of the coverage edge (0 = a hard line, 1 = the whole form blending at once)
    grain: 0.94, // how much the pigment grain, not the sweep direction, decides where the new color lands first (0-1)
    tone: 0.045  // largest lighter/darker shift of a patch's own color, mid-change (0 = none)
  },
  // The paint on the shapes (texture/PigmentResponse.js): a procedural field
  // in each face's own plane, replacing the old 256-pixel pattern. Three
  // bands, each with its own scale rule, after the reference works: fine
  // tooth is physical (the same size on every shape), strokes run along each
  // face's long side with a roughly constant width, coarse stains belong to
  // the form. `follow*` blends each band between world scale (0) and
  // scale-with-the-form (1).
  paint: {
    visibility: 0.03, // luminance variation of the paint (std / mean); references' painted faces ~0.04-0.09, the old pattern ~0.006
    base: 0.93,       // mean multiplier on the color (the old pattern averaged ~0.92)
    strokeScale: 1,   // stroke width multiplier
    strokeLength: 5,  // how many times longer than wide a stroke is
    followStrokes: 0.5, // 0 = strokes keep one width on every shape, 1 = they scale with the shape
    followStains: 1     // same for the coarse stains
  },
  // The ground's own change after a composition change (texture/GroundLayer.js):
  // the paper's mottle MORPHS, once and one way, from the pattern of the old
  // composition to the pattern of the new one (every composition seed has its
  // own ground), and stays there. While it morphs the patches also deform,
  // condense and strengthen a little, strongest mid-morph, nil at both ends.
  // Mean-neutral: the paper's overall tone never moves, only its texture.
  groundMotion: {
    delay: 0.2,    // the morph starts this many transition durations after the change
    duration: 1.6, // time to settle onto the new pattern, in transition durations
    evolve: 0.7,   // mid-morph, patches condense from soft clouds toward defined blotches (0-1)
    warp: 0.03,    // mid-morph, how far the patches deform, in picture heights
    lift: 0.35     // mid-morph, extra contrast as a share of the resting visibility
  },
  // The ground: the paper/canvas texture behind the shapes (texture/GroundLayer.js).
  // Procedural and fixed in the picture's own coordinates, so it is the same
  // for every composition, every palette and every export size.
  ground: {
    visibility: 0.022, // luminance variation of the ground (std / mean); references: paper sheet ~0.005-0.01, painted grounds ~0.02-0.06
    scale: 0.5,       // patch size multiplier
    cracks: 0.78,     // hairline craquelure, 0 = none (reference 01 has a dense network)
    crackScale: 0.65, // crack cell size multiplier (>1 = smaller cells, finer network)
    crackStretch: 3.2, // how much taller than wide the cells are (1 = round, reference 01 is mostly vertical)
    crackVary: 1,     // how much the crack network is part of each generation's imprint (0 = the paper's cracks never change, 1 = every seed has its own network and the cells drift into it with the mottle)
    seed: 7.31        // fixed: the ground never re-rolls
  }
};
