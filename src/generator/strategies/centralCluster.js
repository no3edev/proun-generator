// @ts-check
import * as THREE from 'three';
import { createRng } from '../rng.js';
import {
  screenDirection, barOrientation, flatOrientation, luminance, pickWeighted, between, rad
} from './common.js';
import { T, sizeMult, spreadOf, scaleFor } from './shared.js';

/** @typedef {import('./run.js').PlanItem} PlanItem */
/** @typedef {import('./run.js').Strategy} Strategy */

// CENTRAL CLUSTER. A calm, mostly upright composition: one tight cluster of
// solids stacked and overlapping near the centre (a main block, a large flat
// plate behind it, a low slab beside it, a tall thin bar on the other side),
// a small second cluster against an edge, and a few fine details at the
// edges (a vertical hairline with two ticks, a dot); sometimes a diamond
// outline around the cluster. Mostly empty ground (the references run 80%+).
//
// Taken from the reference study: the white-ground cluster with its black
// plate, grey box, white slab and tall bar and the small cluster at the
// bottom edge; the red vertical with a diamond outline.
//
// All the solids are WORLD-ALIGNED, with the same orientation, so they share
// one axonometric view (three faces each), as the boxes of those works do.
// Through the fixed camera a world-vertical edge is exactly vertical on
// screen (the camera has no roll), so bars stand upright without any turning.
// snapRotation has nothing to snap here: nothing is turned.
//
// Like the others, everything random comes from streams keyed by (seed,
// 'central-cluster', role, i), and distances are screen units (the frame is 6
// high), scaled by each shape's size and spread settings.

