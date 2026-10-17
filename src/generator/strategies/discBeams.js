// @ts-check
import * as THREE from 'three';
import { createRng } from '../rng.js';
import {
  screenDirection, barOrientation, flatOrientation, blockOrientation,
  luminance, pickWeighted, between, rad
} from './common.js';
import { thrustAngle, T, sizeMult, spreadOf, scaleFor } from './shared.js';

/** @typedef {import('./run.js').PlanItem} PlanItem */
/** @typedef {import('./run.js').Strategy} Strategy */

// DISC AND BEAMS. A large flat disc is the anchor field, set a little off
// centre and often bleeding off the frame. Beams cross its EDGE (not its
// middle): one main angle, a primary beam and (usually) a parallel partner
// beside it, like the stacked bars of the references; then one or two beams
// crossing them at a steeper angle, over the disc's rim. A few small accents,
// hairlines and (when enabled) a ring around the disc or a frame across it.
//
// Taken from the reference study: the flat disc behind the volumes (J, K, B),
// beams that overshoot and pair up (D, K, J), a single dominant diagonal with
// a minority crossing it (I's X), one chromatic accent against greys.
//
// The disc is kept at the back and the beams in front of it with a clear gap
// in depth, so that a graphic shadow plane (a later stage) has room between
// them; nothing is cast yet.
//
// Like Axis thrust, everything random comes from streams keyed by (seed,
// 'disc-beams', role, i), and distances are screen units (the frame is 6
// high) scaled by each shape's size and spread settings.

