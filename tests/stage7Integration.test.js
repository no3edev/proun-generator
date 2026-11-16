import { describe, it, expect, beforeEach } from 'vitest';
import { createSceneConfig, CONFIG_VERSION } from '../src/config/SceneConfig.js';
import { appConfigContext } from '../src/config/store.js';
import { restoreConfig } from '../src/config/boot.js';
import { loadSession, saveSession, startSessionAutosave } from '../src/config/session.js';
import { buildShareUrl } from '../src/config/share.js';
import { PresetStore } from '../src/presets/PresetStore.js';
import { applyPreset } from '../src/presets/applyPreset.js';
import { LIBRARY } from '../src/presets/library.js';
import { TIMING_PRESETS } from '../src/config/defaults.js';
import { STRATEGY_NAMES } from '../src/generator/strategies/index.js';

// Stage 7.6, the acceptance criterion "presets and configuration restoration remain reliable": the whole of what an exhibition display
// stores and restores, together: the session (with the new timing fields), corrupt or blocked storage, sessions and presets saved by
// older versions, share links over a running display, the Library and the viewer's own presets.

class MemoryStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
const fresh = () => createSceneConfig(appConfigContext);
const EXHIBITION = { durationMs: TIMING_PRESETS.exhibition.durationMs, holdMs: TIMING_PRESETS.exhibition.holdMs, autoAdvance: true, playlist: true };

function exhibitionDisplay(strategy = 'mass') {
  const c = fresh();
  c.update({ seed: 90210, palette: LIBRARY[1].config.palette, orientation: 'landscape', composition: { strategy }, time: EXHIBITION });
  return c;
}

describe('the session of an exhibition display', () => {
  it('round-trips everything (strategy, palette, shapes, Exhibition timing, Auto, the curated switch) through storage', () => {
    for (const strategy of STRATEGY_NAMES) {
      const storage = new MemoryStorage();
      const a = exhibitionDisplay(strategy);
      saveSession(storage, a.toJSON());
      const b = fresh();
      expect(restoreConfig(b, { storage, hash: '' })).toEqual({ source: 'session', hadLink: false });
      expect(b.toJSON(), strategy).toEqual(a.toJSON());
      expect(b.get().time).toEqual(EXHIBITION);
    }
  });

  it('the autosave writes what the config is, and flush() writes at once (what the watchdog relies on before it reloads)', () => {
    const storage = new MemoryStorage();
    const c = exhibitionDisplay();
    const timers = { setTimeout: () => 1, clearTimeout: () => {} };            // the delayed write never fires on its own here
    const auto = startSessionAutosave(c, { storage, timers });
    c.update({ seed: 31337 });
    expect(loadSession(storage)).toBeNull();                                    // not written yet (debounced)
    auto.flush();
    const d = fresh(); restoreConfig(d, { storage, hash: '' });
    expect(d.get().seed).toBe(31337);
    expect(d.get().time).toEqual(EXHIBITION);
  });

  it('survives storage that is corrupt, blocked, full or from the future: the display starts on defaults, never throws', () => {
    const bad = [
      { getItem: () => '{not json', setItem() {} },
      { getItem: () => '[1,2,3]', setItem() {} },
      { getItem: () => 'null', setItem() {} },
      { getItem: () => JSON.stringify({ version: 99, seed: 'x', time: 5, shapes: 7 }), setItem() {} },
      { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } },
      null, undefined
    ];
    for (const storage of bad) {
      const c = fresh();
      expect(() => restoreConfig(c, { storage, hash: '' })).not.toThrow();
      const j = c.toJSON();
      expect(j.version).toBe(CONFIG_VERSION);
      expect(Number.isFinite(j.seed)).toBe(true);
      expect(Number.isFinite(j.time.durationMs) && Number.isFinite(j.time.holdMs)).toBe(true);
    }
    const full = { getItem: () => null, setItem() { throw new Error('QuotaExceededError'); } };
    expect(() => saveSession(full, exhibitionDisplay().toJSON())).not.toThrow();
  });

  it('a session saved by an older version restores its composition and keeps its cadence (v1, v2, v3 with an interval)', () => {
    const base = exhibitionDisplay().toJSON();
    const old = [
      { palette: base.palette, orientation: 'portrait', seed: 555 },                                                     // v1: no version, no time, no strategy
      { version: 2, palette: base.palette, orientation: 'square', seed: 556, shapes: base.shapes },                      // v2
      { ...base, version: 3, seed: 557, time: { durationMs: 1100, intervalMs: 4000, autoAdvance: true } }               // v3: the period, not the hold
    ];
    old.forEach((raw, i) => {
      const storage = new MemoryStorage();
      saveSession(storage, raw);
      const c = fresh();
      expect(restoreConfig(c, { storage, hash: '' }).source, `v${i + 1}`).toBe('session');
      expect(c.get().seed).toBe(raw.seed);
      expect(c.get().version).toBe(CONFIG_VERSION);
      expect(c.get().time.holdMs).toBeGreaterThanOrEqual(0);
    });
    const c = fresh(); const storage = new MemoryStorage(); saveSession(storage, old[2]); restoreConfig(c, { storage, hash: '' });
    expect(c.get().time.durationMs + c.get().time.holdMs).toBe(4000);          // the cadence the viewer had
    expect(c.get().time.autoAdvance).toBe(true);
    expect(c.get().time.playlist).toBe(false);                                  // it did not exist yet: off
  });
});

