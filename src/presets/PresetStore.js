// @ts-check
// Generic storage/serialization for saved scene presets. A preset is a
// stored SceneConfig (config/SceneConfig.js) plus an envelope (id, name,
// createdAt). Deliberately knows nothing about the live app or the DOM:
// ui/PresetsPanel.js saves SceneConfig.toJSON() here and loads with
// SceneConfig.replace(preset), which does the validation/migration. Keeping
// this module DOM- and three.js-free keeps it testable in plain node.

import { CONFIG_VERSION } from '../config/SceneConfig.js';

/**
 * A stored preset: the envelope plus the SceneConfig fields it was saved
 * with (loaded via SceneConfig.replace, which validates and migrates).
 * @typedef {Object} PresetRecord
 * @property {string} id
 * @property {number} version  config schema version it was saved with
 * @property {number | null} seed  null for legacy (v1) records
 * @property {string} name
 * @property {string} createdAt  ISO date
 * @property {string | null} palette
 * @property {string | null} orientation
 * @property {Record<string, unknown>} time
 * @property {Record<string, unknown>} composition  { strategy } (absent in v1/v2 records = legacy)
 * @property {Record<string, unknown>} shapes
 */

const STORAGE_KEY = 'proun-presets-v1'; // storage slot name; the schema version lives in each record
const SCHEMA_VERSION = CONFIG_VERSION;
export const MAX_PRESETS = 20;

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Storage can throw (private browsing, quota, disabled entirely) —
// none of that should crash the app. On failure we fall back to an
// in-memory-only list for the rest of the session.
/** @type {any[] | null} */
let memoryFallback = null;

/** @returns {any[]} */
function readRaw() {
  if (memoryFallback) return memoryFallback;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[PresetStore] localStorage read failed, using in-memory list', err);
    memoryFallback = [];
    return memoryFallback;
  }
}

/** @param {any[]} list */
function writeRaw(list) {
  if (memoryFallback) {
    memoryFallback = list;
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn('[PresetStore] localStorage write failed, switching to in-memory list', err);
    memoryFallback = list;
  }
}

/**
 * Newest first, capped at MAX_PRESETS, dropping anything malformed.
 * @returns {PresetRecord[]}
 */
function normalizedList() {
  return readRaw().filter((p) => p && typeof p === 'object' && p.shapes).slice(0, MAX_PRESETS);
}

/** @param {any} entry */
function isValidEntry(entry) {
  return !!entry && typeof entry === 'object' && !!entry.shapes && typeof entry.shapes === 'object';
}

/**
 * Fills in anything missing/malformed on an imported or hand-edited entry.
 * @param {any} entry
 * @returns {PresetRecord}
 */
function coerceEntry(entry) {
  return {
    id: typeof entry.id === 'string' ? entry.id : newId(),
    // legacy (v1) records have no seed; they keep their version and load
    // with a fresh one (see normalizeConfig)
    version: typeof entry.version === 'number' ? entry.version : SCHEMA_VERSION,
    seed: Number.isFinite(entry.seed) ? entry.seed : null,
    name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : 'Untitled',
    createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
    palette: typeof entry.palette === 'string' ? entry.palette : null,
    orientation: typeof entry.orientation === 'string' ? entry.orientation : null,
    time: entry.time && typeof entry.time === 'object' ? entry.time : {},
    composition: entry.composition && typeof entry.composition === 'object' ? entry.composition : {},
    shapes: entry.shapes
  };
}

export const PresetStore = {
  /** @returns {PresetRecord[]} newest-first */
  list() {
    return normalizedList();
  },

  /** @param {string} id */
  get(id) {
    return normalizedList().find((p) => p.id === id) || null;
  },

  /**
   * Saves a new preset built from `snapshot` (a SceneConfig, see config/SceneConfig.js),
   * prepends it, and evicts the oldest entries past MAX_PRESETS.
   * @param {string} name
   * @param {Record<string, any>} snapshot
   * @returns {PresetRecord} the stored record
   */
  save(name, snapshot) {
    const record = coerceEntry({ ...snapshot, name, version: SCHEMA_VERSION, createdAt: new Date().toISOString() });
    const list = [record, ...normalizedList()].slice(0, MAX_PRESETS);
    writeRaw(list);
    return record;
  },

  /** @param {string} id */
  delete(id) {
    writeRaw(normalizedList().filter((p) => p.id !== id));
  },

  /**
   * JSON string for one preset, wrapped in an array for schema symmetry with exportAll().
   * @param {string} id
   */
  exportOne(id) {
    const record = this.get(id);
    return JSON.stringify(record ? [record] : [], null, 2);
  },

  /** JSON string for every saved preset — a full backup. */
  exportAll() {
    return JSON.stringify(normalizedList(), null, 2);
  },

  /**
   * Imports presets from a JSON string — either a single preset
   * object or an array of them (i.e. anything exportOne()/exportAll()
   * produced). Invalid entries are skipped, not fatal. New ids are
   * assigned on import so importing the same file twice doesn't
   * collide with (or silently overwrite) what's already saved.
   * @param {string} jsonString
   * @returns {{ imported: number, skipped: number, error?: string }}
   */
  importJSON(jsonString) {
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (err) {
      return { imported: 0, skipped: 0, error: 'Not valid JSON.' };
    }
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    const valid = entries.filter(isValidEntry).map((e) => coerceEntry({ ...e, id: newId() }));
    const skipped = entries.length - valid.length;

    const list = [...valid, ...normalizedList()].slice(0, MAX_PRESETS);
    writeRaw(list);
    return { imported: valid.length, skipped };
  }
};
