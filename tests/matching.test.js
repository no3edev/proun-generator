import { describe, it, expect } from 'vitest';
import { matchInstances } from '../src/core/matching.js';
import { each, makeConfig, layoutOf } from './helpers/scene.js';

const ref = (type, role, x = 0, y = 0, z = 0) => ({ type, role, position: [x, y, z] });
const mapping = (r) => Object.fromEntries(r.pairs.map((p) => [p.old, p.next]));

describe('matchInstances', () => {
  it('pairs identical scenes one to one, with nothing leaving or arriving', () => {
    const s = [ref('beam', 'support', 0), ref('beam', 'connector', 5), ref('circle', 'anchor', 9)];
    const r = matchInstances(s, s);
    expect(mapping(r)).toEqual({ 0: 0, 1: 1, 2: 2 });
    expect(r.leaving).toEqual([]);
    expect(r.arriving).toEqual([]);
  });

  it('never pairs shapes of different types', () => {
    const r = matchInstances([ref('beam', 'support'), ref('circle', 'anchor')], [ref('plane', 'support'), ref('sphere', 'anchor')]);
    expect(r.pairs).toEqual([]);
    expect(r.leaving).toEqual([0, 1]);
    expect(r.arriving).toEqual([0, 1]);
  });

  it('prefers the same role over a nearer shape of another role', () => {
    // old support at 0; new: a connector right beside it (1) and a support far away (50)
    const r = matchInstances([ref('beam', 'support', 0)], [ref('beam', 'connector', 1), ref('beam', 'support', 50)]);
    expect(mapping(r)).toEqual({ 0: 1 }); // the support (new index 1), not the nearby connector
    expect(r.arriving).toEqual([0]);
  });

  it('within a role, pairs by nearness, whatever the order', () => {
    const olds = [ref('beam', 'support', 0), ref('beam', 'support', 100)];
    const news = [ref('beam', 'support', 98), ref('beam', 'support', 2)];
    expect(mapping(matchInstances(olds, news))).toEqual({ 0: 1, 1: 0 });
  });

  it('pairs what is left over by nearness when no role matches, so fewer shapes pop', () => {
    const r = matchInstances([ref('beam', 'support', 0)], [ref('beam', 'connector', 3)]);
    expect(mapping(r)).toEqual({ 0: 0 });
    expect(r.leaving).toEqual([]);
    expect(r.arriving).toEqual([]);
  });

  it('with more old shapes than new, the extra ones leave; with more new, the extra ones arrive', () => {
    const more = matchInstances([ref('beam', 'support', 0), ref('beam', 'support', 10), ref('beam', 'support', 20)], [ref('beam', 'support', 11)]);
    expect(mapping(more)).toEqual({ 1: 0 });
    expect(more.leaving).toEqual([0, 2]);
    expect(more.arriving).toEqual([]);
    const fewer = matchInstances([ref('beam', 'support', 11)], [ref('beam', 'support', 0), ref('beam', 'support', 10), ref('beam', 'support', 20)]);
    expect(mapping(fewer)).toEqual({ 0: 1 });
    expect(fewer.arriving).toEqual([0, 2]);
  });

  it('treats a legacy shape (no role) as matching nothing by role, and pairs it by type and nearness', () => {
    const r = matchInstances([ref('circle', undefined, 0)], [ref('circle', 'anchor', 4)]);
    expect(mapping(r)).toEqual({ 0: 0 });
  });

  it('handles empty scenes', () => {
    expect(matchInstances([], [])).toEqual({ pairs: [], leaving: [], arriving: [] });
    expect(matchInstances([], [ref('beam', 'support')]).arriving).toEqual([0]);
    expect(matchInstances([ref('beam', 'support')], []).leaving).toEqual([0]);
  });

  it('is deterministic, and breaks ties by index', () => {
    const olds = [ref('beam', 'support', 0), ref('beam', 'support', 0)];
    const news = [ref('beam', 'support', 1), ref('beam', 'support', 1)];
    expect(matchInstances(olds, news)).toEqual(matchInstances(olds, news));
    expect(mapping(matchInstances(olds, news))).toEqual({ 0: 0, 1: 1 });
  });

  it('accounts for every shape exactly once, on real layouts of every strategy', () => {
    const counts = each(1, { rod: 1, beam: 1, segment: 1, crescent: 1, frame: 1, ring: 1 });
    for (const strategy of ['axis-thrust', 'disc-beams', 'central-cluster']) {
      for (let seed = 1; seed <= 30; seed++) {
        const a = layoutOf({ ...makeConfig(seed, counts), composition: { strategy }, orientation: 'landscape' });
        const b = layoutOf({ ...makeConfig(seed + 100, counts), composition: { strategy }, orientation: 'landscape' });
        const r = matchInstances(a, b);
        expect(r.pairs.length + r.leaving.length).toBe(a.length);
        expect(r.pairs.length + r.arriving.length).toBe(b.length);
        const oldSeen = new Set([...r.pairs.map((p) => p.old), ...r.leaving]);
        const newSeen = new Set([...r.pairs.map((p) => p.next), ...r.arriving]);
        expect(oldSeen.size).toBe(a.length);
        expect(newSeen.size).toBe(b.length);
        r.pairs.forEach((p) => expect(a[p.old].type).toBe(b[p.next].type));
      }
    }
  });

  it('on real layouts, pairs same-role shapes far more often than the old slot-by-slot mapping did', () => {
    const counts = each(1, { rod: 1, beam: 1, segment: 1, crescent: 1, frame: 1, ring: 1 });
    for (const strategy of ['axis-thrust', 'disc-beams', 'central-cluster']) {
      let slotSame = 0, slotTotal = 0, matchSame = 0, matchTotal = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const a = layoutOf({ ...makeConfig(seed, counts), composition: { strategy }, orientation: 'landscape' });
        const b = layoutOf({ ...makeConfig(seed + 500, counts), composition: { strategy }, orientation: 'landscape' });
        const bySlot = new Map(a.map((e) => [`${e.type}:${e.index}`, e]));
        b.forEach((e) => { const o = bySlot.get(`${e.type}:${e.index}`); if (o) { slotTotal++; if (o.role === e.role) slotSame++; } });
        matchInstances(a, b).pairs.forEach((p) => { matchTotal++; if (a[p.old].role === b[p.next].role) matchSame++; });
      }
      expect(matchSame / matchTotal, strategy).toBeGreaterThan(slotSame / slotTotal);
      expect(matchSame / matchTotal, strategy).toBeGreaterThan(0.8);
    }
  });
});
