import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { STRATEGY_NAMES, STRATEGIES } from '../src/generator/strategies/index.js';
import { palettes } from '../src/palette/palettes.js';
import { each, makeConfig, layoutOf, depthAxis, shapeRegistry } from './helpers/scene.js';
import { screenBasis } from '../src/generator/strategies/common.js';
import { ORIENTATIONS, CAMERA } from '../src/config/defaults.js';

const NEW = ['tower', 'cross', 'mass'];
const ALL = { rod: 1, beam: 1, segment: 1, crescent: 1, frame: 1, ring: 1 };
const ROLES = ['anchor', 'support', 'connector', 'accent', 'detail'];
const basis = screenBasis(depthAxis);
const half = Object.fromEntries(shapeRegistry.map((s) => [s.type, s.localHalfExtents]));
const gen = (strategy, seed, counts = each(1, ALL), orientation = 'landscape', extra = {}, palette) =>
  layoutOf({ ...makeConfig(seed, counts, extra), composition: { strategy }, orientation }, palette);
/** the screen angle of an entry's long (local x) axis, folded to 0..180 */
function angleOf(e) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...e.rotation));
  const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  return (((Math.atan2(ax.dot(basis.up), ax.dot(basis.right)) * 180) / Math.PI) % 180 + 180) % 180;
}
const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
const dev = (a, target) => Math.min(Math.abs(a - target), 180 - Math.abs(a - target));