/** @type {Strategy} */
export const centralCluster = {
  label: 'Central cluster',

  plan(ctx) {
    const { seed, frame, basis, colors } = ctx;
    const H = frame.halfH * 2;
    const R = (/** @type {string} */ label, /** @type {number} */ i = 0) => createRng(seed, 'central-cluster', label, i);
    const has = (/** @type {string} */ t) => ctx.shapes.has(t);
    /** @type {PlanItem[]} */
    const items = [];
    const identity = () => new THREE.Quaternion();

    // --- colour: one chromatic accent, everything else neutral ----------------
    const rc = R('colour');
    const accentHue = colors.saturated.length ? colors.saturated[Math.floor(rc() * colors.saturated.length)] : null;
    const neutrals = colors.neutrals.length ? colors.neutrals : [ctx.ink];
    const dark = neutrals.slice(0, Math.max(1, Math.ceil(neutrals.length / 2)));
    const light = neutrals.slice(Math.floor(neutrals.length / 2));
    const pick = (/** @type {string[]} */ list, /** @type {() => number} */ rng) => list[Math.floor(rng() * list.length)];
    /** a colour from `list` that is none of `avoid` (any neutral, then the ink, if need be) */
    const distinct = (/** @type {string[]} */ list, /** @type {string[]} */ avoid, /** @type {() => number} */ rng) => {
      const a = list.filter((h) => !avoid.includes(h));
      if (a.length) return pick(a, rng);
      const b = neutrals.filter((h) => !avoid.includes(h));
      return b.length ? pick(b, rng) : (avoid.includes(ctx.ink) ? neutrals[0] : ctx.ink);
    };
    const mainHex = pick(rc() < 0.5 ? light : neutrals, rc);
    const backHex = accentHue && rc() < 0.15 ? accentHue : distinct(dark, [mainHex], rc);
    const slabHex = distinct(light, [mainHex, backHex], rc);
    const barHex = accentHue && backHex !== accentHue && rc() < 0.5 ? accentHue : distinct(light, [mainHex, backHex], rc);
    const accentOrInk = accentHue && backHex !== accentHue && barHex !== accentHue ? accentHue : ctx.ink;

    // --- the cluster: where it sits and how big its main block is -------------
    const rn = R('main');
    const blockTypes = /** @type {Array<[string, number]>} */ ([[T.block, 0.5], [T.cube, 0.35], [T.plane, 0.15]]).filter(([t]) => has(t));
    const mainType = pickWeighted(rn, blockTypes) || [T.beam, T.sphere, T.circle, T.segment, T.triangle].find(has) || null;
    const cx = (rn() * 2 - 1) * 0.18 * frame.halfW;
    const cy = between(rn, 0.0, 0.3) * frame.halfH; // a little above the middle
    const c = { x: cx, y: cy };
    // the main block's world extents (x, y, z) and its footprint on screen
    const ex = H * between(rn, 0.26, 0.38), ey = H * between(rn, 0.2, 0.34), ez = H * between(rn, 0.18, 0.3);
    const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
    const fw = ex * Math.abs(X.dot(basis.right)) + ez * Math.abs(Z.dot(basis.right));
    const fh = ey * Math.abs(Y.dot(basis.up)) + ex * Math.abs(X.dot(basis.up)) + ez * Math.abs(Z.dot(basis.up));
    let mainSize = Math.max(fw, fh);
    if (mainType) {
      const sp = spreadOf(ctx, mainType);
      const k = sizeMult(ctx, mainType, rn);
      c.x *= sp; c.y *= sp;
      /** @type {[number, number, number]} */
      let scale;
      if (mainType === T.cube) { const e = (ex + ey + ez) / 3 * k; scale = scaleFor(ctx, mainType, e, e, e); mainSize = Math.max(mainSize * k, e); }
      else if (mainType === T.plane) { scale = scaleFor(ctx, mainType, ex * 1.3 * k, ey * 1.3 * k, ez * 0.18 * k); mainSize *= 1.3 * k; }
      else if (mainType === T.block) { scale = scaleFor(ctx, mainType, ex * k, ey * k, ez * k); mainSize *= k; }
      else { const e = ex * k; scale = scaleFor(ctx, mainType, e, e, e); if (mainType === T.circle) scale[2] = 1; }
      items.push({ type: mainType, role: 'anchor', x: c.x, y: c.y, depth: 0, orientation: identity(), scale, hex: mainHex });
    }
    const w = fw, h = fh;

    // --- the plate behind, the slab beside, the bar on the other side ---------
    const boxTypes = (/** @type {Array<[string, number]>} */ weighted) => /** @type {Array<[string, number]>} */ (weighted).filter(([t]) => has(t));
    const plateTypes = boxTypes([[T.plane, 0.6], [T.block, 0.4]]);
    if (plateTypes.length) {
      const r = R('plate');
      const type = /** @type {string} */ (pickWeighted(r, plateTypes));
      const k = sizeMult(ctx, type, r), sp = spreadOf(ctx, type);
      // the plate's world extents, and so its height on screen: kept inside the frame (the references' plates are)
      const pw = w * between(r, 1.3, 1.8) * k, ph = h * between(r, 1.0, 1.4) * k, pt = H * between(r, 0.02, 0.05);
      const onScreenH = ph * Math.abs(Y.dot(basis.up)) + pw * Math.abs(X.dot(basis.up)) + pt * Math.abs(Z.dot(basis.up));
      const px = c.x + between(r, -0.3, 0.05) * w * sp;
      const py = Math.min(c.y + between(r, 0.2, 0.5) * h * sp, frame.halfH * 0.97 - onScreenH / 2);
      items.push({
        type, role: 'support', depth: -1.2, x: px, y: py,
        orientation: identity(), scale: scaleFor(ctx, type, pw, ph, pt), hex: backHex
      });
    }
    const slabTypes = boxTypes([[T.block, 0.5], [T.beam, 0.3], [T.plane, 0.2]]);
    if (slabTypes.length) {
      const r = R('slab');
      const type = /** @type {string} */ (pickWeighted(r, slabTypes));
      const k = sizeMult(ctx, type, r), sp = spreadOf(ctx, type);
      items.push({
        type, role: 'support', depth: 0.6,
        x: c.x - between(r, 0.55, 0.8) * w * sp, y: c.y - between(r, 0.0, 0.2) * h * sp,
        orientation: identity(),
        scale: scaleFor(ctx, type, ex * between(r, 0.5, 0.8) * k, ey * between(r, 0.18, 0.3) * k, ez * between(r, 0.7, 0.9) * k),
        hex: slabHex
      });
    }
    const barTypes = boxTypes([[T.beam, 0.5], [T.block, 0.3], [T.plane, 0.2]]);
    if (barTypes.length) {
      const r = R('bar');
      const type = /** @type {string} */ (pickWeighted(r, barTypes));
      const k = sizeMult(ctx, type, r), sp = spreadOf(ctx, type);
      const t = H * between(r, 0.035, 0.06) * k;
      const barH = H * between(r, 0.45, 0.62) * k; // clearly taller than the main block
      const bx = c.x + between(r, 0.55, 0.85) * w * sp;
      // upright and inside the frame
      const by = Math.min(c.y + between(r, 0.1, 0.3) * h * sp, frame.halfH * 0.97 - barH / 2);
      items.push({
        type, role: 'connector', depth: 1.2, x: bx, y: by,
        // a world-vertical bar: upright on screen
        orientation: identity(),
        scale: scaleFor(ctx, type, t, barH, t * between(r, 0.8, 1.2)),
        hex: barHex
      });
    }

    // --- a small second cluster against an edge ---------------------------------------
    const edgeTypes = boxTypes([[T.block, 0.4], [T.cube, 0.35], [T.plane, 0.25]]);
    const re = R('edge');
    const edgeSide = re() < 0.5 ? -1 : 1;
    if (edgeTypes.length) {
      const ex0 = edgeSide * frame.halfW * between(re, 0.35, 0.75);
      const ey0 = -frame.halfH * between(re, 0.72, 0.9);
      const s0 = H * between(re, 0.06, 0.12);
      for (let i = 0; i < 2; i++) {
        const type = /** @type {string} */ (pickWeighted(re, edgeTypes));
        const k = sizeMult(ctx, type, re), sp = spreadOf(ctx, type);
        const s = s0 * (i === 0 ? 1.4 : 0.85) * k;
        items.push({
          type, role: 'support', depth: 0.5 + 0.4 * i,
          x: ex0 + i * s0 * 0.7 * sp, y: ey0 + i * s0 * 0.6,
          orientation: identity(),
          scale: type === T.plane ? scaleFor(ctx, type, s * 1.4, s, s * 0.15) : scaleFor(ctx, type, s * between(re, 0.9, 1.4), s * between(re, 0.7, 1.1), s),
          hex: i === 0 ? distinct(dark, [mainHex], re) : distinct(light, [mainHex, backHex], re)
        });
      }
    }

    // --- fine details at the edges: a vertical hairline with two ticks, a dot ---------
    const lineTypes = [T.rod, T.beam, T.block, T.plane].filter(has);
    if (lineTypes.length) {
      const r = R('hairline');
      const type = lineTypes[0];
      const k = sizeMult(ctx, type, r), sp = spreadOf(ctx, type);
      const x = -edgeSide * frame.halfW * between(r, 0.78, 0.88);
      const y = between(r, -0.2, 0.25) * frame.halfH;
      const len = H * between(r, 0.25, 0.45) * k;
      const wdt = H * between(r, 0.008, 0.014) * k;
      items.push({
        type, role: 'detail', depth: between(r, 0, 2), x, y: y * sp,
        orientation: identity(), scale: scaleFor(ctx, type, wdt, len, wdt), hex: ctx.ink
      });
      for (let i = 0; i < 2; i++) {
        const tl = H * between(r, 0.04, 0.09) * k;
        items.push({
          type, role: 'detail', depth: between(r, 0, 2),
          x: x + (x > 0 ? -tl / 2 : tl / 2), // a tick reaches inward from the hairline
          y: y * sp + len / 2 - (0.12 + 0.12 * i) * len,
          orientation: barOrientation(screenDirection(basis, 0, 0), 0), scale: scaleFor(ctx, type, tl, wdt, wdt),
          hex: i === 0 && accentHue && backHex !== accentHue && barHex !== accentHue ? accentHue : ctx.ink
        });
      }
    }
    if (has(T.circle)) {
      const r = R('dot');
      const d = H * between(r, 0.025, 0.045) * sizeMult(ctx, T.circle, r);
      const s = scaleFor(ctx, T.circle, d, d, 1); s[2] = 1;
      items.push({
        type: T.circle, role: 'detail', depth: 0.5,
        x: edgeSide * frame.halfW * between(r, 0.85, 0.93), y: between(r, 0.0, 0.3) * frame.halfH,
        orientation: identity(), scale: s, hex: ctx.ink
      });
    }

    // --- a tiny accent against the cluster, in the one accent hue ---------------------
    const accentTypes = boxTypes([[T.plane, 0.35], [T.cube, 0.3], [T.triangle, 0.2], [T.crescent, 0.15]]);
    if (accentTypes.length) {
      const r = R('accent');
      const type = /** @type {string} */ (pickWeighted(r, accentTypes));
      const k = sizeMult(ctx, type, r), sp = spreadOf(ctx, type);
      const s = Math.min(H * between(r, 0.04, 0.08) * k, mainSize * 0.25);
      const x = c.x + (r() < 0.5 ? -1 : 1) * between(r, 0.55, 0.95) * w * sp;
      const y = c.y + (r() < 0.5 ? -1 : 1) * between(r, 0.2, 0.6) * h * sp;
      /** @type {[number, number, number]} */
      let scale;
      let orientation = identity();
      if (type === T.plane) scale = scaleFor(ctx, type, s * 1.4, s, s * 0.12);
      else if (type === T.cube) scale = scaleFor(ctx, type, s, s, s);
      else {
        scale = scaleFor(ctx, type, s * 1.6, s, s * 0.2);
        orientation = flatOrientation(basis, ctx.billboard, r() < 0.5 ? 0 : Math.PI / 2);
      }
      items.push({ type, role: 'accent', x, y, depth: between(r, 2.0, 3.0), orientation, scale, hex: accentOrInk });
    }

    // --- a diamond outline around the cluster (when frames are enabled) -----------------
    if (has(T.frame)) {
      const r = R('outline');
      if (r() < 0.6) {
        const k = sizeMult(ctx, T.frame, r);
        const he = /** @type {import('../../types.js').ShapeDef} */ (ctx.shapes.get(T.frame)).localHalfExtents;
        const len = Math.max(w, h) * between(r, 1.5, 2.1) * k;
        const dark0 = luminance(mainHex) < 0.5;
        items.push({
          type: T.frame, role: 'detail', depth: between(r, 3.3, 4.5),
          x: c.x, y: c.y,
          orientation: flatOrientation(basis, ctx.billboard, Math.PI / 4 * (r() < 0.5 ? 1 : -1)),
          scale: scaleFor(ctx, T.frame, len, len * he.y / he.x, H * 0.01),
          hex: accentHue && backHex !== accentHue && barHex !== accentHue && r() < 0.5 ? accentHue : (dark0 ? light[light.length - 1] : ctx.ink)
        });
      }
    }
    return items;
  }
};
