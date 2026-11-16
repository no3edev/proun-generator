// @ts-check
import * as THREE from 'three';
import { createRng } from '../rng.js';
import {
  screenDirection, barOrientation, flatOrientation, blockOrientation,
  luminance, pickWeighted, between, rad
} from './common.js';
import { ANGLE_FAMILIES, thrustAngle, T, sizeMult, spreadOf, scaleFor, frontBiasedDepth, HAIRLINE_BACK, HAIRLINE_FRONT } from './shared.js';

/** @typedef {import('./run.js').PlanItem} PlanItem */
/** @typedef {import('./run.js').PlanContext} PlanContext */
/** @typedef {import('./run.js').Strategy} Strategy */

// AXIS THRUST. The composition is organised around one diagonal. A single
// primary mass sits near the centre of the frame; a few long beams run along
// the diagonal across it (and well past it, often off the frame), each at its
// own depth so some pass in front of the mass and some behind; a handful of
// small accents and hairlines sit along and across the same axis. Everything
// else is empty ground.
//
// Taken from the reference study (docs: Stage 1): one dominant off-axis angle
// per work, clustering near 12-25, 40 and 55-60 degrees, rising or falling;
// a heavy core with thin extenders; hierarchy anchor > beams > accents >
// hairlines; one chromatic accent against greys; flat discs behind volumes.
//
// Everything random comes from streams keyed by (seed, 'axis-thrust', role,
// i), so adding or removing one element never changes another. Distances are
// in screen units (the frame is 6 high), and scaled by each shape's own
// size multiplier and spread settings, as in the legacy generator.

export { ANGLE_FAMILIES };

