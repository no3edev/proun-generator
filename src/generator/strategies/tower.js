// @ts-check
import { pickWeighted, between, rad } from './common.js';
import { T, spreadOf, frontBiasedDepth, HAIRLINE_BACK, HAIRLINE_FRONT } from './shared.js';
import { makeKit } from './assemblyKit.js';

/** @typedef {import('./run.js').PlanItem} PlanItem */
/** @typedef {import('./run.js').Strategy} Strategy */

// TOWER. One upright (or nearly upright) stack of slabs and blocks that climbs off the frame: segments laid end to end along a near-vertical axis,
// each a little wider or narrower than the one below and stepped to one side or the other, so it reads as a built thing and not a column; a black
// slot beside it; a tall pale plane floating off to one side with a small bar and a mark on it (the shadow plane of the tower lithograph); long
// hairlines running parallel to the stack and one slanting across it; sometimes a single small accent in the one chromatic hue.
//
// From the reference study: the tower lithograph is a stepped vertical assembly, off-centre, with a floating pale plane and slanted hairlines,
// the rest bare paper. The older strategies thrust along 12-60 degrees and cannot make this; here the axis is 90 degrees, leaning at most 7.

/** depth between neighbouring segments: more than a block's thickness plus the solver's margin, so the stack is already apart when it arrives (depth never moves a form on screen) */
const STEP = 0.8;

