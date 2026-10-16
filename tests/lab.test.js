import { describe, it, expect } from 'vitest';
import { DYNAMICS } from '../src/config/defaults.js';
import { LAB_SCHEMA, LAB_GROUP_TABS, labDefaults, normalizeLab, defaultsSnippet, createLab, LAB_STORAGE_KEY } from '../src/lab/labSettings.js';

const fakeStorage = (init = {}) => {
  const m = { ...init };
  return { m, getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; } };
};

describe('lab schema', () => {
  it('has unique keys and in-range defaults', () => {
    const keys = LAB_SCHEMA.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    LAB_SCHEMA.forEach((i) => {
      if (i.type !== 'toggle') expect(i.default).toBeGreaterThanOrEqual(i.min) && expect(i.default).toBeLessThanOrEqual(i.max);
    });
  });
  it('takes its defaults from DYNAMICS, and every path points into it', () => {
    const d = labDefaults();
    expect(d.colorSoft).toBe(DYNAMICS.color.soft);
    expect(d.groundVis).toBe(DYNAMICS.ground.visibility);
    LAB_SCHEMA.forEach((i) => {
      if (!i.path) return;
      const [sec, name] = i.path.split('.');
      expect(DYNAMICS[sec][name]).toBe(i.default);
    });
  });
});

describe('lab groups and tabs', () => {
  it('every group in the schema has a tab', () => {
    const groups = new Set(LAB_SCHEMA.map((i) => i.group));
    groups.forEach((g) => expect(['motion', 'surface']).toContain(LAB_GROUP_TABS[g]));
  });
});

describe('normalizeLab', () => {
  it('clamps, ignores junk and unknown keys, fills gaps', () => {
    const v = normalizeLab({ groundVis: 9, groundScale: -4, colorSoft: 'x', holdOn: 'yes', nope: 1 });
    expect(v.groundVis).toBe(0.08);
    expect(v.groundScale).toBe(0.4);
    expect(v.colorSoft).toBe(DYNAMICS.color.soft);
    expect(v.holdOn).toBe(false);
    expect('nope' in v).toBe(false);
  });
  it('survives non-objects', () => {
    expect(normalizeLab(null)).toEqual(labDefaults());
    expect(normalizeLab('x')).toEqual(labDefaults());
  });
});

describe('defaultsSnippet', () => {
  it('lists only changed, graduatable values', () => {
    expect(defaultsSnippet(labDefaults())).toContain('no changes');
    const s = defaultsSnippet({ ...labDefaults(), groundVis: 0.04, holdOn: true, hold: 1 });
    expect(s).toContain('ground: { visibility: 0.04 }');
    expect(s).not.toContain('hold');
    expect(s).not.toContain('color:');
  });
});

describe('createLab', () => {
  it('stores only what differs from the defaults, so moved defaults reach untouched controls', () => {
    const st = fakeStorage();
    const lab = createLab(st);
    lab.set('groundVis', 0.05);
    expect(JSON.parse(st.m[LAB_STORAGE_KEY]).values).toEqual({ groundVis: 0.05 });
  });
  it('persists values and notifies', () => {
    const st = fakeStorage();
    const lab = createLab(st);
    let seen = 0;
    lab.subscribe(() => seen++);
    lab.set('groundVis', 0.05);
    expect(seen).toBe(1);
    const again = createLab(st);
    expect(again.values().groundVis).toBe(0.05);
  });
  it('clamps on set and resets to defaults', () => {
    const lab = createLab(fakeStorage());
    lab.set('colorSoft', 50);
    expect(lab.values().colorSoft).toBe(1);
    lab.reset();
    expect(lab.values()).toEqual(labDefaults());
  });
  it('tolerates bad or missing storage', () => {
    expect(createLab(null).values()).toEqual(labDefaults());
    expect(createLab(fakeStorage({ [LAB_STORAGE_KEY]: '{not json' })).values()).toEqual(labDefaults());
    const throwing = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
    const lab = createLab(throwing);
    lab.set('groundVis', 0.03);
    expect(lab.values().groundVis).toBe(0.03);
  });
});