/** @type {Strategy} */
export const discBeams = {
  label: 'Disc and beams',

  plan(ctx) {
    const { seed, frame, basis, colors } = ctx;
    const H = frame.halfH * 2;
    const R = (/** @type {string} */ label, /** @type {number} */ i = 0) => createRng(seed, 'disc-beams', label, i);
    const has = (/** @type {string} */ t) => ctx.shapes.has(t);
    /** @type {PlanItem[]} */
    const items = [];

    // --- the main angle -----------------------------------------------------
    const theta = thrustAngle(R('angle'));
    const axis = { x: Math.cos(theta), y: Math.sin(theta) };
    const normal = { x: -axis.y, y: axis.x };

    // --- colour: one chromatic accent, everything else neutral ---------------
    const rc = R('colour');
    const accentHue = colors.saturated.length ? colors.saturated[Math.floor(rc() * colors.saturated.length)] : null;
    const neutrals = colors.neutrals.length ? colors.neutrals : [ctx.ink];
    const dark = neutrals.slice(0, Math.max(1, Math.ceil(neutrals.length / 2)));
    const light = neutrals.slice(Math.floor(neutrals.length / 2));
    const pick = (/** @type {string[]} */ list, /** @type {() => number} */ rng) => list[Math.floor(rng() * list.length)];
    // the disc: the accent (a red or yellow disc), or a dark one (a black disc), or a mid neutral
    const u = rc();
    const discHex = accentHue && u < 0.4 ? accentHue : (u < 0.8 ? pick(dark, rc) : pick(neutrals, rc));
    const discIsDark = luminance(discHex) < 0.5;
    // neutrals other than the disc's own colour (falling back to the ink): what the beams and outlines may use
    const apartFromDisc = (/** @type {string[]} */ list) => {
      const l = list.filter((h) => h !== discHex);
      const any = neutrals.filter((h) => h !== discHex);
      return l.length ? l : (any.length ? any : [ctx.ink]);
    };
    const accentOrInk = accentHue && discHex !== accentHue ? accentHue : ctx.ink;

    // --- the disc ---------------------------------------------------------------
    const rn = R('disc');
    const anchorType = has(T.circle) ? T.circle : pickWeighted(rn, /** @type {Array<[string, number]>} */ ([
      [T.segment, 0.4], [T.sphere, 0.2], [T.block, 0.25], [T.cube, 0.15]
    ]).filter(([t]) => has(t)));
    // a little off centre, and free to bleed off the frame
    const dx = (rn() * 2 - 1) * 0.35 * frame.halfW;
    const dy = (rn() * 2 - 1) * 0.3 * frame.halfH;
    const disc = { x: 0, y: 0, r: H * 0.3 };
    if (anchorType) {
      const sp = spreadOf(ctx, anchorType);
      const k = sizeMult(ctx, anchorType, rn);
      disc.x = dx * sp; disc.y = dy * sp;
      const d = H * between(rn, 0.5, 0.78) * k;
      /** @type {[number, number, number]} */
      let scale;
      let orientation = new THREE.Quaternion();
      if (anchorType === T.circle) {
        scale = scaleFor(ctx, T.circle, d, d, 1); scale[2] = 1;
      } else if (anchorType === T.segment) {
        scale = scaleFor(ctx, T.segment, d, d * between(rn, 0.3, 0.5), d * 0.06);
        orientation = flatOrientation(basis, ctx.billboard, theta + (rn() < 0.5 ? 0 : Math.PI));
      } else if (anchorType === T.sphere) {
        scale = scaleFor(ctx, T.sphere, d * 0.7, d * 0.7, d * 0.7);
      } else {
        const e = d * (anchorType === T.cube ? 0.45 : 0.6);
        scale = anchorType === T.cube
          ? scaleFor(ctx, T.cube, e, e, e)
          : scaleFor(ctx, T.block, e, e * between(rn, 0.55, 0.75), e * between(rn, 0.4, 0.6));
        orientation = blockOrientation(basis, theta);
      }
      const he = /** @type {import('../../types.js').ShapeDef} */ (ctx.shapes.get(anchorType)).localHalfExtents;
      disc.r = Math.max(2 * he.x * scale[0], 2 * he.y * scale[1]) / 2;
      items.push({ type: anchorType, role: 'anchor', x: disc.x, y: disc.y, depth: 0, orientation, scale, hex: discHex });
    }
    const discSize = disc.r * 2;

    // --- beams ----------------------------------------------------------------------
    const beamTypes = /** @type {Array<[string, number]>} */ (has(T.beam)
      ? [[T.beam, 0.85], [T.block, 0.1], [T.plane, 0.05]]
      : [[T.block, 0.65], [T.plane, 0.35]]).filter(([t]) => has(t));
    if (beamTypes.length) {
      const rb0 = R('beam-plan');
      const paired = rb0() < 0.6;
      const crossing = 1 + (rb0() < 0.4 ? 1 : 0);
      const side = rb0() < 0.5 ? -1 : 1;
      // beams: 0 = the primary, 1 = its parallel partner (if any), then the crossing ones
      /** @type {Array<{ kind: 'main' | 'pair' | 'cross' }>} */
      const plan = [{ kind: 'main' }];
      if (paired) plan.push({ kind: 'pair' });
      for (let c = 0; c < crossing; c++) plan.push({ kind: 'cross' });
      let mainOff = 0, mainLen = 0;

      plan.forEach(({ kind }, i) => {
        const rb = R('beam', i);
        const type = /** @type {string} */ (pickWeighted(rb, beamTypes));
        const k = sizeMult(ctx, type, rb);
        const sp = spreadOf(ctx, type);
        let ang = theta, len, cx, cy, depth;
        if (kind === 'main') {
          // across the disc's rim, not through its middle
          mainOff = side * disc.r * between(rb, 0.45, 0.95);
          mainLen = 2 * frame.halfW * between(rb, 0.6, 1.0) * k;
          len = mainLen;
          const along = (rb() - 0.5) * 0.3 * len * sp;
          cx = disc.x + axis.x * along + normal.x * mainOff * sp;
          cy = disc.y + axis.y * along + normal.y * mainOff * sp;
          depth = between(rb, 1.0, 1.6);
        } else if (kind === 'pair') {
          // right beside the primary, a little off its angle and length
          ang = theta + rad(between(rb, -2, 2));
          len = mainLen * between(rb, 0.75, 1.0);
          const gap = side * between(rb, 0.5, 1.3) * (rb() < 0.5 ? 1 : -1) * k;
          const along = (rb() - 0.5) * 0.4 * len * sp;
          cx = disc.x + axis.x * along + normal.x * (mainOff * sp + gap);
          cy = disc.y + axis.y * along + normal.y * (mainOff * sp + gap);
          depth = between(rb, 1.0, 1.6) + 0.7;
        } else {
          // crossing the main angle at 40-90 degrees, over the rim of the disc
          const cross = (rb() < 0.5 ? -1 : 1) * rad(between(rb, 40, 90));
          ang = theta + cross;
          len = 2 * frame.halfW * between(rb, 0.25, 0.5) * k;
          const at = between(rb, 0, 2 * Math.PI);
          const rim = disc.r * between(rb, 0.7, 1.15) * sp;
          cx = disc.x + Math.cos(at) * rim;
          cy = disc.y + Math.sin(at) * rim;
          depth = between(rb, 1.8, 2.6) + 0.5 * i;
        }
        const tilt = ctx.snapRotation || rb() < 0.5 ? 0 : (rb() < 0.5 ? -1 : 1) * rad(between(rb, 5, 16));
        const roll = ctx.snapRotation
          ? Math.round(between(rb, 0, 4)) * (Math.PI / 4)
          : rad(between(rb, 20, 55)) * (rb() < 0.5 ? -1 : 1);
        const t = H * between(rb, 0.028, 0.075) * k * (type === T.beam ? 1.25 : 1);
        /** @type {[number, number, number]} */
        let scale;
        if (type === T.plane) {
          scale = scaleFor(ctx, type, len, H * between(rb, 0.07, 0.16) * k, H * between(rb, 0.008, 0.016));
        } else {
          const f = between(rb, 0.7, 1.6);
          scale = scaleFor(ctx, type, len, t, t * (type === T.beam ? Math.min(f, 1.2) : f));
        }
        // tone: opposite the disc's, so the beams read against it
        const hex = kind === 'main'
          ? pick(apartFromDisc(discIsDark ? light : dark), rb)
          : pick(apartFromDisc(neutrals), rb);
        items.push({
          type, role: kind === 'cross' ? 'connector' : 'support', x: cx, y: cy, depth,
          orientation: barOrientation(screenDirection(basis, ang, tilt), roll), scale, hex
        });
      });
    }

    // --- accents: small, just outside the disc, in the one accent hue -----------------
    const accentTypes = /** @type {Array<[string, number]>} */ ([
      [T.triangle, 0.3], [T.plane, 0.2], [T.cube, 0.15], [T.circle, 0.2], [T.segment, 0.15], [T.crescent, 0.15]
    ]).filter(([t]) => has(t));
    if (accentTypes.length) {
      const n = 1 + (R('accent-count')() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const r = R('accent', i);
        const type = /** @type {string} */ (pickWeighted(r, accentTypes));
        const k = sizeMult(ctx, type, r);
        const sp = spreadOf(ctx, type);
        // accents stay small against the disc (their longest side is at most 1.8 s)
        const s = Math.min(H * between(r, 0.05, 0.16) * k, discSize * 0.2);
        const at = between(r, 0, 2 * Math.PI);
        const rim = disc.r * between(r, 1.05, 1.55) * sp;
        const x = disc.x + Math.cos(at) * rim, y = disc.y + Math.sin(at) * rim;
        const turn = theta + (r() < 0.5 ? 0 : Math.PI / 2);
        /** @type {[number, number, number]} */
        let scale;
        let orientation;
        if (type === T.circle) { scale = scaleFor(ctx, type, s, s, 1); scale[2] = 1; orientation = new THREE.Quaternion(); }
        else if (type === T.triangle) { scale = scaleFor(ctx, type, s * 1.6, s, s * 0.25); orientation = flatOrientation(basis, ctx.billboard, turn + (r() < 0.5 ? 0 : Math.PI)); }
        else if (type === T.plane) { scale = scaleFor(ctx, type, s * 1.8, s * 0.7, H * 0.012); orientation = flatOrientation(basis, ctx.billboard, turn); }
        else if (type === T.segment) { scale = scaleFor(ctx, type, s * 1.8, s * 0.7, s * 0.2); orientation = flatOrientation(basis, ctx.billboard, turn + (r() < 0.5 ? 0 : Math.PI)); }
        else if (type === T.crescent) { scale = scaleFor(ctx, type, s * 1.2, s * 1.5, s * 0.2); orientation = flatOrientation(basis, ctx.billboard, turn + (r() < 0.5 ? 0 : Math.PI)); }
        else { scale = scaleFor(ctx, type, s, s, s); orientation = blockOrientation(basis, theta); }
        items.push({ type, role: 'accent', x, y, depth: between(r, 2.8, 3.8) + 0.2 * i, orientation, scale, hex: accentOrInk });
      }
    }

    // --- hairlines along the main angle, near the disc ---------------------------------
    const detailType = [T.rod, T.block, T.plane, T.beam].find(has);
    if (detailType) {
      const n = 1 + (R('detail-count')() < 0.45 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const r = R('detail', i);
        const k = sizeMult(ctx, detailType, r);
        const sp = spreadOf(ctx, detailType);
        const across = r() < 0.2;
        const ang = theta + (across ? Math.PI / 2 : rad(between(r, -3, 3)));
        const len = 2 * frame.halfW * between(r, 0.45, 0.9) * k;
        const off = (r() < 0.5 ? -1 : 1) * disc.r * between(r, 0.1, 1.0) * sp;
        const along = (r() - 0.5) * 0.4 * len * sp;
        const w = H * between(r, 0.008, 0.016) * k;
        const tilt = ctx.snapRotation ? 0 : rad(between(r, -6, 6));
        const hex = accentHue && r() < 0.3 ? accentHue : (discIsDark && r() < 0.5 ? light[light.length - 1] : ctx.ink);
        items.push({
          type: detailType, role: 'detail', x: disc.x + axis.x * along + normal.x * off, y: disc.y + axis.y * along + normal.y * off,
          depth: between(r, -1.0, 3.0),
          orientation: barOrientation(screenDirection(basis, ang, tilt), rad(between(r, 0, 90))), scale: scaleFor(ctx, detailType, len, w, w), hex
        });
      }
    }

    // --- outlines: a ring around the disc, a frame across it --------------------------------
    [T.ring, T.frame].filter(has).forEach((type, oi) => {
      const r = R('outline', oi);
      if (r() >= 0.75) return;
      const k = sizeMult(ctx, type, r);
      const sp = spreadOf(ctx, type);
      const he = /** @type {import('../../types.js').ShapeDef} */ (ctx.shapes.get(type)).localHalfExtents;
      const wantAccent = r() < 0.5;
      const hex = wantAccent && accentHue && discHex !== accentHue ? accentHue : (discIsDark ? apartFromDisc(light).slice(-1)[0] : (ctx.ink !== discHex ? ctx.ink : apartFromDisc(light)[0]));
      const thickness = H * 0.01;
      const depth = r() < 0.75 ? between(r, 3.3, 4.5) : -between(r, 2.0, 3.0);
      if (type === T.ring) {
        // concentric with the disc, a little larger: the circle outline of the references
        const d = discSize * between(r, 1.12, 1.45) * k;
        items.push({
          type, role: 'detail', depth, hex, x: disc.x, y: disc.y,
          orientation: flatOrientation(basis, ctx.billboard, between(r, 0, 2 * Math.PI)),
          scale: scaleFor(ctx, type, d, d, thickness)
        });
      } else {
        const across = r() < 0.2;
        const ang = theta + (across ? Math.PI / 2 : rad(between(r, -6, 6)));
        const len = 2 * frame.halfW * between(r, 0.4, 0.8) * k;
        const off = (r() < 0.5 ? -1 : 1) * disc.r * between(r, 0.0, 0.8) * sp;
        const along = (r() - 0.5) * 0.3 * len * sp;
        items.push({
          type, role: 'detail', depth, hex,
          x: disc.x + axis.x * along + normal.x * off, y: disc.y + axis.y * along + normal.y * off,
          orientation: flatOrientation(basis, ctx.billboard, ang),
          scale: scaleFor(ctx, type, len, len * he.y / he.x, thickness)
        });
      }
    });
    return items;
  }
};
