// Tonal audit: how strong is the tonal contrast between the visible faces of box-shaped solids, per composition strategy
// and per tonal mode, over many seeds?   npm run tone   (or: node tools/tone.mjs 200)
// Read-only. Uses the layouts the generator produces and the face tones the app gives them (texture/tone.js), converted to
// DISPLAY values (what the screen shows), not to the multiplier ratio. Paint grain (about +-3%) is not included; the light face
// of a pale colour clamps at white, which is part of the look. Stage 4.0 measured the old fixed tables (median 1.02-1.12:1).
import * as THREE from 'three';
import { each, makeConfig, layoutOf, cameraPosition } from '../tests/helpers/scene.js';
import { BOX_SHADE_MULTIPLIERS } from '../src/texture/materials.js';
import { BEAM_SHADE_MULTIPLIERS } from '../src/shapes/beam.js';
import { TONE_MODES, toneModeFor, faceShades, hasBoxTone } from '../src/texture/tone.js';
import { screenBasis } from '../src/generator/strategies/common.js';

const N = Number(process.argv[2]) || 200;
const view = screenBasis(cameraPosition.clone().normalize());
const NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((a) => new THREE.Vector3(...a));
const OLD = { 'cube-fixed': BOX_SHADE_MULTIPLIERS, 'cube-variable': BOX_SHADE_MULTIPLIERS, plane: BOX_SHADE_MULTIPLIERS, rod: BOX_SHADE_MULTIPLIERS, beam: BEAM_SHADE_MULTIPLIERS };
const display = (hex, mult) => {            // Rec.601 luma of the displayed (sRGB) colour, 0..255
  const c = new THREE.Color(hex).multiplyScalar(mult);
  c.r = Math.min(1, c.r); c.g = Math.min(1, c.g); c.b = Math.min(1, c.b);
  const o = c.getHex();
  return 0.299 * ((o >> 16) & 255) + 0.587 * ((o >> 8) & 255) + 0.114 * (o & 255);
};
/** brightest : darkest displayed luma among the visible faces (faces under 10% of the visible area ignored); null if one face shows */
function ratioOf(e, table) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...e.rotation));
  const s = e.scale;
  const area = [s[1] * s[2], s[1] * s[2], s[0] * s[2], s[0] * s[2], s[0] * s[1], s[0] * s[1]];
  const out = [];
  for (let i = 0; i < 6; i++) {
    const d = NORMALS[i].clone().applyQuaternion(q).dot(view.depth);
    if (d > 0.02) out.push({ luma: display(e.hex, table[i]), a: d * area[i] });
  }
  const total = out.reduce((t, f) => t + f.a, 0);
  const f = out.filter((x) => x.a >= 0.1 * total).sort((x, y) => x.luma - y.luma);
  return f.length >= 2 ? f[f.length - 1].luma / Math.max(1, f[0].luma) : null;
}
const pct = (a, p) => a.length ? a.slice().sort((x, y) => x - y)[Math.floor(p * (a.length - 1))] : NaN;
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '  -').padStart(6);
const STRATEGIES = ['axis-thrust', 'disc-beams', 'central-cluster'];

console.log(`${N} seeds per strategy, landscape, every shape type allowed (count 1) + rods, palette 'Proun — classic'; box-bodied solids only`);
console.log('ratio = brightest : darkest displayed face. References: faceted 2.6-4.3, subtle 1.1-1.4\n');
console.log('strategy'.padEnd(16), 'mode'.padEnd(9), 'scenes'.padStart(7), 'cubes/planks: p10  median  p90'.padStart(34), '   rods/beams: median');
for (const strategy of STRATEGIES) {
  // 1. as drawn: the mode each seed gets
  const byMode = Object.fromEntries(TONE_MODES.map((m) => [m, { scenes: 0, cube: [], thin: [] }]));
  const old = { cube: [], thin: [] };
  for (let seed = 1; seed <= N; seed++) {
    const cfg = { ...makeConfig(seed, each(1, { rod: 1, beam: 1 })), composition: { strategy }, orientation: 'landscape' };
    const mode = toneModeFor(cfg.seed, strategy);
    byMode[mode].scenes++;
    for (const e of layoutOf(cfg)) {
      if (!hasBoxTone(e.type)) continue;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...e.rotation));
      const thin = e.type === 'rod' || e.type === 'beam';
      const r = ratioOf(e, faceShades(e.type, mode, q, view, e.hex));
      if (r !== null) byMode[mode][thin ? 'thin' : 'cube'].push(r);
      const r0 = ratioOf(e, OLD[e.type]);
      if (r0 !== null) old[thin ? 'thin' : 'cube'].push(r0);
    }
  }
  for (const m of TONE_MODES) {
    const b = byMode[m];
    console.log(strategy.padEnd(16), m.padEnd(9), String(b.scenes).padStart(7), (f2(pct(b.cube, 0.1)) + f2(pct(b.cube, 0.5)) + f2(pct(b.cube, 0.9))).padStart(34), '  ', f2(pct(b.thin, 0.5)));
  }
  console.log(strategy.padEnd(16), 'before'.padEnd(9), String(N).padStart(7), (f2(pct(old.cube, 0.1)) + f2(pct(old.cube, 0.5)) + f2(pct(old.cube, 0.9))).padStart(34), '  ', f2(pct(old.thin, 0.5)), '  (the fixed tables of v0.10)');
}
