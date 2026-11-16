import { describe, it, expect } from 'vitest';
import { STRATEGIES, STRATEGY_USES } from '../src/generator/strategies/index.js';
import { each, makeConfig, layoutOf, shapeRegistry } from './helpers/scene.js';

// The shapes menu shows only the types the active strategy places, so that a tab is never offered for a shape that will not appear
// (a sphere tab under a strategy that never makes a sphere). That only works if each strategy's `uses` is true in both directions:
// every type it lists really appears, and no type it leaves out ever does. Measured with every shape enabled.
const everything = each(1, { rod: 1, beam: 1, segment: 1, crescent: 1, frame: 1, ring: 1 });
const SEEDS = Array.from({ length: 150 }, (_, i) => i + 1);
const ALL = shapeRegistry.map((s) => s.type);

describe('strategy uses (what the shapes menu offers)', () => {
  it('legacy offers every shape', () => {
    expect(STRATEGY_USES.legacy).toBeNull();
  });

  for (const name of Object.keys(STRATEGIES)) {
    it(`${name}: lists exactly the types it places`, () => {
      const placed = new Set();
      for (const seed of SEEDS) {
        for (const orientation of ['landscape', 'portrait']) {
          layoutOf({ ...makeConfig(seed, everything), composition: { strategy: name }, orientation }).forEach((e) => placed.add(e.type));
        }
      }
      const declared = STRATEGY_USES[name] ? [...STRATEGY_USES[name]] : ALL;
      expect([...placed].sort()).toEqual([...declared].sort());
    });

    it(`${name}: lists only real shape types`, () => {
      const declared = STRATEGY_USES[name] ? [...STRATEGY_USES[name]] : ALL;
      declared.forEach((t) => expect(ALL).toContain(t));
    });
  }

  it('what a strategy does not list it never places, even when the user has the type switched on', () => {
    // the sphere has a count of 1 (its default) in every scene here: a strategy that leaves it out must still not use it
    for (const name of Object.keys(STRATEGIES)) {
      const declared = new Set(STRATEGY_USES[name] || ALL);
      ALL.filter((t) => !declared.has(t)).forEach((t) => {
        SEEDS.slice(0, 40).forEach((seed) => {
          expect(layoutOf({ ...makeConfig(seed, each(1, { [t]: 1, rod: 1, beam: 1 })), composition: { strategy: name } }).some((e) => e.type === t), `${name} placed ${t}`).toBe(false);
        });
      });
    }
  });
});
