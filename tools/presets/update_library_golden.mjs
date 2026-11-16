// Pins the layouts of the Library presets (tests/golden/library.json), like the golden layouts of the generator: a later change to the
// generator must not silently change a published preset. Re-run only when a preset is meant to change (or the generator is).
//   node tools/presets/update_library_golden.mjs
import fs from 'node:fs';
import { LIBRARY } from '../../src/presets/library.js';
import { layoutOf } from '../../tests/helpers/scene.js';
export function fingerprints() {
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const out = {};
  for (const p of LIBRARY) {
    out[p.id] = layoutOf(p.config, p.config.palette).map((e) => ({ type: e.type, role: e.role, hex: e.hex, position: e.position.map(r3), rotation: e.rotation.map(r3), scale: e.scale.map(r3) }));
  }
  return out;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  fs.writeFileSync(new URL('../../tests/golden/library.json', import.meta.url), JSON.stringify(fingerprints(), null, 1) + '\n');
  console.log('wrote tests/golden/library.json');
}
