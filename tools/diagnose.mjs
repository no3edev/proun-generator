// Layout diagnostics: how the collision solver behaves over many seeds.
//   npm run diagnose            (or: node tools/diagnose.mjs 500   for 500 seeds)
//
// Reports, per scenario, over N seeds (box-shaped solids only for the overlap
// figures, since those have exact oriented-box volumes):
//   AABB overlap   pairs whose axis-aligned bounds still intersect after
//                  resolution (what the solver itself tests)
//   true overlap   pairs whose actual oriented boxes intersect (real 3D
//                  penetration; the AABB figure is the conservative one)
//   clipped        scenes in which a shape's centre lies outside the camera's
//                  clip planes (should be 0)
//   depth span     spread of shape centres along the view axis
//   shapes/scene   how many shapes the scene holds (a composition strategy decides this)
// Read-only: it changes nothing. Added in Stage 0b as the baseline Stage 3
// (spatial behaviour) will be measured against.
import * as THREE from 'three';
import { OBB } from 'three/examples/jsm/math/OBB.js';
import { computeAABB } from '../src/generator/CollisionResolver.js';
import { CAMERA } from '../src/config/defaults.js';
import { each, makeConfig, layoutOf, depthAxis, cameraPosition, shapeRegistry } from '../tests/helpers/scene.js';

const N = Number(process.argv[2]) || 300;
const BOXY = new Set(['cube-fixed', 'cube-variable', 'plane', 'beam']);
const box = (k) => ({ 'cube-fixed': k, 'cube-variable': k, plane: k });
const SCENARIOS = [
  ['boxes 1 each, default size', box(1), [1, 1]],
  ['boxes 3 each, default size', box(3), [1, 1]],
  ['boxes 4 each, default size', box(4), [1, 1]],
  ['12 cube-variable', { 'cube-variable': 12 }, [1, 1]],
  ['boxes 2 each, size 2-3', box(2), [2, 3]],
  ['boxes 4 each, size 2-3', box(4), [2, 3]],
  ['everything 3 each + rods', each(3, { rod: 3 }), [1, 1]],
  // composition strategies (the strategy decides the counts; `each(1)` just allows every type)
  ['[axis-thrust] defaults', each(1), [1, 1], 'axis-thrust'],
  ['[axis-thrust] + rods', each(1, { rod: 1 }), [1, 1], 'axis-thrust'],
  ['[axis-thrust] size 2-3', each(1), [2, 3], 'axis-thrust'],
  ['[axis-thrust] beams (no box/plank)', { ...each(1, { beam: 1 }), 'cube-variable': 0, plane: 0 }, [1, 1], 'axis-thrust'],
  ['[axis-thrust] flat forms + beams', each(1, { beam: 1, segment: 1, crescent: 1 }), [1, 1], 'axis-thrust'],
  ['[axis-thrust] everything enabled', each(1, { rod: 1, beam: 1, segment: 1, crescent: 1, frame: 1, ring: 1 }), [1, 1], 'axis-thrust'],
  ['[disc-beams] defaults', each(1), [1, 1], 'disc-beams'],
  ['[disc-beams] everything enabled', each(1, { rod: 1, beam: 1, segment: 1, crescent: 1, frame: 1, ring: 1 }), [1, 1], 'disc-beams'],
  ['[central-cluster] defaults', each(1), [1, 1], 'central-cluster'],
  ['[central-cluster] everything enabled', each(1, { rod: 1, beam: 1, segment: 1, crescent: 1, frame: 1, ring: 1 }), [1, 1], 'central-cluster'],
  ['legacy: 3 beams + cube + disc', { beam: 3, 'cube-fixed': 1, circle: 1 }, [1, 1]]
];
const dist = cameraPosition.length();
const clipNear = dist - CAMERA.near, clipFar = dist - CAMERA.far;
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : '-').padStart(6);

