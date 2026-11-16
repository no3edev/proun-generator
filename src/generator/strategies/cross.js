// @ts-check
import { flatOrientation, pickWeighted, between, rad } from './common.js';
import { T, spreadOf, scaleFor, sizeMult, frontBiasedDepth, HAIRLINE_BACK, HAIRLINE_FRONT } from './shared.js';
import { makeKit } from './assemblyKit.js';

/** @typedef {import('./run.js').PlanItem} PlanItem */
/** @typedef {import('./run.js').Strategy} Strategy */

// CROSS. Orthogonal, upright compositions: the Proun built on a tall bar and a crossbar at right angles, where the older strategies always thrust
// along a diagonal. Two variants, drawn per scene:
//   - the CROSS: one tall bar (the anchor, in the one chromatic hue when the palette has one), grey planes behind it at either end, a black rectangle
//     beside it, a pale crossbar over it with a grey shadow plane under, a small black foot, a diamond outline round the crossing and a slanted hairline;
//   - the COLUMN: a tall dark column (the anchor) with a cube floating across it, a half disc cut by the top edge and another by the bottom, a wide low
//     triangle for the ground, and two thin lines.
// Everything stands within a few degrees of upright or level; snapRotation only affects the bars' roll.

/** @type {Strategy} */
export const cross = {
  label: 'Cross',
  uses: [T.beam, T.plane, T.block, T.cube, T.frame, T.rod, T.circle, T.triangle],

  plan(ctx) {
    const K = makeKit(ctx, 'cross');
    const { H, R, has, bar, accentHue, dark, light, neutrals, pick } = K;
    const { frame, basis } = ctx;
    /** @type {PlanItem[]} */
    const items = [];
    const rv = R('variant');
    const wantColumn = rv() < 0.4 && has(T.cube) && (has(T.plane) || has(T.block));
    const mid = neutrals[Math.floor(neutrals.length / 2)];
    const flatBox = /** @type {string | undefined} */ ([T.plane, T.block].find(has));
    const upright = Math.PI / 2 + rad(between(R('axis'), -2.5, 2.5));

    if (!wantColumn) {
      // --- the cross --------------------------------------------------------------
      const barTypes = /** @type {Array<[string, number]>} */ ([[T.beam, 0.6], [T.plane, 0.25], [T.block, 0.15]]).filter(([t]) => has(t));
      const rb = R('bar');
      const cx = (rb() - 0.5) * 0.3 * frame.halfW + 0.06 * frame.halfW, cy = (rb() - 0.5) * 0.1 * frame.halfH;
      const origin = { x: cx, y: cy };
      const Wb = H * between(rb, 0.04, 0.065);
      const barLen = H * between(rb, 0.95, 1.2);
      const barHex = accentHue && rb() < 0.7 ? accentHue : pick(dark, rb);
      if (barTypes.length) {
        items.push(bar({ type: /** @type {string} */ (pickWeighted(rb, barTypes)), cx, cy, ang: upright, len: barLen, wid: Wb, depth: 1.0, hex: barHex, role: 'anchor', rng: rb, origin }));
      }
      const crossY = cy + H * between(rb, -0.02, 0.1);
      if (flatBox) {
        // grey planes behind the bar at either end, on the side of the black rectangle
        for (let i = 0; i < 2; i++) {
          const r = R('end', i);
          items.push(bar({
            type: flatBox, cx: cx + Wb * between(r, 0.4, 1.3), cy: cy + (i === 0 ? 1 : -1) * H * between(r, 0.26, 0.32), ang: upright, len: H * between(r, 0.32, 0.45), wid: H * between(r, 0.07, 0.1),
            depth: -0.5 - 0.7 * i, hex: mid, role: 'support', rng: r, origin
          }));
        }
        // the black rectangle beside the bar
        const rk = R('black');
        items.push(bar({ type: flatBox, cx: cx - Wb * between(rk, 1.8, 3.2), cy: crossY + H * between(rk, -0.05, 0.08), ang: upright, len: H * between(rk, 0.34, 0.5), wid: H * between(rk, 0.08, 0.12), depth: 0.4, hex: K.ink, role: 'support', rng: rk, origin }));
      }
      // the crossbar and the grey shadow plane under it
      const crossTypes = /** @type {Array<[string, number]>} */ ([[T.beam, 0.5], [T.plane, 0.35], [T.block, 0.15]]).filter(([t]) => has(t));
      if (crossTypes.length) {
        const rx = R('crossbar');
        const type = /** @type {string} */ (pickWeighted(rx, crossTypes));
        const len = 2 * frame.halfW * between(rx, 0.36, 0.55), ang = rad(between(rx, -3, 3));
        const wid = H * between(rx, 0.025, 0.045);
        items.push(bar({ type, cx: cx + len * 0.3, cy: crossY, ang, len, wid, depth: 2.0, hex: light[light.length - 1], role: 'connector', rng: rx, origin }));
        items.push(bar({ type, cx: cx + len * 0.3, cy: crossY - wid * 0.8, ang, len, wid, depth: 1.3, hex: mid, role: 'connector', rng: R('crossbar-shadow'), origin }));
      }
      // the small black foot at the bar's lower end
      if (flatBox) {
        const rf = R('foot');
        items.push(bar({ type: flatBox, cx, cy: cy - barLen / 2 - H * 0.012, ang: 0, len: H * between(rf, 0.07, 0.1), wid: H * between(rf, 0.025, 0.04), depth: 1.9, hex: K.ink, role: 'support', rng: rf, origin }));
      }
      // the diamond outline round the crossing, and a hairline from its lower vertex
      if (has(T.frame)) {
        const r = R('diamond');
        const he = /** @type {import('../../types.js').ShapeDef} */ (ctx.shapes.get(T.frame)).localHalfExtents;
        const k = sizeMult(ctx, T.frame, r), sp = spreadOf(ctx, T.frame);
        const d = H * between(r, 0.34, 0.5) * k;
        const hex = accentHue && barHex !== accentHue ? accentHue : K.ink;
        items.push({
          type: T.frame, role: 'detail', x: cx + (cx - cx) * sp - Wb * 0.2, y: crossY + (crossY - cy) * sp,
          depth: between(r, 3.4, 4.2), orientation: flatOrientation(basis, ctx.billboard, Math.PI / 4 + rad(between(r, -3, 3))), scale: scaleFor(ctx, T.frame, d, d * he.y / he.x, H * 0.01), hex
        });
      }
      if (K.detailType) {
        const r = R('line');
        items.push(bar({
          type: K.detailType, cx: cx - Wb, cy: crossY - H * between(r, 0.18, 0.3), ang: upright + (r() < 0.5 ? -1 : 1) * rad(between(r, 8, 16)), len: H * between(r, 0.35, 0.55), wid: H * 0.011,
          depth: frontBiasedDepth(between(r, HAIRLINE_BACK, HAIRLINE_FRONT)), hex: accentHue && r() < 0.3 ? accentHue : K.ink, role: 'detail', rng: r, origin, noSize: true
        }));
      }
    } else {
      // --- the column ---------------------------------------------------------------
      const rc = R('column');
      const colX = (rc() - 0.5) * 0.12 * frame.halfW, colW = H * between(rc, 0.2, 0.28) * Math.min(1, frame.halfW / frame.halfH * 1.2);
      const origin = { x: colX, y: 0 };
      const colType = /** @type {string} */ (flatBox);
      items.push(bar({ type: colType, cx: colX, cy: 0, ang: upright, len: H * between(rc, 1.1, 1.3), wid: colW, depth: -0.6, hex: dark[0], role: 'anchor', rng: rc, origin }));
      // the cube across the column
      const rq = R('cube');
      const e = H * between(rq, 0.28, 0.38);
      items.push(bar({ type: T.cube, cx: colX + colW * between(rq, -0.35, 0.1), cy: H * between(rq, 0.08, 0.2), ang: 0, len: e, wid: e, depth: 1.0, hex: pick(light, rq), role: 'support', rng: rq, origin }));
      // half discs cut by the top and bottom edges
      if (has(T.circle)) {
        [1, -1].forEach((s, i) => {
          const r = R('half', i);
          items.push(bar({ type: T.circle, cx: colX, cy: s * (frame.halfH - H * 0.005), ang: 0, len: colW, wid: colW * between(r, 0.8, 1.05), depth: -1.4, hex: s > 0 ? dark[0] : light[light.length - 1], role: 'support', rng: r, origin }));
        });
      }
      // the wide low triangle for the ground
      if (has(T.triangle)) {
        const r = R('ground');
        items.push(bar({ type: T.triangle, cx: colX, cy: -H * between(r, 0.2, 0.3), ang: Math.PI, len: colW * between(r, 2.4, 3.4), wid: H * between(r, 0.12, 0.18), depth: 1.8, hex: mid, role: 'support', rng: r, origin }));
      }
      // two thin lines
      if (K.detailType) {
        for (let i = 0; i < 2; i++) {
          const r = R('thin', i);
          items.push(bar({
            type: K.detailType, cx: colX + (i === 0 ? -1 : 1) * colW * between(r, 0.7, 1.3), cy: H * between(r, -0.1, 0.2), ang: i === 0 ? upright + rad(between(r, 15, 35)) : upright,
            len: H * between(r, 0.5, 0.9), wid: H * 0.01, depth: frontBiasedDepth(between(r, HAIRLINE_BACK, HAIRLINE_FRONT)), hex: i === 0 && accentHue ? accentHue : K.ink, role: 'detail', rng: r, origin, noSize: true
          }));
        }
      }
    }
    // with almost nothing enabled (a lone circle, a lone triangle), still make something: one upright form
    if (!items.length) {
      const t = [T.circle, T.triangle, T.rod, T.cube].find(has);
      if (t) {
        const r = R('fallback');
        items.push(bar({ type: t, cx: 0, cy: 0, ang: upright, len: H * 0.5, wid: H * 0.3, depth: 0, hex: pick(dark, r), role: 'anchor', rng: r }));
      }
    }
    return items;
  }
};
