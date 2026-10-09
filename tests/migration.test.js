import { describe, it, expect } from 'vitest';
import { migrateConfig, MIGRATIONS, CONFIG_VERSION } from '../src/config/SceneConfig.js';

describe('migrateConfig', () => {
  it('stamps legacy v1 data as the current version', () => {
    const out = migrateConfig({ version: 1, palette: 'warm', shapes: {} });
    expect(out.version).toBe(CONFIG_VERSION);
    expect(out.palette).toBe('warm');
  });

  it('treats unversioned / invalid-version data as v1', () => {
    for (const v of [undefined, null, 'x', 0, -3, 1.5, NaN]) {
      expect(migrateConfig({ version: v, a: 1 }).version).toBe(CONFIG_VERSION);
    }
    expect(migrateConfig({ a: 1 }).version).toBe(CONFIG_VERSION);
  });

  it('leaves current-version data untouched (same object)', () => {
    const cur = { version: CONFIG_VERSION, seed: 5 };
    expect(migrateConfig(cur)).toBe(cur);
  });

  it('passes newer-than-known data through as-is (best effort, never rejected)', () => {
    const future = { version: CONFIG_VERSION + 5, seed: 5, extra: true };
    expect(migrateConfig(future)).toBe(future);
  });

  it('returns {} for non-objects instead of throwing', () => {
    for (const junk of [null, undefined, 5, 'x', true, [], [1, 2]]) {
      expect(migrateConfig(junk)).toEqual({});
    }
  });

  it('does not mutate its input', () => {
    const input = Object.freeze({ version: 1, a: 1 });
    expect(() => migrateConfig(input)).not.toThrow();
    expect(input.version).toBe(1);
  });

  describe('the mechanism (with an injected migration table)', () => {
    const table = {
      1: (r) => ({ ...r, step1: true }),
      2: (r) => { const { oldName, ...rest } = r; return { ...rest, newName: oldName }; },
      3: (r) => ({ ...r, step3: true })
    };

    it('runs every step from the data\'s version up to the target, in order', () => {
      const out = migrateConfig({ version: 1, oldName: 'x' }, table, 4);
      expect(out).toEqual({ version: 4, step1: true, newName: 'x', step3: true });
    });

    it('starts at the data\'s own version, not at 1', () => {
      const out = migrateConfig({ version: 3, oldName: 'x' }, table, 4);
      expect(out).toEqual({ version: 4, oldName: 'x', step3: true });
    });

    it('a version with no step just advances', () => {
      const out = migrateConfig({ version: 1 }, { 2: (r) => ({ ...r, hit: true }) }, 3);
      expect(out).toEqual({ version: 3, hit: true });
    });

    it('a step that throws stops migration there and never propagates', () => {
      const bad = { 1: (r) => ({ ...r, ok: true }), 2: () => { throw new Error('boom'); }, 3: (r) => ({ ...r, never: true }) };
      let out;
      expect(() => { out = migrateConfig({ version: 1 }, bad, 4); }).not.toThrow();
      expect(out.ok).toBe(true);
      expect(out.never).toBeUndefined();
      expect(out.version).toBe(2); // honest about how far it got
    });
  });

  it('the real table covers every version below the current one', () => {
    // guards the "bump CONFIG_VERSION => add a step" rule
    for (let v = 1; v < CONFIG_VERSION; v++) expect(typeof MIGRATIONS[v]).toBe('function');
  });
});
