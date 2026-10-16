// Regenerates tests/golden/layouts.json from the CURRENT generator:
//   npm run golden:update
// Do this only when the seed -> composition mapping is meant to change
// (and has been approved). The diff of layouts.json is the review.
import { writeFileSync } from 'node:fs';
import { SCENARIOS, roundEntry } from '../../tests/golden/scenarios.js';
import { layoutOf } from '../../tests/helpers/scene.js';

const out = {};
for (const sc of SCENARIOS) {
  out[sc.name] = {};
  for (const seed of sc.seeds) out[sc.name][seed] = layoutOf(sc.build(seed), sc.palette).map(roundEntry);
}
const file = new URL('../../tests/golden/layouts.json', import.meta.url);
writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
const n = Object.values(out).reduce((a, s) => a + Object.keys(s).length, 0);
console.log(`wrote ${n} reference layouts to tests/golden/layouts.json`);
