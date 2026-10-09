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
  position: [4.2, 3.4, 5.2] // fixed oblique axonometric-style viewpoint
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
