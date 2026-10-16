// @ts-check
import { DYNAMICS } from '../config/defaults.js';

// The material lab's settings: a SESSION-LOCAL scratchpad for tuning the
// visual dynamics while they are being developed. Deliberately not part of
// the SceneConfig — nothing here travels with presets, share links, history
// or exports-by-link, and it needs no migrations. Values live in this
// browser's localStorage under their own key. When a value proves itself it
// graduates: copy it into DYNAMICS (config/defaults.js) — "Copy defaults" in
// the lab prints exactly that — or into the SceneConfig if it should become a
// real user setting.
//
// The schema below is the single source of truth: the panel is generated
// from it (ui/LabPanel.js), the store clamps against it, and the defaults
// come from DYNAMICS, so a new shader parameter is one entry here plus the
// place that reads it (lab/Lab.js).
//
// A schema item with a `path` can graduate into DYNAMICS at that path; one
// without is a session aid only (holding the clock, switching an effect off).

/**
 * @typedef {{ group: string, key: string, label: string, type?: 'range',
 *             min: number, max: number, step: number, unit?: string,
 *             default: number, path?: string }} RangeItem
 * @typedef {{ group: string, key: string, label: string, type: 'toggle',
 *             default: boolean, hint?: string }} ToggleItem
 * @typedef {RangeItem | ToggleItem} LabItem
 */

/** @type {LabItem[]} */
export const LAB_SCHEMA = [
  { group: 'Transition', key: 'holdOn', label: 'Pause and scrub', type: 'toggle', default: false, hint: 'Freezes the scene on the last change. 0 = before, 1 = after; past 1 only the ground keeps settling.' },
  { group: 'Transition', key: 'hold', label: 'Step', unit: '× dur', min: 0, max: 2, step: 0.01, default: 0.35 },

  { group: 'Color change', key: 'colorFront', label: 'Overpaint on', type: 'toggle', default: true },
  { group: 'Color change', key: 'colorDelay', label: 'Delay', unit: '× dur', min: 0, max: 0.6, step: 0.01, default: DYNAMICS.color.delay, path: 'color.delay' },
  { group: 'Color change', key: 'colorSoft', label: 'Edge width', min: 0.02, max: 1, step: 0.01, default: DYNAMICS.color.soft, path: 'color.soft' },
  { group: 'Color change', key: 'colorGrain', label: 'Grain erosion', min: 0, max: 1, step: 0.01, default: DYNAMICS.color.grain, path: 'color.grain' },
  { group: 'Color change', key: 'colorTone', label: 'Tonal shift', min: 0, max: 0.2, step: 0.005, default: DYNAMICS.color.tone, path: 'color.tone' },

  { group: 'Paint', key: 'paintOn', label: 'Procedural paint', type: 'toggle', default: true },
  { group: 'Paint', key: 'paintVis', label: 'Visibility', min: 0, max: 0.12, step: 0.002, default: DYNAMICS.paint.visibility, path: 'paint.visibility' },
  { group: 'Paint', key: 'strokeScale', label: 'Stroke width', min: 0.3, max: 3, step: 0.05, default: DYNAMICS.paint.strokeScale, path: 'paint.strokeScale' },
  { group: 'Paint', key: 'strokeLength', label: 'Stroke length', unit: '× wide', min: 1, max: 12, step: 0.5, default: DYNAMICS.paint.strokeLength, path: 'paint.strokeLength' },
  { group: 'Paint', key: 'followStrokes', label: 'Strokes follow size', min: 0, max: 1, step: 0.05, default: DYNAMICS.paint.followStrokes, path: 'paint.followStrokes' },
  { group: 'Paint', key: 'followStains', label: 'Stains follow size', min: 0, max: 1, step: 0.05, default: DYNAMICS.paint.followStains, path: 'paint.followStains' },

  { group: 'Ground', key: 'groundOn', label: 'Ground texture on', type: 'toggle', default: true },
  { group: 'Ground', key: 'groundVis', label: 'Visibility', min: 0, max: 0.08, step: 0.002, default: DYNAMICS.ground.visibility, path: 'ground.visibility' },
  { group: 'Ground', key: 'groundScale', label: 'Patch size', min: 0.4, max: 2.5, step: 0.05, default: DYNAMICS.ground.scale, path: 'ground.scale' },
  { group: 'Ground', key: 'groundCracks', label: 'Cracks', min: 0, max: 1, step: 0.02, default: DYNAMICS.ground.cracks, path: 'ground.cracks' },
  { group: 'Ground', key: 'groundCrackSize', label: 'Crack size', min: 0.3, max: 3, step: 0.05, default: DYNAMICS.ground.crackScale, path: 'ground.crackScale' },
  { group: 'Ground', key: 'groundCrackStretch', label: 'Crack elongation', min: 0.5, max: 5, step: 0.1, default: DYNAMICS.ground.crackStretch, path: 'ground.crackStretch' },
  { group: 'Ground', key: 'groundCrackVary', label: 'Cracks vary', min: 0, max: 1, step: 0.05, default: DYNAMICS.ground.crackVary, path: 'ground.crackVary' },

  { group: 'Ground motion', key: 'gmOn', label: 'Ground morph on', type: 'toggle', default: true },
  { group: 'Ground motion', key: 'gmDelay', label: 'Delay', unit: '× dur', min: 0, max: 1, step: 0.01, default: DYNAMICS.groundMotion.delay, path: 'groundMotion.delay' },
  { group: 'Ground motion', key: 'gmDuration', label: 'Morph time', unit: '× dur', min: 0.3, max: 5, step: 0.05, default: DYNAMICS.groundMotion.duration, path: 'groundMotion.duration' },
  { group: 'Ground motion', key: 'gmEvolve', label: 'Condense', min: 0, max: 1, step: 0.01, default: DYNAMICS.groundMotion.evolve, path: 'groundMotion.evolve' },
  { group: 'Ground motion', key: 'gmWarp', label: 'Deform', min: 0, max: 0.1, step: 0.002, default: DYNAMICS.groundMotion.warp, path: 'groundMotion.warp' },
  { group: 'Ground motion', key: 'gmLift', label: 'Contrast lift', min: 0, max: 2, step: 0.05, default: DYNAMICS.groundMotion.lift, path: 'groundMotion.lift' }
];

