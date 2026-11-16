import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { LIBRARY } from '../src/presets/library.js';
import { palettes } from '../src/palette/palettes.js';
import { STRATEGY_NAMES } from '../src/generator/strategies/index.js';
import { SceneConfig, appConfigContext } from '../src/config/store.js';
import { createSceneConfig } from '../src/config/SceneConfig.js';
import { PresetStore } from '../src/presets/PresetStore.js';
import { makeConfig, layoutOf } from './helpers/scene.js';
import { ENTRIES } from '../tools/presets/library_entries.mjs';
import { SPECS } from '../tools/presets/specs.mjs';
import { fingerprints } from '../tools/presets/update_library_golden.mjs';

const golden = JSON.parse(fs.readFileSync(new URL('./golden/library.json', import.meta.url), 'utf8'));
const exported = JSON.parse(fs.readFileSync(new URL('../presets/proun-library.json', import.meta.url), 'utf8'));

describe('the Library', () => {
  it('has 10 to 12 presets with unique ids and names, an origin and a note each', () => {
    expect(LIBRARY.length).toBeGreaterThanOrEqual(10);
    expect(LIBRARY.length).toBeLessThanOrEqual(12);
    expect(new Set(LIBRARY.map((p) => p.id)).size).toBe(LIBRARY.length);
    expect(new Set(LIBRARY.map((p) => p.name)).size).toBe(LIBRARY.length);
    for (const p of LIBRARY) {
      expect(p.after.length, p.id).toBeGreaterThan(20);
      expect(p.note.length, p.id).toBeGreaterThan(20);
      expect(p.name.length, p.id).toBeLessThanOrEqual(60); // the preset name limit
    }
  });

  it('holds complete, valid configs: a real palette, strategy, orientation and an integer seed', () => {
    for (const p of LIBRARY) {
      const c = p.config;
      expect(palettes[c.palette], p.id).toBeDefined();
      expect(STRATEGY_NAMES, p.id).toContain(c.composition.strategy);
      expect(['landscape', 'portrait', 'square'], p.id).toContain(c.orientation);
      expect(Number.isInteger(c.seed), p.id).toBe(true);
      expect(Object.keys(c.shapes).sort(), p.id).toEqual(appConfigContext.shapeTypes.slice().sort());
      expect(c.time.autoAdvance, p.id).toBe(false);
    }
  });

  it('is in sync with the curated entries: rebuilding each from a fresh config gives the same record', () => {
    expect(LIBRARY.map((p) => p.id)).toEqual(ENTRIES.map((e) => e.id));
    for (const e of ENTRIES) {
      const fresh = createSceneConfig(appConfigContext); fresh.replace(e.patch);
      const p = LIBRARY.find((x) => x.id === e.id);
      expect(p.config, e.id).toEqual(fresh.toJSON());
      expect(p.name).toBe(e.name);
      expect(p.ref, e.id).toBe(e.ref);
    }
  });

  it('loads through SceneConfig.replace exactly as stored, whatever the app was set to before (a preset never inherits settings)', () => {
    SceneConfig.update({ palette: 'Proun — cool grey', orientation: 'square', shapes: { beam: { count: 6 } } });
    for (const p of LIBRARY) {
      SceneConfig.replace(p.config);
      expect(SceneConfig.get(), p.id).toEqual(p.config);
    }
  });

  it('gives the layouts it was judged by: the search path and the app path agree, and the layouts are pinned (golden)', () => {
    const fp = fingerprints();
    for (const e of ENTRIES) {
      const spec = SPECS.find((s) => s.id === e.specId);
      const viaSearch = layoutOf({ ...makeConfig(e.patch.seed, spec.counts, { perType: spec.perType || {} }), orientation: spec.orientation, composition: { strategy: spec.strategy } }, spec.palette);
      const viaApp = layoutOf(LIBRARY.find((p) => p.id === e.id).config, spec.palette);
      expect(viaApp.map((x) => [x.type, x.hex, x.position]), e.id).toEqual(viaSearch.map((x) => [x.type, x.hex, x.position]));
      expect(fp[e.id].length, e.id).toBeGreaterThanOrEqual(3);
      expect(fp[e.id].length, e.id).toBeLessThanOrEqual(16);
      expect(fp[e.id], `${e.id}: a published preset's layout changed (node tools/presets/update_library_golden.mjs if meant)`).toEqual(golden[e.id]);
    }
    expect(Object.keys(golden).sort()).toEqual(LIBRARY.map((p) => p.id).sort());
  });

  it('ships as presets/proun-library.json too, in the importable record format, equal to the Library', () => {
    expect(exported.length).toBe(LIBRARY.length);
    exported.forEach((rec, i) => {
      const p = LIBRARY[i];
      const { id, name, createdAt, ...config } = rec;
      expect(id).toBe(p.id); expect(name).toBe(p.name); expect(Number.isNaN(Date.parse(createdAt))).toBe(false);
      expect(config).toEqual(p.config);
    });
  });

  it('imports through the app\'s own importer, and "Save a copy" stores a loadable preset', () => {
    const before = PresetStore.list().length;
    const result = PresetStore.importJSON(JSON.stringify(exported));
    expect(result.error).toBeUndefined();
    expect(result.imported).toBe(exported.length);
    expect(result.skipped).toBe(0);
    const saved = PresetStore.save(LIBRARY[0].name, LIBRARY[0].config);
    expect(saved).toBeTruthy();
    expect(PresetStore.list().length).toBeGreaterThan(before);
    SceneConfig.replace(PresetStore.list().find((p) => p.name === LIBRARY[0].name));
    expect(SceneConfig.get().seed).toBe(LIBRARY[0].config.seed);
    expect(SceneConfig.get().palette).toBe(LIBRARY[0].config.palette);
  });
});
