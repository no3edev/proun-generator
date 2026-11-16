// Seed search for the Library presets: for each spec (specs.mjs) generate the layout of many seeds, rasterize the forms into the same coarse ink
// grid describe_refs.py measures the references with, score the difference, and keep the best seeds.
//   node tools/presets/search.mjs [seeds=1500] [id,id,...]   ->  /tmp/presets_search.json (+ the top few on screen)
import * as THREE from 'three';
import fs from 'node:fs';
import { makeConfig, layoutOf, depthAxis, shapeRegistry, palettes } from '../../tests/helpers/scene.js';
import { screenBasis } from '../../src/generator/strategies/common.js';
import { ORIENTATIONS } from '../../src/config/defaults.js';
import { SPECS } from './specs.mjs';

const N = Number(process.argv[2]) || 1500;
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const targets = JSON.parse(fs.readFileSync(new URL('./targets.json', import.meta.url)));
const basis = screenBasis(depthAxis);
const half = Object.fromEntries(shapeRegistry.map((s) => [s.type, s.localHalfExtents]));
const luma = (hex) => { const c = new THREE.Color(hex); return 0.299 * c.r ** (1 / 2.2) + 0.587 * c.g ** (1 / 2.2) + 0.114 * c.b ** (1 / 2.2); };
const BOXES = new Set(['cube-fixed', 'cube-variable', 'plane', 'beam']);
const SKIP = new Set(['frame', 'ring']);
const GW = 64;

function hull(pts) {
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = []; for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  const up = []; for (const p of pts.slice().reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function silhouette(e) {
  const h = half[e.type], s = e.scale, eul = new THREE.Euler(...e.rotation), pos = new THREE.Vector3(...e.position);
  const to2 = (v) => { v.applyEuler(eul).add(pos); return [v.dot(basis.right), v.dot(basis.up)]; };
  if (e.type === 'circle' || e.type === 'sphere') {
    const pts = []; for (let i = 0; i < 24; i++) { const t = (i / 24) * Math.PI * 2; pts.push(to2(new THREE.Vector3(Math.cos(t) * h.x * s[0], Math.sin(t) * h.y * s[1], 0))); }
    return hull(pts);
  }
  const pts = []; for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) pts.push(to2(new THREE.Vector3(sx * h.x * s[0], sy * h.y * s[1], sz * h.z * s[2])));
  return hull(pts);
}
function describe(layout, paperHex, orient) {
  const { w, h } = ORIENTATIONS[orient], halfH = 3, halfW = halfH * w / h, gh = Math.max(8, Math.round(GW * h / w));
  const paperL = luma(paperHex), ink = new Float32Array(GW * gh);
  for (const e of layout) {
    if (SKIP.has(e.type)) continue;
    const poly = silhouette(e); if (poly.length < 3) continue;
    let d = (paperL - luma(e.hex)) / Math.max(paperL, 0.2);
    if (BOXES.has(e.type)) d = Math.max(d, 0.3); else if (e.type === 'triangle' || e.type === 'crescent') d = d * 0.9;
    if (d <= 0.18) continue;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const p of poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    const c0 = Math.max(0, Math.floor(((x0 / halfW + 1) / 2) * GW)), c1 = Math.min(GW - 1, Math.ceil(((x1 / halfW + 1) / 2) * GW));
    const r0 = Math.max(0, Math.floor(((1 - y1 / halfH) / 2) * gh)), r1 = Math.min(gh - 1, Math.ceil(((1 - y0 / halfH) / 2) * gh));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const px = ((c + 0.5) / GW * 2 - 1) * halfW, py = (1 - (r + 0.5) / gh * 2) * halfH;
      let inside = true; for (let i = 0; i < poly.length && inside; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; if ((b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]) < 0) inside = false; }
      if (inside) ink[r * GW + c] = Math.max(ink[r * GW + c], d);
    }
  }
  let n = 0, sx = 0, sy = 0; const m = new Uint8Array(GW * gh);
  for (let r = 0; r < gh; r++) for (let c = 0; c < GW; c++) if (ink[r * GW + c] > 0.18) { m[r * GW + c] = 1; n++; sx += (c + 0.5) / GW; sy += (r + 0.5) / gh; }
  const cov = n / (GW * gh); if (!n) return { coverage: 0, centroid: [0.5, 0.5], spread: [0, 0], angle: 0, aniso: 0, grid: new Array(9).fill(0), darkCoverage: 0, components: 0 };
  const cx = sx / n, cy = sy / n; let vx = 0, vy = 0, vxy = 0, dark = 0; const grid = new Array(9).fill(0), asp = w / h;
  for (let r = 0; r < gh; r++) for (let c = 0; c < GW; c++) if (m[r * GW + c]) {
    const xn = (c + 0.5) / GW, yn = (r + 0.5) / gh; vx += (xn - cx) ** 2; vy += (yn - cy) ** 2; vxy += (xn - cx) * (yn - cy);
    grid[Math.min(2, Math.floor(yn * 3)) * 3 + Math.min(2, Math.floor(xn * 3))] += 1 / n; if (ink[r * GW + c] > 0.55) dark++;
  }
  const SX = Math.sqrt(vx / n), SY = Math.sqrt(vy / n), a = (SX * asp) ** 2, b = SY ** 2, c = -vxy / n * asp;
  const tr = a + b, det = a * b - c * c, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det)), l1 = tr / 2 + disc, l2 = tr / 2 - disc;
  const ang = ((Math.atan2(l1 - a, c) * 180 / Math.PI) % 180 + 180) % 180;
  return { coverage: cov, centroid: [cx, cy], spread: [SX, SY], angle: Math.abs(c) < 1e-12 ? (a >= b ? 0 : 90) : ang, aniso: l1 > 1e-9 ? 1 - l2 / l1 : 0, grid, darkCoverage: dark / (GW * gh), components: countComponents(m, GW, gh) };
}
function countComponents(m, w, h) {
  const seen = new Uint8Array(m.length); let n = 0;
  for (let i = 0; i < m.length; i++) {
    if (!m[i] || seen[i]) continue;
    let size = 0; const stack = [i]; seen[i] = 1;
    while (stack.length) { const k = stack.pop(); size++; const x = k % w, y = (k - x) / w; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const j = ny * w + nx; if (m[j] && !seen[j]) { seen[j] = 1; stack.push(j); } } }
    if (size >= 4) n++;
  }
  return n;
}
function score(d, t) {
  const angDiff = Math.min(Math.abs(d.angle - t.angle), 180 - Math.abs(d.angle - t.angle)) / 90;
  let s = 3 * Math.abs(d.coverage - t.coverage) / Math.max(t.coverage, 0.05);
  s += 4 * Math.hypot(d.centroid[0] - t.centroid[0], d.centroid[1] - t.centroid[1]);
  s += 3 * (Math.abs(d.spread[0] - t.spread[0]) + Math.abs(d.spread[1] - t.spread[1]));
  s += 1.5 * angDiff * Math.min(d.aniso, t.aniso) * 2;
  s += 1.5 * d.grid.reduce((acc, v, i) => acc + Math.abs(v - t.grid[i]), 0);
  s += 6 * Math.abs(d.darkCoverage - t.darkCoverage);
  // compactness: scattered layouts (many separate masses) are penalised against the reference's own count, capped at 12 so noisy references do not dominate
  if (t.components !== undefined) s += 0.15 * Math.min(12, Math.abs(d.components - Math.min(t.components, 12)));
  return s;
}
// VARIANTS=1: besides the seed, sweep the generator's own knobs for every counted type: positional spread, size (min = max) and snap rotation.
const VARIANTS = process.env.VARIANTS === '1'
  ? [0.5, 1, 1.6].flatMap((spread) => [0.7, 1, 1.4].flatMap((size) => [false, true].map((snap) => ({ spread, size, snap }))))
  : [null];
