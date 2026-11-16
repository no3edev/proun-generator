// @ts-check
// The one home for tunable constants and limits, so UI limits, state
// clamping (config/SceneConfig.js) and imported-preset validation can
// never drift apart. DOM-free and three.js-free on purpose (safe to
// import from tests).

// --- time ---------------------------------------------------------
// A change cycle is a TRANSITION (the window in which shapes move) followed by a
// HOLD (the rest before the next change starts): the period is their sum. The
// Dev defaults (1.1 s + 2.9 s) keep the old 4 s cadence; Exhibition is the
// long-duration target (1 minute moving, 15 minutes still). Both are stored in
// ms; the panel shows seconds.
export const TIME = {
  durationMs: { min: 200, max: 300000, step: 100, default: 1100 },
  holdMs: { min: 0, max: 3600000, step: 100, default: 2900 }
};

/** Named timing presets (Motion tab). A config whose two values match neither shows as "Custom". */
export const TIMING_PRESETS = {
  dev: { label: 'Dev', durationMs: 1100, holdMs: 2900 },
  exhibition: { label: 'Exhibition', durationMs: 60000, holdMs: 900000 }
};

/** The range the interval had before Stage 6 (config version 3): only the v3 -> v4 migration reads it. */
export const LEGACY_INTERVAL_MS = { min: 500, max: 20000, default: 4000 };

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
 * Always returns a usable hold (ms), whatever it's given.
 * @param {unknown} value
 */
export function clampHold(value) {
  return clampTo(TIME.holdMs, value);
}

/**
 * Pre-Stage 6 intervals (config version 3), clamped as they were.
 * @param {unknown} value
 */
export function clampLegacyInterval(value) {
  return clampTo(LEGACY_INTERVAL_MS, value);
}

/**
 * The time from one change starting to the next: the transition plus the hold.
 * @param {{ durationMs: number, holdMs: number }} time
 */