/** @type {Strategy} */
export const axisThrust = {
  label: 'Axis thrust',

  plan(ctx) {
    const { seed, frame, basis, colors } = ctx;
    const H = frame.halfH * 2;
    const R = (/** @type {string} */ label, /** @type {number} */ i = 0) => createRng(seed, 'axis-thrust', label, i);
    const has = (/** @type {string} */ t) => ctx.shapes.has(t);
    /** @type {PlanItem[]} */
    const items = [];

    // --- the axis ------------------------------------------------------
    const ra = R('angle');
    const theta = thrustAngle(ra);
    const axis = { x: Math.cos(theta), y: Math.sin(theta) };
    const normal = { x: -axis.y, y: axis.x };

    // --- colour plan: one chromatic accent, everything else neutral -----
    const rc = R('colour');
    const accentHue = colors.saturated.length ? colors.saturated[Math.floor(rc() * colors.saturated.length)] : null;
    const neutrals = colors.neutrals.length ? colors.neutrals : [ctx.ink];
    const dark = neutrals.slice(0, Math.max(1, Math.ceil(neutrals.length / 2)));
    const light = neutrals.slice(Math.floor(neutrals.length / 2));
    const pick = (/** @type {string[]} */ list, /** @type {() => number} */ rng) => list[Math.floor(rng() * list.length)];
    const anchorHex = accentHue && rc() < 0.35 ? accentHue : pick(dark, rc);
    const anchorIsDark = luminance(anchorHex) < 0.5;
    // when the anchor already is the accent hue, small accents go dark so they still read against it
    const accentOrInk = accentHue && anchorHex !== accentHue ? accentHue : ctx.ink;

    // --- anchor: the primary mass near the centre -------------------------
    const rn = R('anchor');
    const anchorType = pickWeighted(rn, /** @type {Array<[string, number]>} */ ([
      [T.circle, 0.45], [T.block, 0.25], [T.cube, 0.15], [T.sphere, 0.08], [T.triangle, 0.07], [T.segment, 0.12]
    ]).filter(([t]) => has(t)));
    const ax = (rn() - 0.5) * 0.3 * frame.halfW;
    const ay = (rn() - 0.5) * 0.3 * frame.halfH;
    /** @type {{ x: number, y: number, r: number }} */
    let anchor = { x: 0, y: 0, r: H * 0.18 };
    // the anchor's largest world extent: the yardstick that keeps accents subordinate to it
    let anchorSize = H * 0.36;
    if (anchorType) {
      const sp = spreadOf(ctx, anchorType);
      const k = sizeMult(ctx, anchorType, rn);
      anchor.x = ax * sp; anchor.y = ay * sp;
      /** @type {[number, number, number]} */
      let scale;
      let orientation = new THREE.Quaternion();
      if (anchorType === T.circle) {
        const d = H * between(rn, 0.40, 0.62) * k;
        scale = scaleFor(ctx, T.circle, d, d, 1); scale[2] = 1;
        anchor.r = d / 2;
      } else if (anchorType === T.sphere) {
        const d = H * between(rn, 0.28, 0.40) * k;
        scale = scaleFor(ctx, T.sphere, d, d, d);
        anchor.r = d / 2;
      } else if (anchorType === T.cube) {
        const e = H * between(rn, 0.22, 0.34) * k;
        scale = scaleFor(ctx, T.cube, e, e, e);
        orientation = blockOrientation(basis, theta);
        anchor.r = e * 0.7;
      } else if (anchorType === T.block) {
        const e = H * between(rn, 0.30, 0.44) * k;
        const f = e * between(rn, 0.55, 0.75);
        scale = scaleFor(ctx, T.block, e, f, f * between(rn, 0.7, 1.0));
        orientation = blockOrientation(basis, theta);
        anchor.r = e * 0.5;
      } else if (anchorType === T.segment) { // a large flat segment: its chord runs along the axis
        const chord = H * between(rn, 0.55, 0.95) * k;
        scale = scaleFor(ctx, T.segment, chord, chord * between(rn, 0.28, 0.5), chord * 0.08);
        orientation = flatOrientation(basis, ctx.billboard, theta + (rn() < 0.5 ? 0 : Math.PI));
        anchor.r = chord * 0.4;
      } else { // triangle: a wedge whose long edge follows the axis
        const e = H * between(rn, 0.30, 0.46) * k;
        scale = scaleFor(ctx, T.triangle, e, e * between(rn, 0.5, 0.9), e * 0.2);
        orientation = flatOrientation(basis, ctx.billboard, theta + (rn() < 0.5 ? 0 : Math.PI));
        anchor.r = e * 0.4;
      }
      const he = /** @type {import('../../types.js').ShapeDef} */ (ctx.shapes.get(anchorType)).localHalfExtents;
      anchorSize = Math.max(2 * he.x * scale[0], 2 * he.y * scale[1]);
      items.push({ type: anchorType, role: 'anchor', x: anchor.x, y: anchor.y, depth: 0, orientation, scale, hex: anchorHex });
    }

    // --- beams: the axis made visible ---------------------------------------
    // the beam shape, when enabled, makes the beams; otherwise boxes and planks stand in for it
    const beamTypes = /** @type {Array<[string, number]>} */ (has(T.beam)
      ? [[T.beam, 0.85], [T.block, 0.1], [T.plane, 0.05]]
      : [[T.block, 0.65], [T.plane, 0.35]]).filter(([t]) => has(t));
    if (beamTypes.length) {
      const rb0 = R('beam-count');
      const beamCount = 2 + Math.floor(rb0() * 2);
      const crossAt = rb0() < 0.3 ? beamCount - 1 : -1; // at most one beam crosses the axis, like the X of a Proun
      for (let i = 0; i < beamCount; i++) {
        const rb = R('beam', i);
        const type = /** @type {string} */ (pickWeighted(rb, beamTypes));
        const k = sizeMult(ctx, type, rb);
        const sp = spreadOf(ctx, type);
        const crossing = i === crossAt;
        const wander = i === 0 || crossing ? 0 : (rb() < 0.7 ? 0 : (rb() < 0.5 ? -1 : 1) * between(rb, 3, 9));
        const ang = theta + rad(wander) + (crossing ? Math.PI / 2 + rad(between(rb, -8, 8)) : 0);
        const len = 2 * frame.halfW * between(rb, 0.55, 1.05) * (crossing ? 0.5 : 1) * k;
        // the first beam crosses the anchor; the rest fan out to either side
        const side = i % 2 === 0 ? 1 : -1;
        const off = (i === 0
          ? (rb() - 0.5) * anchor.r * 1.1
          : side * (anchor.r * 0.5 + between(rb, 0.15, 0.62) * frame.halfH)) * sp;
        const along = (rb() - 0.5) * 0.35 * len * sp;
        const cx = anchor.x + axis.x * along + normal.x * off;
        const cy = anchor.y + axis.y * along + normal.y * off;
        // out-of-plane tilt makes some beams recede, so their ends differ in depth
        const tilt = ctx.snapRotation || rb() < 0.5 ? 0 : (rb() < 0.5 ? -1 : 1) * rad(between(rb, 5, 16));
        const roll = ctx.snapRotation
          ? Math.round(between(rb, 0, 4)) * (Math.PI / 4)
          : rad(between(rb, 20, 55)) * (rb() < 0.5 ? -1 : 1);
        // a real beam is chunkier than a stand-in box, but the references' beams are still 6-20 times as long as thick
        const t = H * between(rb, 0.028, 0.075) * k * (type === T.beam ? 1.25 : 1);
        // (the draws below happen in this order for every type: changing it changes existing compositions)
        /** @type {[number, number, number]} */
        let scale;
        if (type === T.plane) {
          scale = scaleFor(ctx, type, len, H * between(rb, 0.07, 0.16) * k, H * between(rb, 0.008, 0.016));
        } else {
          const f = between(rb, 0.7, 1.6);
          scale = scaleFor(ctx, type, len, t, t * (type === T.beam ? Math.min(f, 1.2) : f));
        }
        // depth bands: most beams in front of the anchor, a few behind it
        const front = rb() < 0.65;
        const depth = front ? between(rb, 0.8, 1.6) + 0.55 * i : -(between(rb, 0.7, 1.3) + 0.4 * i);
        // tone: opposite the anchor's, so the diagonal reads against the mass
        const hex = i === 0
          ? pick(anchorIsDark ? light : dark, rb)
          : pick(neutrals.filter((h) => h !== anchorHex).length ? neutrals.filter((h) => h !== anchorHex) : neutrals, rb);
        items.push({
          type, role: crossing ? 'connector' : 'support', x: cx, y: cy, depth,
          orientation: barOrientation(screenDirection(basis, ang, tilt), roll), scale, hex
        });
      }
    }

    // --- accents: small, in the one accent hue, in front --------------------
    const accentTypes = /** @type {Array<[string, number]>} */ ([
      [T.triangle, 0.35], [T.plane, 0.25], [T.cube, 0.2], [T.circle, 0.2], [T.segment, 0.15], [T.crescent, 0.15]
    ]).filter(([t]) => has(t));
    if (accentTypes.length) {
      const rc0 = R('accent-count');
      const n = 2 + (rc0() < 0.4 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const r = R('accent', i);
        const type = /** @type {string} */ (pickWeighted(r, accentTypes));
        const k = sizeMult(ctx, type, r);
        const sp = spreadOf(ctx, type);
        // accents stay well under the anchor in size (hierarchy), whatever the size multiplier
        const s = Math.min(H * between(r, 0.05, 0.16) * k, anchorSize * 0.34);
        const along = (r() < 0.5 ? -1 : 1) * between(r, 0.28, 0.85) * frame.halfW * sp;
        const off = (r() < 0.5 ? -1 : 1) * between(r, 0.0, 0.42) * frame.halfH * sp;
        const x = anchor.x + axis.x * along + normal.x * off;
        const y = anchor.y + axis.y * along + normal.y * off;
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
        items.push({ type, role: 'accent', x, y, depth: between(r, 2.1, 3.2) + 0.2 * i, orientation, scale, hex: accentOrInk });
      }
    }

    // --- hairlines: details that run on past the masses -----------------------
    // a hairline is a rod, else a thin box or plank, else (with only beams enabled) a very thin beam
    const detailType = [T.rod, T.block, T.plane, T.beam].find(has);
    if (detailType) {
      const rd0 = R('detail-count');
      const n = 1 + (rd0() < 0.45 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const r = R('detail', i);
        const k = sizeMult(ctx, detailType, r);
        const sp = spreadOf(ctx, detailType);
        const across = r() < 0.25;
        const ang = theta + (across ? Math.PI / 2 : rad(between(r, -3, 3)));
        const len = 2 * frame.halfW * between(r, 0.45, 0.9) * k;
        const off = (r() < 0.5 ? -1 : 1) * between(r, 0.08, 0.55) * frame.halfH * sp;
        const along = (r() - 0.5) * 0.4 * len * sp;
        const x = anchor.x + axis.x * along + normal.x * off;
        const y = anchor.y + axis.y * along + normal.y * off;
        const w = H * between(r, 0.008, 0.016) * k;
        const tilt = ctx.snapRotation ? 0 : rad(between(r, -6, 6));
        // a hairline is ink, or (occasionally) the accent, as in the references' red lines
        const hex = accentHue && r() < 0.3 ? accentHue : ctx.ink;
        items.push({
          type: detailType, role: 'detail', x, y, depth: frontBiasedDepth(between(r, HAIRLINE_BACK, HAIRLINE_FRONT)),
          orientation: barOrientation(screenDirection(basis, ang, tilt), rad(between(r, 0, 90))),
          scale: scaleFor(ctx, detailType, len, w, w), hex
        });
      }
    }
    // --- outlines: thin open forms that cross the masses ---------------------
    // A frame (long side along the axis, mostly) or a partial ring around the
    // anchor, drawn in the accent hue or ink, or in a light neutral when they
    // would vanish against a dark anchor (the white frames over the black disc
    // of the references). They do not collide: they cross other forms on purpose.
    [T.frame, T.ring].filter(has).forEach((type, oi) => {
      const r = R('outline', oi);
      if (r() >= 0.75) return; // not every scene has one
      const k = sizeMult(ctx, type, r);
      const sp = spreadOf(ctx, type);
      const he = /** @type {import('../../types.js').ShapeDef} */ (ctx.shapes.get(type)).localHalfExtents;
      const wantAccent = r() < 0.5;
      const hex = wantAccent && accentHue && anchorHex !== accentHue
        ? accentHue
        : (anchorIsDark ? light[light.length - 1] : ctx.ink);
      const thickness = H * 0.01;
      const depth = r() < 0.75 ? between(r, 3.3, 4.5) : -between(r, 2.0, 3.0);
      if (type === T.ring) {
        const d = H * between(r, 0.7, 1.25) * k;
        items.push({
          type, role: 'detail', depth, hex,
          x: anchor.x + (r() - 0.5) * 0.35 * frame.halfW * sp,
          y: anchor.y + (r() - 0.5) * 0.35 * frame.halfH * sp,
          orientation: flatOrientation(basis, ctx.billboard, between(r, 0, 2 * Math.PI)),
          scale: scaleFor(ctx, type, d, d, thickness)
        });
      } else {
        const across = r() < 0.2;
        const ang = theta + (across ? Math.PI / 2 : rad(between(r, -6, 6)));
        const len = 2 * frame.halfW * between(r, 0.4, 0.8) * k;
        const off = (r() < 0.5 ? -1 : 1) * between(r, 0.0, 0.5) * frame.halfH * sp;
        const along = (r() - 0.5) * 0.3 * len * sp;
        items.push({
          type, role: 'detail', depth, hex,
          x: anchor.x + axis.x * along + normal.x * off,
          y: anchor.y + axis.y * along + normal.y * off,
          orientation: flatOrientation(basis, ctx.billboard, ang),
          scale: scaleFor(ctx, type, len, len * he.y / he.x, thickness) // uniform: the frame keeps its proportions
        });
      }
    });
    return items;
  }
};
