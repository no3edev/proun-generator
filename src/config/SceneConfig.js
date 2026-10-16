// @ts-check
import {
  SHAPE_LIMITS, SHAPE_DEFAULTS, LOCK_LIMITS, TIME, clampDuration, clampInterval
} from './defaults.js';
import { randomSeed as defaultRandomSeed } from '../generator/rng.js';

/** @typedef {import('../types.js').SceneConfigState} SceneConfigState */
/** @typedef {import('../types.js').SceneConfigContext} SceneConfigContext */
/** @typedef {import('../types.js').ShapeSettings} ShapeSettings */
/** @typedef {import('../types.js').TimeSettings} TimeSettings */
/** @typedef {import('../types.js').ConfigMeta} ConfigMeta */
/** @typedef {import('../types.js').CompositionSettings} CompositionSettings */

/** The strategy every config starts with and falls back to: the original generator. */
export const LEGACY_STRATEGY = 'legacy';

// The scene's single source of truth: one small serializable object that
// fully describes what is on screen (together with the shape registry).
//
//   {
//     version, seed, palette, orientation,
//     time:   { durationMs, intervalMs, autoAdvance },
//     composition: { strategy },
//     shapes: { [type]: { visible, count, sizeMin, sizeMax, spread } }
//   }
//
// Everything else — the live meshes, the panel controls, the auto-advance
// timer, saved presets — is a view of, or a reaction to, this object.
// Writes go through update()/replace() (which validate and clamp), reads
// through get(), and anything that needs to react subscribes.
//
// This file is DOM-free and three.js-free (testable in plain node); the
// app's instance, wired to the real shape registry and palettes, is
// config/store.js.

/**
 * Schema version of the config as persisted (presets, the autosaved
 * session). Bump it when a stored field is added, removed or reinterpreted,
 * and add a step to MIGRATIONS.
 *   1  (legacy) no seed — loading a preset re-rolled the composition
 *   2  adds `seed` — loading a preset restores the exact composition
 *   3  adds `composition.strategy` — absent (every v1/v2 config) means 'legacy',
 *      the original generator, so older presets and links give the same layouts
 */
export const CONFIG_VERSION = 3;

/**
 * Migration steps: MIGRATIONS[n] takes a raw version-n object and returns
 * its version-(n+1) form (the version field itself is stamped by
 * migrateConfig). Steps only reshape data; clamping, defaults for missing
 * fields and dropping unknown ones remain normalizeConfig's job, so a step
 * stays small.
 * @type {Record<number, (raw: Record<string, any>) => Record<string, any>>}
 */
export const MIGRATIONS = {
  // v1 -> v2: `seed` was added. A v1 config has none; normalizeConfig then
  // gives the loaded config a fresh seed (a re-roll, as v1 always was).
  1: (raw) => ({ ...raw }),
  // v2 -> v3: `composition` was added. A v2 config has none; normalizeConfig
  // reads that as the legacy strategy.
  2: (raw) => ({ ...raw })
};

/**
 * Brings any stored config up to `target` by running every migration from
 * its own version onward. Never throws:
 *  - no/invalid `version`      -> treated as v1 (the oldest format)
 *  - newer than `target`       -> returned as-is (best effort: normalizeConfig
 *                                 keeps what it understands)
 *  - a step that throws        -> migration stops there; what we have is
 *                                 still sanitized by normalizeConfig
 * `migrations`/`target` are injectable so the mechanism itself is testable.
 *
 * @param {unknown} raw
 * @param {typeof MIGRATIONS} [migrations]
 * @param {number} [target]
 * @returns {Record<string, any>}
 */
export function migrateConfig(raw, migrations = MIGRATIONS, target = CONFIG_VERSION) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const obj = /** @type {Record<string, any>} */ (raw);
  let version = Number.isInteger(obj.version) && obj.version >= 1 ? obj.version : 1;
  if (version >= target) return obj;
  let cur = { ...obj };
  while (version < target) {
    const step = migrations[version];
    if (step) {
      try {
        cur = step(cur);
      } catch (err) {
        break;
      }
    }
    version += 1;
    cur = { ...cur, version };
  }
  return cur;
}

