import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SCENARIOS, roundEntry } from './golden/scenarios.js';
import { layoutOf } from './helpers/scene.js';

// Fixed seeds x reference configurations -> the exact layout. This is what
// "existing seeds keep producing today's layouts" means in practice: any
// change to the generator, the shape randomScale()s, the collision solver or
// the rng that moves a shape fails here. If the change is intended, regenerate
// with `npm run golden:update` and review the diff.
const golden = JSON.parse(readFileSync(new URL('./golden/layouts.json', import.meta.url), 'utf8'));
const TOL = 2e-6; // file holds 6 decimals; allow for rounding at the last digit

describe('golden layouts (fixed seeds)', () => {
  for (const sc of SCENARIOS) {
    for (const seed of sc.seeds) {
      it(`${sc.name} / seed ${seed}`, () => {
        const actual = layoutOf(sc.build(seed), sc.palette).map(roundEntry);
        const expected = golden[sc.name][seed];
        expect(actual.map((e) => `${e.type}:${e.index}:${e.hex}:${e.role || ''}`)).toEqual(expected.map((e) => `${e.type}:${e.index}:${e.hex}:${e.role || ''}`));
        actual.forEach((e, i) => {
          for (const k of ['position', 'rotation', 'scale']) {
            e[k].forEach((v, j) => expect(Math.abs(v - expected[i][k][j])).toBeLessThanOrEqual(TOL));
          }
        });
      });
    }
  }
});