export function cycleMs(time) {
  return time.durationMs + time.holdMs;
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
  margin: 0.18,      // minimum gap left between resolved shapes (both solvers)
  maxIterations: 8,  // legacy solver: per-shape resolve attempts before giving up
  // the volume solver (composition strategies; generator/strategies/volumeSolver.js):
  maxPasses: 24,     // blocking shapes one sweep may jump over before it gives up (a shape that cannot get clear is reported unresolved)
  maxShift: 6,       // the farthest a shape may be slid along the view axis from the depth its strategy planned
  orderSlack: 3      // extra distance a shape will slide to stay on its planned side (in front / behind) of another
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

// What the animation clock advances by on a suspended frame (see STALL_MS).
export const MAX_FRAME_MS = 100;
// A frame this long (or longer) is not a slow frame but a suspension: a hidden
// tab, a debugger, a laptop lid. The animation clock then advances by
// MAX_FRAME_MS only, so everything resumes exactly where it left off. Shorter
// frames count in full (core/frameClock.js), so the timing keeps real time on a
// slow machine instead of stretching with the frame rate.
export const STALL_MS = 1000;

// --- visual dynamics ------------------------------------------------
// Timing for the shared event clock (core/Rhythm.js), and the constants of
// the color change and the ground layer. Units are relative to the
// transition duration so everything scales with the rhythm instead of being
// tied to specific milliseconds. Tuning knobs, not user settings: the
// material lab (lab/labSettings.js) edits them live and "Copy defaults"
// prints the values to paste back here.
// How each kind of shape moves within a transition window (Stage 6.2), as shares of the window. Every profile starts within the
// first `maxStart` of the window and is over by its end, so the shapes overlap heavily and read as one movement; what differs is
// WHEN each starts, how much of the window it takes and how sharply it eases: anchors start first and drift slowly with a gentle
// ease, details start last and travel quickly with a crisp one. `delay` and `span` are [min, max] ranges drawn per shape from the seed.
// Colour and material (Stage 6.3) have timelines of their own, independent of the geometry's, also as shares of the window and each
// over by its end: `color` is the new colour's sweep and the tone with it, `material` the highlight, the shadow's colour and the
// hatching. They run the other way round to the geometry: anchors, which move first, recolour last; details recolour first.
export const MOTION_PROFILES = {
  maxStart: 0.25,
  anchor: {
    delay: [0, 0.04], span: [0.88, 1], ease: 'sine',
    color: { delay: [0.3, 0.42], span: [0.5, 0.58], ease: 'sine' },        // anchors recolour LATE ...
    material: { delay: [0.2, 0.32], span: [0.55, 0.65], ease: 'sine' }
  },
  support: {
    delay: [0.02, 0.12], span: [0.62, 0.85], ease: 'cubic',
    color: { delay: [0.18, 0.3], span: [0.45, 0.6], ease: 'cubic' },
    material: { delay: [0.12, 0.22], span: [0.5, 0.62], ease: 'cubic' }
  },
  connector: {
    delay: [0.05, 0.16], span: [0.55, 0.8], ease: 'cubic',
    color: { delay: [0.12, 0.24], span: [0.4, 0.55], ease: 'cubic' },
    material: { delay: [0.08, 0.18], span: [0.45, 0.58], ease: 'cubic' }
  },
  accent: {
    delay: [0.1, 0.22], span: [0.42, 0.68], ease: 'quart',
    color: { delay: [0.04, 0.14], span: [0.35, 0.5], ease: 'cubic' },
    material: { delay: [0.06, 0.16], span: [0.4, 0.52], ease: 'cubic' }
  },
  detail: {
    delay: [0.12, 0.25], span: [0.35, 0.6], ease: 'quart',
    color: { delay: [0, 0.08], span: [0.3, 0.45], ease: 'cubic' },          // ... details EARLY, before they have moved much
    material: { delay: [0.04, 0.12], span: [0.35, 0.48], ease: 'cubic' }
  },
  // a legacy shape has no role: it moves like a support
  other: {
    delay: [0.02, 0.12], span: [0.62, 0.85], ease: 'cubic',
    color: { delay: [0.18, 0.3], span: [0.45, 0.6], ease: 'cubic' },
    material: { delay: [0.12, 0.22], span: [0.5, 0.62], ease: 'cubic' }
  }
};

export const DYNAMICS = {
  // per-object motion (core/schedule.js)
  motion: {
    stagger: 1,  // 0 = every shape moves over the whole transition with one easing (the motion before Stage 6.2), 1 = the full role profiles
    paperFade: true  // the paper (ground, edge tint, hatching) fades over a transition when the palette changes; false = in one frame, as before 7.6
  },
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
  // The edge character of box-like faces (texture/edge.js, PigmentResponse.js). Where a face meets its edge the paint is a little
  // thinner (the paper tooth shows through, broken up by the grain) and, a little further in, a little thicker (it pools). Widths
  // are world units (6 units are the canvas height); strengths are mixes 0..1. Strategies only; legacy keeps flat edges.
  edge: {
    width: 0.03,     // the band, from the edge inward
    thinning: 0.18,  // how far the colour goes toward the paper at the very edge, where the grain lets it
    pooling: 0.06    // how much darker the ridge just inside the band is
  },
  // Hatching (texture/hatch.js): graphite-style parallel lines on the Mass backdrop (when dark) and about half the shadow planes.
  // Spacing is a world length (6 units are the canvas height), the width a fraction of the spacing, light / dark the share a line
  // goes toward the ink (on a light or mid surface) or toward the paper (on a dark one), wobble a fraction of the spacing, breaks
  // the noise level under which a line has a gap, shadowShare the share of shadow planes that are hatched.
  hatch: { spacing: 0.06, width: 0.3, light: 0.13, dark: 0.10, wobble: 0.2, breaks: 0.22, shadowShare: 0.5 },
  // The silhouette (stage 5.3): where a form's outline meets the paper, a narrow soft edge and a slight irregularity, as alpha
  // (blended; alpha to coverage drew bright fringes in the software renderer the checks run in). World lengths; irregularity only ever erodes (the outline cannot grow).
  silhouette: { softness: 0.008, irregularity: 0.006, slowFreq: 2.9, fineFreq: 18 },
  // The materials' response to the shared event clock (core/Rhythm.js, stage 5.4): while a composition changes, Rhythm's energy rises
  // and settles, and the edge band, the silhouette softness and the paint's tooth follow it by these fractions of their value at
  // peak energy (0.4 = up to 40% more). At rest energy is 0, so a still is exactly what it was. Strategies only.
  response: { edge: 0.4, softness: 0.4, tooth: 0.15 },
  // the grain that breaks the thinned edge up (compiled in): noise frequency per world unit, and how much of the thinning
  // is there where the grain is lowest
  edgeGrain: { scale: 160, floor: 0.35 },
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