describe('a share link and presets over a running display', () => {
  beforeEach(() => { globalThis.localStorage = new MemoryStorage(); });

  it('a share link gives the composition and leaves the display\'s timing, Auto and curated switch alone', () => {
    const storage = new MemoryStorage();
    saveSession(storage, exhibitionDisplay().toJSON());
    const sender = fresh(); sender.update({ seed: 8080, palette: LIBRARY[3].config.palette, composition: { strategy: 'tower' }, time: { durationMs: 700, holdMs: 0, autoAdvance: false, playlist: false } });
    const hash = new URL(buildShareUrl(sender.get(), 'http://x/')).hash;
    const c = fresh();
    expect(restoreConfig(c, { storage, hash })).toEqual({ source: 'link', hadLink: true });
    expect(c.get().seed).toBe(8080);
    expect(c.get().composition.strategy).toBe('tower');
    expect(c.get().time).toEqual(EXHIBITION);
  });

  it('every Library preset, loaded on an exhibition display, survives a save and restore of the session as the same composition', () => {
    for (const entry of LIBRARY) {
      const display = exhibitionDisplay();
      applyPreset(display, entry.config);
      const storage = new MemoryStorage();
      saveSession(storage, display.toJSON());
      const back = fresh(); restoreConfig(back, { storage, hash: '' });
      expect(back.toJSON(), entry.name).toEqual(display.toJSON());
      expect(back.get().seed).toBe(entry.config.seed);
      expect(back.get().time, entry.name).toEqual(EXHIBITION);
    }
  });

  it('the viewer\'s own preset (saved on a display with its own timing) loads as a composition anywhere and changes no timing', () => {
    const maker = exhibitionDisplay('axis-thrust');
    const rec = PresetStore.save('my wall', maker.toJSON());
    const viewer = fresh();
    viewer.update({ time: { durationMs: 2000, holdMs: 500, autoAdvance: false, playlist: false } });
    applyPreset(viewer, PresetStore.get(rec.id));
    expect(viewer.get().seed).toBe(90210);
    expect(viewer.get().composition.strategy).toBe('axis-thrust');
    expect(viewer.get().time).toEqual({ durationMs: 2000, holdMs: 500, autoAdvance: false, playlist: false });
    // and it survives the store's own export and import
    const exported = PresetStore.exportAll();
    globalThis.localStorage = new MemoryStorage();
    expect(PresetStore.importJSON(exported)).toMatchObject({ imported: 1 });
    expect(PresetStore.list().some((p) => p.name === 'my wall')).toBe(true);
  });
});
