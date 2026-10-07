// Generic storage/serialization for saved scene presets. Deliberately
// knows nothing about Palette, SceneManager, Composition, or the DOM —
// see SceneSnapshot.js for the bridge that captures/applies a preset
// against the live app, and ui/PresetsPanel.js for the UI. Keeping
// this module DOM- and three.js-free mirrors how Palette.js and
// ShapeSettings.js are already scoped in this codebase.

const STORAGE_KEY = 'proun-presets-v1';
const SCHEMA_VERSION = 1;
export const MAX_PRESETS = 20;

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Storage can throw (private browsing, quota, disabled entirely) —
// none of that should crash the app. On failure we fall back to an
// in-memory-only list for the rest of the session.
let memoryFallback = null;

function readRaw() {
  if (memoryFallback) return memoryFallback;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('[PresetStore] localStorage read failed, using in-memory list', err);
    memoryFallback = [];
    return memoryFallback;
  }
}

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

/** Newest first, capped at MAX_PRESETS, dropping anything malformed. */
function normalizedList() {
  return readRaw().filter((p) => p && typeof p === 'object' && p.shapes).slice(0, MAX_PRESETS);
}

function isValidEntry(entry) {
  return !!entry && typeof entry === 'object' && entry.shapes && typeof entry.shapes === 'object';
}

/** Fills in anything missing/malformed on an imported or hand-edited entry. */
function coerceEntry(entry) {
  return {
    id: typeof entry.id === 'string' ? entry.id : newId(),
    version: typeof entry.version === 'number' ? entry.version : SCHEMA_VERSION,
    name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : 'Untitled',
    createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
    palette: typeof entry.palette === 'string' ? entry.palette : null,
    orientation: typeof entry.orientation === 'string' ? entry.orientation : null,
    time: entry.time && typeof entry.time === 'object' ? entry.time : {},
    shapes: entry.shapes
  };
}

export const PresetStore = {
  /** @returns {object[]} newest-first */
  list() {
    return normalizedList();
  },

  get(id) {
    return normalizedList().find((p) => p.id === id) || null;
  },

  /**
   * Saves a new preset built from `snapshot` (see SceneSnapshot.js),
   * prepends it, and evicts the oldest entries past MAX_PRESETS.
   * @returns {object} the stored record
   */
  save(name, snapshot) {
    const record = coerceEntry({ ...snapshot, name, version: SCHEMA_VERSION, createdAt: new Date().toISOString() });
    const list = [record, ...normalizedList()].slice(0, MAX_PRESETS);
    writeRaw(list);
    return record;
  },

  delete(id) {
    writeRaw(normalizedList().filter((p) => p.id !== id));
  },

  /** JSON string for one preset, wrapped in an array for schema symmetry with exportAll(). */
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
   * @returns {{ imported: number, skipped: number }}
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