/**
 * Which panel tab each group lives on (ui/LabPanel.js mounts them there).
 * A group missing here falls back to the Surface tab.
 * @type {Record<string, 'motion' | 'surface'>}
 */
export const LAB_GROUP_TABS = {
  'Transition': 'motion',
  'Color change': 'motion',
  'Ground motion': 'motion',
  'Paint': 'surface',
  'Ground': 'surface'
};

/** @typedef {Record<string, number | boolean>} LabValues */

// v2 stores only the values that differ from the defaults, so moving a
// default in DYNAMICS reaches everyone who never touched that control
export const LAB_STORAGE_KEY = 'proun.lab.v2';

/** @returns {LabValues} */
export function labDefaults() {
  /** @type {LabValues} */
  const out = {};
  LAB_SCHEMA.forEach((it) => { out[it.key] = it.default; });
  return out;
}

/**
 * Any stored value -> a complete, in-range LabValues. Unknown keys are
 * dropped, missing or invalid ones fall back to the default.
 * @param {unknown} raw
 * @returns {LabValues}
 */
export function normalizeLab(raw) {
  const src = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
  const out = labDefaults();
  LAB_SCHEMA.forEach((it) => {
    const v = src[it.key];
    if (it.type === 'toggle') {
      if (typeof v === 'boolean') out[it.key] = v;
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      out[it.key] = Math.min(it.max, Math.max(it.min, v));
    }
  });
  return out;
}

/**
 * The changed values that can graduate, as a paste-ready DYNAMICS fragment.
 * @param {LabValues} values
 * @returns {string}
 */
export function defaultsSnippet(values) {
  /** @type {Record<string, Record<string, number>>} */
  const tree = {};
  LAB_SCHEMA.forEach((it) => {
    if (!('path' in it) || !it.path) return;
    const v = values[it.key];
    if (typeof v !== 'number' || v === it.default) return;
    const [section, name] = it.path.split('.');
    (tree[section] ||= {})[name] = Number(v.toFixed(4));
  });
  const sections = Object.keys(tree);
  if (!sections.length) return '// no changes from the current DYNAMICS defaults';
  const lines = ['// paste these values into DYNAMICS (src/config/defaults.js)'];
  sections.forEach((sec) => {
    lines.push(`${sec}: { ${Object.entries(tree[sec]).map(([k, v]) => `${k}: ${v}`).join(', ')} }`);
  });
  return lines.join('\n');
}

/**
 * @typedef {{ getItem(k: string): string | null, setItem(k: string, v: string): void }} StorageLike
 */

/**
 * The lab store: current values, persisted to
 * `storage` (which may be missing or throw — the lab then simply works for
 * the session).
 * @param {StorageLike | null | undefined} storage
 */
export function createLab(storage) {
  /** @type {LabValues} */
  let values = labDefaults();
  /** @type {Set<(v: LabValues) => void>} */
  const listeners = new Set();

  try {
    const stored = storage && storage.getItem(LAB_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      values = normalizeLab({ ...labDefaults(), ...(parsed && parsed.values) });
    }
  } catch (err) {
    // unreadable storage or bad JSON: start from the defaults
  }

  function save() {
    try {
      if (!storage) return;
      const defaults = labDefaults();
      /** @type {LabValues} */
      const changed = {};
      Object.keys(values).forEach((k) => { if (values[k] !== defaults[k]) changed[k] = values[k]; });
      storage.setItem(LAB_STORAGE_KEY, JSON.stringify({ values: changed }));
    } catch (err) {
      // quota / privacy mode: not fatal
    }
  }
  function emit() { listeners.forEach((fn) => fn(values)); }

  return {
    values: () => values,
    /** @param {string} key @param {number | boolean} value */
    set(key, value) {
      values = normalizeLab({ ...values, [key]: value });
      save();
      emit();
    },
    reset() {
      values = labDefaults();
      save();
      emit();
    },
    /** @param {(v: LabValues) => void} fn */
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
}