/** @type {Strategy} */
export const tower = {
  label: 'Tower',
  uses: [T.block, T.plane, T.beam, T.cube, T.rod, T.triangle, T.circle],

  plan(ctx) {
    const K = makeKit(ctx, 'tower');
    const { H, R, has, bar, accentHue, neutrals, dark, light, pick } = K;
    const { frame } = ctx;
    /** @type {PlanItem[]} */
    const items = [];

    // --- the axis and where the tower stands ---------------------------------
    const ra = R('axis');
    const theta = Math.PI / 2 + rad(between(ra, -7, 7));
    const axis = { x: Math.cos(theta), y: Math.sin(theta) };
    const normal = { x: -axis.y, y: axis.x };
    const c0 = { x: -between(ra, 0.0, 0.34) * frame.halfW, y: (ra() - 0.5) * 0.12 * frame.halfH };
    const Ltot = H * between(ra, 1.02, 1.3);
    const n = 5 + Math.floor(ra() * 3); // 5..7 segments
    const Wb = H * between(ra, 0.075, 0.13) * Math.min(1, frame.halfW / frame.halfH * 1.15); // narrower in a portrait frame
    /** @type {Array<[string, number]>} */
    const boxChoices = [[T.block, 0.5], [T.plane, 0.3], [T.beam, 0.15], [T.cube, 0.05]];
    /** @type {Array<[string, number]>} */
    const beadChoices = [[T.triangle, 0.5], [T.circle, 0.3], [T.rod, 0.2]];
    const stackTypes = (K.boxTypes.length ? boxChoices : beadChoices).filter(([t]) => has(t));

    // --- the stack ------------------------------------------------------------
    let anchorI = 0;
    if (stackTypes.length) {
      const weights = Array.from({ length: n }, (_, i) => 0.55 + R('segw', i)());
      const sum = weights.reduce((a, b) => a + b, 0);
      // the widest segment is the anchor: the stack's mass
      const widths = Array.from({ length: n }, (_, i) => Wb * between(R('segwid', i), 0.55, 1.5) * (i === 0 ? 1.25 : 1));
      anchorI = widths.indexOf(Math.max(...widths));
      let s = 0;
      for (let i = 0; i < n; i++) {
        const r = R('seg', i);
        const type = /** @type {string} */ (pickWeighted(r, stackTypes));
        const L = Ltot * weights[i] / sum;
        const mid = s + L / 2 - Ltot / 2; s += L;
        const off = (i === 0 ? 0 : (r() < 0.55 ? -1 : 1) * between(r, 0.05, 0.55) * widths[i]) + (r() - 0.5) * 0.1 * widths[i];
        const hex = i === anchorI ? pick(dark, r) : (i % 2 === 0 ? pick(dark, r) : pick(light, r));
        items.push(bar({
          type, cx: c0.x + axis.x * mid + normal.x * off, cy: c0.y + axis.y * mid + normal.y * off, ang: theta + rad(between(r, -1.5, 1.5)), len: L * 1.02, wid: widths[i],
          depth: (i - anchorI) * STEP + (r() - 0.5) * 0.08, hex, role: i === anchorI ? 'anchor' : 'support', rng: r, origin: c0
        }));
      }
      // the black slot beside the stack: a thin dark bar against its face
      const rs = R('slot');
      const slotType = [T.plane, T.block, T.beam].find(has);
      if (slotType) {
        items.push(bar({
          type: slotType, cx: c0.x + normal.x * Wb * between(rs, 0.5, 0.9) + axis.x * Ltot * between(rs, -0.15, 0.15), cy: c0.y + normal.y * Wb * between(rs, 0.5, 0.9) + axis.y * Ltot * between(rs, -0.15, 0.15),
          ang: theta, len: Ltot * between(rs, 0.3, 0.55), wid: Wb * between(rs, 0.12, 0.22), depth: (n - 1 - anchorI) * STEP + 0.7, hex: K.ink, role: 'support', rng: rs, origin: c0
        }));
      }
      // the floating pale plane off to the side, with a bar and a mark on it
      const rf = R('float');
      const floatType = [T.plane, T.block].find(has);
      const side = c0.x < 0 || rf() < 0.7 ? 1 : -1;
      if (floatType) {
        const fl = Ltot * between(rf, 0.32, 0.5);
        const fc = { x: c0.x + side * frame.halfW * between(rf, 0.55, 0.85), y: c0.y + between(rf, 0.05, 0.25) * H };
        items.push(bar({ type: floatType, cx: fc.x, cy: fc.y, ang: theta + rad(between(rf, -2, 2)), len: fl, wid: Wb * between(rf, 0.8, 1.2), depth: -(anchorI * STEP) - 0.9, hex: light[light.length - 1], role: 'support', rng: rf, origin: c0 }));
        if (K.detailType) {
          const rb = R('mark');
          items.push(bar({ type: K.detailType, cx: fc.x - side * Wb * 0.2, cy: fc.y + fl * between(rb, 0.05, 0.3), ang: theta + rad(between(rb, 50, 70)), len: H * between(rb, 0.07, 0.13), wid: H * 0.012, depth: -(anchorI * STEP) - 0.2, hex: K.ink, role: 'detail', rng: rb, origin: c0, noSize: true }));
        }
      }
    }

    // --- hairlines: parallel to the stack, and one slanting across it -------------
    if (K.detailType) {
      const nd = 2 + (R('detail-count')() < 0.4 ? 1 : 0);
      for (let i = 0; i < nd; i++) {
        const r = R('detail', i);
        const slant = i === nd - 1;
        const ang = slant ? theta + (r() < 0.5 ? -1 : 1) * rad(between(r, 28, 42)) : theta + rad(between(r, -2.5, 2.5));
        const len = H * between(r, slant ? 0.7 : 0.9, slant ? 1.1 : 1.35);
        const off = (r() < 0.5 ? -1 : 1) * between(r, 0.7, 2.2) * Wb * spreadOf(ctx, K.detailType);
        const along = (r() - 0.5) * 0.4 * len;
        items.push(bar({
          type: K.detailType, cx: c0.x + axis.x * along + normal.x * off, cy: c0.y + axis.y * along + normal.y * off, ang, len, wid: H * between(r, 0.008, 0.015),
          depth: frontBiasedDepth(between(r, HAIRLINE_BACK, HAIRLINE_FRONT)), hex: accentHue && r() < 0.25 ? accentHue : K.ink, role: 'detail', rng: r, origin: c0, noSize: true
        }));
      }
    }

    // --- a single small accent, in the one chromatic hue ---------------------------
    const accentTypes = [T.triangle, T.circle, T.block].filter(has);
    if (accentHue && accentTypes.length && K.accentChance < 0.6) {
      const r = R('accent');
      const accentType = accentTypes[Math.floor(r() * accentTypes.length)];
      const e = H * between(r, 0.05, 0.1);
      items.push(bar({
        type: accentType, cx: c0.x + normal.x * Wb * between(r, 0.9, 1.8) * (r() < 0.5 ? -1 : 1) + axis.x * Ltot * between(r, 0.05, 0.4), cy: c0.y + axis.y * Ltot * between(r, 0.05, 0.4),
        ang: theta + (r() < 0.5 ? 0 : Math.PI / 2), len: e * 1.5, wid: e, depth: (n - 1 - anchorI) * STEP + between(r, 1.2, 1.8), hex: accentHue, role: 'accent', rng: r, origin: c0
      }));
    }
    void neutrals;
    return items;
  }
};