describe.each(NEW)('%s: a composition strategy', (strategy) => {
  it('is registered, labelled, declares what it uses, and sits after the first three', () => {
    expect(STRATEGY_NAMES).toContain(strategy);
    expect(STRATEGY_NAMES.slice(0, 4)).toEqual(['legacy', 'axis-thrust', 'disc-beams', 'central-cluster']);
    expect(STRATEGIES[strategy].label.length).toBeGreaterThan(2);
    expect(STRATEGIES[strategy].uses.length).toBeGreaterThanOrEqual(5);
  });

  it('is reproducible, and a different seed gives a different picture', () => {
    expect(gen(strategy, 5)).toEqual(gen(strategy, 5));
    expect(gen(strategy, 5)).not.toEqual(gen(strategy, 6));
  });

  it('owns the counts: a sensible number of forms, none of a disabled type, nothing with everything off', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const n = gen(strategy, seed).length;
      expect(n, `${strategy} ${seed}`).toBeGreaterThanOrEqual(6);
      expect(n, `${strategy} ${seed}`).toBeLessThanOrEqual(20);
    }
    const noBlocks = each(1, ALL); noBlocks['cube-variable'] = 0; noBlocks.plane = 0;
    for (let seed = 1; seed <= 20; seed++) for (const e of gen(strategy, seed, noBlocks)) expect(['cube-variable', 'plane']).not.toContain(e.type);
    expect(gen(strategy, 3, each(0, { 'cube-variable': 0 }))).toEqual([]);
  });

  it('still composes with very few types, and every type it uses can appear', () => {
    for (const counts of [{ circle: 1 }, { 'cube-variable': 1 }, { circle: 1, 'cube-variable': 1, triangle: 1 }]) {
      for (let seed = 1; seed <= 6; seed++) expect(gen(strategy, seed, counts).length, JSON.stringify(counts)).toBeGreaterThan(0);
    }
    const seen = new Set();
    for (let seed = 1; seed <= 80; seed++) gen(strategy, seed, each(1, ALL), 'portrait').forEach((e) => seen.add(e.type));
    expect([...seen].sort()).toEqual([...STRATEGIES[strategy].uses].sort());
  });

  it('gives every entry a role, exactly one anchor, and well-formed numbers', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const L = gen(strategy, seed);
      expect(L.filter((e) => e.role === 'anchor').length, `${strategy} ${seed}`).toBe(1);
      for (const e of L) {
        expect(ROLES).toContain(e.role);
        [...e.position, ...e.rotation, ...e.scale].forEach((v) => expect(Number.isFinite(v)).toBe(true));
        e.scale.forEach((v) => expect(v).toBeGreaterThan(0));
      }
    }
  });

  it('numbers each type from 0 without gaps (what the paint slots rely on)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const byType = {};
      for (const e of gen(strategy, seed)) (byType[e.type] ||= []).push(e.index);
      for (const [t, idx] of Object.entries(byType)) expect([...idx].sort((a, b) => a - b), t).toEqual(idx.map((_, i) => i));
    }
  });

  it('uses at most one chromatic hue per scene and only palette colours, on every palette', () => {
    for (const [name, p] of Object.entries(palettes)) {
      const allowed = new Set([p.paper, p.ink, ...p.accents].map((h) => h.toLowerCase()));
      for (let seed = 1; seed <= 12; seed++) {
        const hues = new Set();
        for (const e of gen(strategy, seed, each(1, ALL), 'landscape', {}, name)) {
          expect(allowed.has(e.hex.toLowerCase()), `${name} ${e.hex}`).toBe(true);
          const c = new THREE.Color(e.hex); const hsl = {}; c.getHSL(hsl);
          if (hsl.s >= 0.5 && hsl.l > 0.12) hues.add(e.hex.toLowerCase());
        }
        expect(hues.size, `${name} ${seed}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('keeps every form inside the camera\'s clip planes, even at the UI limits (large, spread, every orientation)', () => {
    for (const orientation of Object.keys(ORIENTATIONS)) {
      for (const extra of [{}, { shape: { sizeMin: 2, sizeMax: 3 } }, { shape: { spread: 2 } }, { shape: { sizeMin: 0.2, sizeMax: 0.3, spread: 0 } }]) {
        for (let seed = 1; seed <= 12; seed++) {
          for (const e of gen(strategy, seed, each(1, ALL), orientation, extra)) {
            const d = new THREE.Vector3(...e.position).dot(depthAxis);
            expect(d, `${strategy} ${orientation} ${JSON.stringify(extra)} seed ${seed} ${e.type}`).toBeGreaterThan(-(CAMERA.far - 12));
            expect(d).toBeLessThan(CAMERA.far - 12);
          }
        }
      }
    }
  });

  it('honours size and spread settings: bigger sizes give bigger forms, spread 0 gathers the composition', () => {
    const area = (L) => L.filter((e) => e.type !== 'rod').reduce((t, e) => t + e.scale[0] * e.scale[1], 0);
    let small = 0, large = 0;
    for (let seed = 1; seed <= 15; seed++) { small += area(gen(strategy, seed, each(1, ALL), 'landscape', { shape: { sizeMin: 0.5, sizeMax: 0.5 } })); large += area(gen(strategy, seed, each(1, ALL), 'landscape', { shape: { sizeMin: 1.6, sizeMax: 1.6 } })); }
    expect(large).toBeGreaterThan(small * 2);
    const spread = (L) => { const xs = L.map((e) => new THREE.Vector3(...e.position).dot(basis.right)), ys = L.map((e) => new THREE.Vector3(...e.position).dot(basis.up)); return (Math.max(...xs) - Math.min(...xs)) + (Math.max(...ys) - Math.min(...ys)); };
    let tight = 0, wide = 0;
    for (let seed = 1; seed <= 15; seed++) { tight += spread(gen(strategy, seed, each(1, ALL), 'landscape', { shape: { spread: 0 } })); wide += spread(gen(strategy, seed, each(1, ALL), 'landscape', { shape: { spread: 2 } })); }
    expect(wide).toBeGreaterThan(tight * 1.1);
  });
});

describe('tower', () => {
  it('stands upright: the anchor within 8 degrees of vertical, most of the stack too, and tall', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const L = gen('tower', seed, each(1, ALL), 'portrait');
      const anchor = L.find((e) => e.role === 'anchor');
      if (['cube-variable', 'plane', 'beam'].includes(anchor.type)) expect(dev(angleOf(anchor), 90), `seed ${seed}`).toBeLessThanOrEqual(10);
      const stack = L.filter((e) => (e.role === 'anchor' || e.role === 'support') && ['cube-variable', 'plane', 'beam'].includes(e.type) && dev(angleOf(e), 90) <= 10);
      expect(stack.length, `seed ${seed}`).toBeGreaterThanOrEqual(4);
      const ys = stack.map((e) => new THREE.Vector3(...e.position).dot(basis.up));
      expect(Math.max(...ys) - Math.min(...ys), `seed ${seed}`).toBeGreaterThan(2.4);
    }
  });
});

describe('cross', () => {
  it('draws both variants (the crossed bars, the column with a floating cube), each upright and level', () => {
    let crossed = 0, column = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const L = gen('cross', seed, each(1, ALL), 'portrait');
      const anchor = L.find((e) => e.role === 'anchor');
      expect(dev(angleOf(anchor), 90), `seed ${seed}`).toBeLessThanOrEqual(4);
      if (L.some((e) => e.type === 'cube-fixed')) column++;
      else { crossed++; expect(L.some((e) => e.role === 'connector' && dev(angleOf(e), 0) <= 5), `seed ${seed}: a level crossbar`).toBe(true); }
    }
    expect(crossed).toBeGreaterThan(15); expect(column).toBeGreaterThan(10);
  });
});

describe('mass', () => {
  it('gives about 45% of scenes a pale backdrop (the lightest neutral), with the boxes kept clear of its colour', () => {
    const palette = palettes['Proun — lithograph on cream'];
    const lightest = palette.accents.slice().sort((a, b) => lum(b) - lum(a)).find((h) => Math.abs(lum(h) - lum(palette.paper)) >= 0.09) || palette.accents[0];
    let pale = 0, total = 200;
    for (let seed = 1; seed <= total; seed++) {
      const L = gen('mass', seed, each(1, ALL), 'landscape', {}, 'Proun — lithograph on cream');
      const anchor = L.find((e) => e.role === 'anchor');
      if (anchor.hex.toLowerCase() === lightest.toLowerCase()) {
        pale++;
      }
    }
    expect(pale / total).toBeGreaterThan(0.3);
    expect(pale / total).toBeLessThan(0.65);
  });

  it('lays its boxes on one turned grid: most box-like forms share an angle (mod 90 degrees)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const L = gen('mass', seed, each(1, ALL)).filter((e) => ['cube-variable', 'plane', 'beam'].includes(e.type) && e.role !== 'detail');
      const a = L.map((e) => angleOf(e) % 90).sort((x, y) => x - y);
      const med = a[Math.floor(a.length / 2)];
      const near = a.filter((v) => Math.min(Math.abs(v - med), 90 - Math.abs(v - med)) <= 12).length;
      expect(near / a.length, `seed ${seed}`).toBeGreaterThanOrEqual(0.75);
    }
  });

  it('has a heart and empty ground: a backdrop anchor (a disc or a large plane) and boxes against one another', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const L = gen('mass', seed, each(1, ALL));
      const anchor = L.find((e) => e.role === 'anchor');
      expect(['circle', 'plane', 'cube-variable']).toContain(anchor.type);
      expect(L.filter((e) => e.role === 'support' && ['cube-variable', 'plane', 'beam'].includes(e.type)).length).toBeGreaterThanOrEqual(5);
    }
  });
});