console.log(`${N} seeds per scenario; camera distance ${dist.toFixed(1)}, clip depth range ${clipFar.toFixed(1)}..${clipNear.toFixed(1)}\n`);
console.log('scenario'.padEnd(30), 'shapes/scene'.padStart(12), 'box pairs'.padStart(9), 'AABB'.padStart(7), 'true'.padStart(7), 'clipped'.padStart(8), 'mean depth span'.padStart(16));
for (const [name, counts, [sizeMin, sizeMax], strategy] of SCENARIOS) {
  let pairs = 0, aabb = 0, obb = 0, clipped = 0, spanSum = 0, shapeTotal = 0;
  for (let seed = 1; seed <= N; seed++) {
    const config = makeConfig(seed, counts, { shape: { sizeMin, sizeMax } });
    const layout = layoutOf(strategy ? { ...config, composition: { strategy }, orientation: 'landscape' } : config);
    shapeTotal += layout.length;
    const items = layout.filter((e) => BOXY.has(e.type)).map((e) => {
      const s = shapeRegistry.find((x) => x.type === e.type);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...e.rotation));
      const pos = new THREE.Vector3(...e.position), sc = new THREE.Vector3(...e.scale);
      return {
        aabb: computeAABB(s.localHalfExtents, pos, q, sc),
        obb: new OBB(pos, new THREE.Vector3(0.5 * sc.x, 0.5 * sc.y, 0.5 * sc.z), new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q)))
      };
    });
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      pairs++;
      if (items[i].aabb.intersectsBox(items[j].aabb)) aabb++;
      if (items[i].obb.intersectsOBB(items[j].obb)) obb++;
    }
    const depths = layout.map((e) => new THREE.Vector3(...e.position).dot(depthAxis));
    if (depths.some((d) => d >= clipNear || d <= clipFar)) clipped++;
    if (depths.length) spanSum += Math.max(...depths) - Math.min(...depths);
  }
  console.log(name.padEnd(30), (shapeTotal / N).toFixed(1).padStart(12), String(pairs).padStart(9), pct(aabb, pairs).padStart(7), pct(obb, pairs).padStart(7), pct(clipped, N).padStart(8), (spanSum / N).toFixed(1).padStart(16));
}

// ---------------------------------------------------------------------------------------------
// Layout diagnostics per composition strategy (Stage 3): what the depth solver does to what the
// strategy planned. Measured on the layouts themselves with the real volumes of the shapes
// (generator/diagnostics.js), pooled over N seeds.
//   3D hits      pairs of solids whose real volumes intersect (errors), per scene
//   ..anchor     of those, pairs involving the anchor
//   overlaps     pairs of shapes overlapping on screen (the look, not an error), per scene
//   order flips  of the overlapping pairs the plan ordered front/back, the share the solver reversed
//   shift        how far solids end up from their planned depth: mean / 95th percentile / max
import { diagnoseLayout } from '../src/generator/diagnostics.js';
import { view } from '../tests/helpers/scene.js';

const STRATEGY_MODES = [
  ['axis-thrust', 'defaults', each(1)],
  ['axis-thrust', 'all shapes', each(1, { rod: 1, beam: 1, segment: 1, crescent: 1, frame: 1, ring: 1 })],
  ['disc-beams', 'defaults', each(1)],
  ['disc-beams', 'all shapes', each(1, { rod: 1, beam: 1, segment: 1, crescent: 1, frame: 1, ring: 1 })],
  ['central-cluster', 'defaults', each(1)],
  ['central-cluster', 'all shapes', each(1, { rod: 1, beam: 1, segment: 1, crescent: 1, frame: 1, ring: 1 })]
];
const f1 = (x) => x.toFixed(1);
console.log('\nLayout diagnostics per strategy (real volumes), ' + N + ' seeds:\n');
console.log('mode'.padEnd(34), '3D hits'.padStart(8), '..anchor'.padStart(9), 'overlaps'.padStart(9), 'order flips'.padStart(12), ' shift mean / p95 / max'.padEnd(26), 'depth span');
for (const [name, label, counts] of STRATEGY_MODES) {
  let hits = 0, anchorHits = 0, overlaps = 0, pairs = 0, flips = 0, span = 0;
  const shifts = [];
  for (let seed = 1; seed <= N; seed++) {
    const layout = layoutOf({ ...makeConfig(seed, counts), composition: { strategy: name }, orientation: 'landscape' });
    const d = diagnoseLayout({ entries: layout, shapeDefs: shapeRegistry, view });
    hits += d.trueIntersections; anchorHits += d.anchorIntersections; overlaps += d.projectedOverlaps;
    pairs += d.orderPairs; flips += d.orderFlips; span += d.depthSpan; shifts.push(...d.shifts);
  }
  shifts.sort((a, b) => a - b);
  const q = (p) => shifts[Math.min(shifts.length - 1, Math.floor(p * shifts.length))] || 0;
  const mean = shifts.reduce((a, b) => a + b, 0) / Math.max(1, shifts.length);
  console.log((name + ' / ' + label).padEnd(34), (hits / N).toFixed(2).padStart(8), (anchorHits / N).toFixed(2).padStart(9), f1(overlaps / N).padStart(9),
    ((100 * flips / Math.max(1, pairs)).toFixed(0) + '%').padStart(12), ('  ' + mean.toFixed(2) + ' / ' + q(0.95).toFixed(2) + ' / ' + (shifts[shifts.length - 1] || 0).toFixed(2)).padEnd(26), f1(span / N).padStart(8));
}
