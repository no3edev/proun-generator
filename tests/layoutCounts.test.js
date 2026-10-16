import { describe, it, expect } from 'vitest';
import { layoutCounts } from '../src/generator/layoutCounts.js';
import { each, makeConfig, layoutOf } from './helpers/scene.js';

describe('layoutCounts', () => {
  it('counts instances per type (highest index + 1)', () => {
    const c = layoutCounts([
      { type: 'a', index: 0 }, { type: 'a', index: 1 }, { type: 'b', index: 0 }
    ].map((e) => ({ ...e, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], hex: '#000000' })));
    expect(c.get('a')).toBe(2);
    expect(c.get('b')).toBe(1);
    expect(c.get('c')).toBeUndefined();
  });

  it('under the legacy generator it equals the configured counts (what Composition relied on)', () => {
    const counts = { 'cube-fixed': 3, circle: 2, rod: 4 };
    const c = layoutCounts(layoutOf(makeConfig(9, counts)));
    expect(Object.fromEntries(c)).toEqual(counts);
  });

  it('with a strategy it is whatever the strategy produced, and may differ from the config counts', () => {
    const cfg = { ...makeConfig(9, each(1)), composition: { strategy: 'axis-thrust' } };
    const layout = layoutOf(cfg);
    const c = layoutCounts(layout);
    expect([...c.values()].reduce((a, b) => a + b, 0)).toBe(layout.length);
    expect([...c.values()].some((n) => n > 1)).toBe(true); // e.g. several beams from one 'count: 1'
  });
});