const isNum = Number.isFinite;
/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * @template T
 * @param {T} obj
 * @returns {T}
 */
function freezeDeep(obj) {
  Object.values(/** @type {object} */ (obj)).forEach((v) => {
    if (v && typeof v === 'object') freezeDeep(v);
  });
  return Object.freeze(obj);
}

/**
 * uint32 seed, or null if `v` isn't a usable number.
 * @param {unknown} v
 * @returns {number | null}
 */
export function normalizeSeed(v) {
  return typeof v === 'number' && isNum(v) ? v >>> 0 : null;
}

/**
 * @param {TimeSettings} base
 * @param {any} patch
 * @returns {TimeSettings}
 */
function normalizeTime(base, patch) {
  const p = patch && typeof patch === 'object' ? patch : {};
  return {
    durationMs: isNum(p.durationMs) ? clampDuration(p.durationMs) : base.durationMs,
    intervalMs: isNum(p.intervalMs) ? clampInterval(p.intervalMs) : base.intervalMs,
    autoAdvance: typeof p.autoAdvance === 'boolean' ? p.autoAdvance : base.autoAdvance
  };
}

/**
 * A valid strategy name: `name` if it is one of the context's, else legacy.
 * @param {unknown} name
 * @param {SceneConfigContext} ctx
 */