const OUTFILE = VARIANTS[0] ? '/tmp/presets_search_variants.json' : '/tmp/presets_search.json';
const results = {};
for (const spec of SPECS) {
  if (ONLY && !ONLY.includes(spec.id)) continue;
  const t = targets[spec.target || spec.id], paper = palettes[spec.palette].paper, best = [];
  for (const v of VARIANTS) {
    const perType = { ...(spec.perType || {}) };
    if (v) for (const type of Object.keys(spec.counts)) perType[type] = { spread: v.spread, sizeMin: v.size, sizeMax: v.size, snapRotation: v.snap, ...(spec.perType || {})[type] };
    for (let seed = 1; seed <= N; seed++) {
      const cfg = { ...makeConfig(seed, spec.counts, { perType }), orientation: spec.orientation, composition: { strategy: spec.strategy } };
      let layout; try { layout = layoutOf(cfg, spec.palette); } catch (err) { continue; }
      if (spec.need && !spec.need(layout)) continue;
      const d = describe(layout, paper, spec.orientation), s = score(d, t);
      best.push({ seed, ...(v ? { v } : {}), score: +s.toFixed(3), cov: +d.coverage.toFixed(2), c: d.centroid.map((x) => +x.toFixed(2)), ang: Math.round(d.angle) });
    }
  }
  best.sort((a, b) => a.score - b.score); results[spec.id] = best.slice(0, 12);
  console.log(spec.id.padEnd(17), `target cov ${t.coverage} c ${t.centroid} ang ${Math.round(t.angle)} |`, best.slice(0, 4).map((b) => `${b.seed}:${b.score}`).join('  '));
}
fs.writeFileSync(OUTFILE, JSON.stringify(results, null, 1));