function normalizeStrategy(name, ctx) {
  const names = ctx.strategyNames || [LEGACY_STRATEGY];
  return typeof name === 'string' && names.includes(name) ? name : LEGACY_STRATEGY;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * @param {unknown} v
 * @param {number} lo
 * @param {number} hi
 * @returns {[number, number, number] | null}
 */
function vec3(v, lo, hi) {
  if (!Array.isArray(v) || v.length !== 3) return null;
  if (!v.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  return /** @type {[number, number, number]} */ (v.map((n) => clamp(n, lo, hi)));
}

/**
 * Validates a locked type's stored instances. All-or-nothing: one bad entry
 * (or none at all) means no lock, so count and instances can never disagree.
 * @param {unknown} list
 * @returns {import('../types.js').LockedEntry[] | null}
 */
export function normalizeLocked(list) {
  if (!Array.isArray(list) || list.length < 1 || list.length > SHAPE_LIMITS.count.max) return null;
  /** @type {import('../types.js').LockedEntry[]} */
  const out = [];
  for (const e of list) {
    if (!e || typeof e !== 'object') return null;
    const position = vec3(e.position, -LOCK_LIMITS.position, LOCK_LIMITS.position);
    const rotation = vec3(e.rotation, -LOCK_LIMITS.rotation, LOCK_LIMITS.rotation);
    const scale = vec3(e.scale, LOCK_LIMITS.scale.min, LOCK_LIMITS.scale.max);
    if (!position || !rotation || !scale) return null;
    if (typeof e.hex !== 'string' || !HEX_COLOR.test(e.hex)) return null;
    out.push({ position, rotation, scale, hex: e.hex.toLowerCase() });
  }
  return out;
}

/**
 * @param {ShapeSettings} base
 * @param {any} patch
 * @returns {ShapeSettings}
 */
function normalizeShape(base, patch) {
  const p = patch && typeof patch === 'object' ? patch : {};
  const next = { ...base };
  if (typeof p.visible === 'boolean') next.visible = p.visible;
  if (typeof p.snapRotation === 'boolean') next.snapRotation = p.snapRotation;
  if (isNum(p.count)) {
    next.count = clamp(Math.round(p.count), SHAPE_LIMITS.count.min, SHAPE_LIMITS.count.max);
  }
  if (isNum(p.spread)) {
    next.spread = clamp(p.spread, SHAPE_LIMITS.spread.min, SHAPE_LIMITS.spread.max);
  }
  if (isNum(p.sizeMin) || isNum(p.sizeMax)) {
    // keep min <= max so the sampling range is never inverted
    const a = isNum(p.sizeMin) ? p.sizeMin : base.sizeMin;
    const b = isNum(p.sizeMax) ? p.sizeMax : base.sizeMax;
    const { min, max } = SHAPE_LIMITS.size;
    next.sizeMin = clamp(Math.min(a, b), min, max);
    next.sizeMax = clamp(Math.max(a, b), min, max);
  }
  // locked: null unlocks; a valid list locks; anything else leaves it as is
  if (p.locked === null) next.locked = null;
  else if (p.locked !== undefined) next.locked = normalizeLocked(p.locked) || base.locked || null;
  // a locked type's instances ARE its count
  if (next.locked) next.count = next.locked.length;
  return next;
}

/**
 * The defaults, for the given shape types / palette / orientation.
 * @param {SceneConfigContext} ctx
 * @returns {SceneConfigState}
 */
export function createDefaultConfig({ shapeTypes, defaultPalette, defaultOrientation, randomSeed, shapeDefaults }) {
  /** @type {Record<string, ShapeSettings>} */
  const shapes = {};
  shapeTypes.forEach((t) => {
    shapes[t] = normalizeShape({ ...SHAPE_DEFAULTS }, (shapeDefaults || {})[t]);
  });
  return freezeDeep({
    version: CONFIG_VERSION,
    seed: randomSeed(),
    palette: defaultPalette,
    orientation: defaultOrientation,
    time: {
      durationMs: TIME.durationMs.default,
      intervalMs: TIME.intervalMs.default,
      autoAdvance: false
    },
    composition: { strategy: LEGACY_STRATEGY },
    shapes
  });
}

/**
 * Turns anything (a stored preset, an imported file, garbage) into a valid
 * config, falling back to `base` field by field. Never throws.
 *  - invalid/missing palette or orientation  -> keep base's
 *  - shape types absent from `raw`           -> keep base's settings
 *    (a preset saved before a shape existed still loads)
 *  - unknown shape types in `raw`            -> dropped
 *  - missing/invalid seed (legacy v1)        -> a fresh seed
 *
 * @param {unknown} raw
 * @param {SceneConfigState} base
 * @param {SceneConfigContext} ctx
 * @returns {SceneConfigState}
 */
export function normalizeConfig(raw, base, ctx) {
  const src = migrateConfig(raw);

  /** @type {Record<string, ShapeSettings>} */
  const shapes = {};
  ctx.shapeTypes.forEach((type) => {
    const saved = src.shapes && src.shapes[type];
    shapes[type] = saved && typeof saved === 'object'
      // a preset that doesn't say `visible` means visible, and one that
      // doesn't say `locked` (or says something invalid) means unlocked; an
      // option it doesn't mention (snapRotation) is off, never inherited
      ? normalizeShape(base.shapes[type], {
        ...saved,
        visible: typeof saved.visible === 'boolean' ? saved.visible : true,
        snapRotation: saved.snapRotation === true,
        locked: normalizeLocked(saved.locked)
      })
      // a type the record never mentioned (typically one added since it was
      // saved) was not part of that composition: it takes the type's own
      // default (off for the rod and the beam), never the current settings
      : normalizeShape({ ...SHAPE_DEFAULTS }, (ctx.shapeDefaults || {})[type]);
  });

  const seed = normalizeSeed(src.seed);
  return freezeDeep({
    version: CONFIG_VERSION,
    seed: seed === null ? ctx.randomSeed() : seed,
    palette: ctx.paletteNames.includes(src.palette) ? src.palette : base.palette,
    orientation: ctx.orientationNames.includes(src.orientation) ? src.orientation : base.orientation,
    // a preset that doesn't say autoAdvance means off
    time: normalizeTime(base.time, { ...(src.time || {}), autoAdvance: !!(src.time && src.time.autoAdvance) }),
    // a preset that doesn't say means legacy (like autoAdvance, never inherited)
    composition: { strategy: normalizeStrategy(src.composition && src.composition.strategy, ctx) },
    shapes
  });
}

/**
 * @param {SceneConfigState} state
 * @param {any} patch
 * @param {SceneConfigContext} ctx
 * @returns {SceneConfigState}
 */
function applyPatch(state, patch, ctx) {
  const p = patch && typeof patch === 'object' ? patch : {};
  const next = { ...state };
  if (ctx.paletteNames.includes(p.palette)) next.palette = p.palette;
  if (ctx.orientationNames.includes(p.orientation)) next.orientation = p.orientation;
  const seed = normalizeSeed(p.seed);
  if (seed !== null) next.seed = seed;
  if (p.time) next.time = normalizeTime(state.time, p.time);
  if (p.composition && typeof p.composition === 'object' && typeof p.composition.strategy === 'string') {
    const names = ctx.strategyNames || [LEGACY_STRATEGY];
    if (names.includes(p.composition.strategy)) next.composition = { strategy: p.composition.strategy };
  }
  if (p.shapes && typeof p.shapes === 'object') {
    next.shapes = { ...state.shapes };
    Object.keys(p.shapes).forEach((type) => {
      if (state.shapes[type]) next.shapes[type] = normalizeShape(state.shapes[type], p.shapes[type]);
    });
  }
  return freezeDeep(JSON.parse(JSON.stringify(next)));
}

/**
 * @param {Omit<SceneConfigContext, 'randomSeed'> & { randomSeed?: () => number }} ctx
 */
export function createSceneConfig(ctx) {
  const context = { ...ctx, randomSeed: ctx.randomSeed || defaultRandomSeed };
  let state = createDefaultConfig(context);
  /** @type {Set<(next: SceneConfigState, prev: SceneConfigState, meta: ConfigMeta) => void>} */
  const listeners = new Set();

  /**
   * @param {SceneConfigState} next
   * @param {ConfigMeta} meta
   * @param {boolean} [force]
   */
  function commit(next, meta, force = false) {
    if (!force && JSON.stringify(next) === JSON.stringify(state)) return false;
    const prev = state;
    state = next;
    // Listeners must not call update()/replace() from inside a
    // notification — change reactions, not further changes.
    [...listeners].forEach((fn) => fn(state, prev, meta));
    return true;
  }

  return {
    /** The current config. Deeply frozen: never mutate it, call update(). */
    get() {
      return state;
    },

    /**
     * Applies a partial change ({ palette?, orientation?, seed?,
     * time?: {...}, shapes?: { [type]: {...} } }), validating and clamping
     * every field. One call = one notification, however many fields change.
     * @param {any} patch
     * @returns {boolean} whether anything actually changed
     */
    update(patch) {
      return commit(applyPatch(state, patch, context), { replaced: false });
    },

    /**
     * Replaces the whole config from untrusted input (a preset). Listeners
     * get meta.replaced === true: unlike update(), this should visibly
     * restore the saved composition even if the seed happens to match.
     * It ALWAYS notifies, even when the result equals the current config:
     * loading a preset is an explicit "show me this", and the scene may be
     * stale (settings changed since the last advance don't re-layout).
     * @param {unknown} raw
     */
    replace(raw) {
      return commit(normalizeConfig(raw, state, context), { replaced: true }, true);
    },

    /**
     * listener(next, prev, { replaced }) -> unsubscribe
     * @param {(next: SceneConfigState, prev: SceneConfigState, meta: ConfigMeta) => void} listener
     */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** A plain, mutable copy — what presets store. */
    toJSON() {
      return JSON.parse(JSON.stringify(state));
    }
  };
}
