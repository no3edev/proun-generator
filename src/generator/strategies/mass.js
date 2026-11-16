// @ts-check
import { pickWeighted, between, rad } from './common.js';
import { T, frontBiasedDepth, HAIRLINE_BACK, HAIRLINE_FRONT } from './shared.js';
import { makeKit } from './assemblyKit.js';

/** @typedef {import('./run.js').PlanItem} PlanItem */
/** @typedef {import('./run.js').Strategy} Strategy */

// MASS. A compact assembly: boxes and slabs laid against one another on a grid that is turned as a whole (0 to 60 degrees, either way), so that
// they read as one built mass: stepped, L-shaped, one block sitting against the side of the next. Behind it, a great disc or a large dark plane
// (the anchor); across it one long beam; beside it a few thin parallel slats; low in the frame a small pair of blocks; and a hairline or two.
//
// From the reference study: the graphite box, the lithograph of boxes laid across a disc, the long diagonal of stepped blocks, the Proun of boxes
// on a pale ground: a dense heart, a lot of empty ground, everything on one turned grid.

/** depth between successive boxes of the assembly (see tower.js) */
const STEP = 0.8;

/** the share of scenes with a pale backdrop */
const PALE_BACKDROP = 0.45;

const GRIDS = /** @type {Array<[number, number]>} */ ([[0, 0.18], [14, 0.12], [28, 0.14], [40, 0.16], [52, 0.12], [62, 0.08], [-16, 0.08], [-32, 0.08], [-46, 0.04]]);

/** @type {Strategy} */
export const mass = {
  label: 'Mass',
  uses: [T.circle, T.block, T.plane, T.beam, T.rod, T.triangle],

  plan(ctx) {
    const K = makeKit(ctx, 'mass');
    const { H, R, has, bar, accentHue, dark, light, neutrals, pick } = K;
    const { frame } = ctx;
    /** @type {PlanItem[]} */
    const items = [];
    const rg = R('grid');
    const phi = rad(/** @type {number} */ (pickWeighted(rg, GRIDS)));
    const u = { x: Math.cos(phi), y: Math.sin(phi) }, v = { x: -u.y, y: u.x };
    const c0 = { x: (rg() - 0.5) * 0.3 * frame.halfW, y: between(rg, 0.02, 0.18) * frame.halfH };
    const origin = c0;
    const at = (/** @type {number} */ du, /** @type {number} */ dv) => ({ x: c0.x + u.x * du + v.x * dv, y: c0.y + u.y * du + v.y * dv });

    // --- the backdrop: a great disc or a large dark plane (the anchor) ------------------
    const rd = R('backdrop');
    const flatBox = /** @type {string | undefined} */ ([T.plane, T.block].find(has));
    const useDisc = has(T.circle) && (rd() < 0.5 || !flatBox);
    const bd = at((rd() - 0.5) * 0.1 * H, (rd() - 0.5) * 0.1 * H);
    // a PALE backdrop in some scenes (the lightest neutral, in front of which the dark assembly stands out): the great pale disc of the lithograph, the pale box with
    // a black slot. Its own stream, so no other draw moves; the old colour logic still runs and is overridden.
    const pale = R('backdrop-tone')() < PALE_BACKDROP;
    const lightest = light[light.length - 1];
    if (useDisc) {
      const d = H * between(rd, 0.6, 0.95);
      const hex = rd() < 0.5 ? pick(light, rd) : pick(dark, rd);
      items.push(bar({ type: T.circle, cx: bd.x, cy: bd.y, ang: 0, len: d, wid: d, depth: -2.4, hex: pale ? lightest : hex, role: 'anchor', rng: rd, origin }));
      // a pale disc on paper is nearly invisible: in most such scenes it sits on a dark field, as the lithograph's disc does (a large flat plane, behind everything)
      if (pale && has(T.plane)) {
        const rfl = R('field');
        if (rfl() < 0.7) {
          items.push(bar({ type: T.plane, cx: bd.x, cy: bd.y, ang: 0, len: 2 * frame.halfW * between(rfl, 0.78, 0.9), wid: H * between(rfl, 0.7, 0.82), depth: -3.4, hex: dark[Math.min(1, dark.length - 1)], role: 'support', rng: rfl, origin, noSize: true }));
        }
      }
    } else if (flatBox) {
      items.push(bar({ type: flatBox, cx: bd.x, cy: bd.y, ang: phi, len: H * between(rd, 0.5, 0.8), wid: H * between(rd, 0.35, 0.55), depth: -2.4, hex: pale ? lightest : dark[0], role: 'anchor', rng: rd, origin }));
    }
    const backdropHex = pale && (useDisc || flatBox) ? lightest : null;

    // --- the assembly: rectangles laid edge to edge on the turned grid ----------------
    const boxTypes = /** @type {Array<[string, number]>} */ ([[T.block, 0.6], [T.plane, 0.3], [T.beam, 0.1]]).filter(([t]) => has(t));
    if (boxTypes.length) {
      const m = 4 + Math.floor(R('count')() * 3); // 4..6
      /** @type {Array<{ du: number, dv: number, hu: number, hv: number, hex: string }>} */
      const placed = [];
      for (let i = 0; i < m; i++) {
        const r = R('rect', i);
        let hu = H * between(r, i === 0 ? 0.09 : 0.04, i === 0 ? 0.16 : 0.14), hv = H * between(r, i === 0 ? 0.07 : 0.03, i === 0 ? 0.13 : 0.11);
        if (i > 0 && r() < 0.35) [hu, hv] = [hv, hu];
        let du = 0, dv = 0, hex;
        if (i === 0) { hex = pick(dark, r); du = (r() - 0.5) * 0.06 * H; dv = (r() - 0.5) * 0.06 * H; }
        else {
          const p = placed[Math.floor(r() * placed.length)];
          const side = Math.floor(r() * 4); // +u -u +v -v
          const alongU = side < 2, sgn = side % 2 === 0 ? 1 : -1;
          if (alongU) { du = p.du + sgn * (p.hu + hu) * 0.97; dv = p.dv + (r() * 2 - 1) * 0.7 * p.hv; }
          else { dv = p.dv + sgn * (p.hv + hv) * 0.97; du = p.du + (r() * 2 - 1) * 0.7 * p.hu; }
          // on a pale backdrop the boxes keep clear of its colour (they would vanish into it)
          const pool = neutrals.filter((h) => h !== p.hex && h !== backdropHex);
          hex = pick(pool.length ? pool : neutrals, r);
        }
        placed.push({ du, dv, hu, hv, hex });
        const pos = at(du, dv);
        items.push(bar({
          type: /** @type {string} */ (pickWeighted(r, boxTypes)), cx: pos.x, cy: pos.y, ang: phi, len: 2 * hu, wid: 2 * hv, depth: STEP * i - 0.9 + (r() - 0.5) * 0.06, hex,
          role: i === 0 && !items.length ? 'anchor' : 'support', rng: r, origin
        }));
      }
      // thin parallel slats beside the mass
      const slatType = [T.plane, T.beam, T.block].find(has);
      if (slatType) {
        const ns = 2 + (R('slat-count')() < 0.4 ? 1 : 0);
        for (let i = 0; i < ns; i++) {
          const r = R('slat', i);
          const p = at(between(r, -0.3, 0.3) * H, between(r, 0.12, 0.3) * H * (i % 2 === 0 ? 1 : -1));
          items.push(bar({ type: slatType, cx: p.x, cy: p.y, ang: phi + (r() < 0.25 ? Math.PI / 2 : 0), len: H * between(r, 0.12, 0.28), wid: H * between(r, 0.012, 0.022), depth: STEP * (m + 1) - 0.9, hex: light[light.length - 1], role: 'support', rng: r, origin }));
        }
      }
      // one long beam across the assembly
      const longType = [T.beam, T.block, T.plane].find(has);
      if (longType) {
        const r = R('long');
        const p = at(between(r, -0.1, 0.1) * H, (r() < 0.5 ? -1 : 1) * between(r, 0.08, 0.28) * H);
        items.push(bar({ type: longType, cx: p.x, cy: p.y, ang: phi + (r() < 0.2 ? Math.PI / 2 : 0), len: 2 * frame.halfW * between(r, 0.6, 0.95), wid: H * between(r, 0.03, 0.055), depth: STEP * (m + 2) - 0.9, hex: pick(neutrals, r), role: 'connector', rng: r, origin }));
      }
    }

    // --- a small pair of blocks low in the frame ---------------------------------------
    const lowType = [T.block, T.plane].find(has);
    if (lowType) {
      const r0 = R('low');
      const sx = r0() < 0.6 ? -1 : 1;
      for (let i = 0; i < 2; i++) {
        const r = R('low-block', i);
        items.push(bar({
          type: lowType, cx: sx * frame.halfW * (0.55 - 0.1 * i + between(r, -0.08, 0.08)), cy: -frame.halfH + H * (0.1 + 0.03 * i), ang: phi, len: H * between(r, 0.07, 0.12), wid: H * between(r, 0.06, 0.1),
          depth: 0.7 * i, hex: i === 0 ? pick(dark, r) : pick(light, r), role: 'support', rng: r, origin
        }));
      }
    }

    // --- hairlines ---------------------------------------------------------------------
    if (K.detailType) {
      const nd = 1 + (R('detail-count')() < 0.45 ? 1 : 0);
      for (let i = 0; i < nd; i++) {
        const r = R('detail', i);
        const p = at(between(r, -0.3, 0.3) * H, (r() < 0.5 ? -1 : 1) * between(r, 0.3, 0.6) * H);
        items.push(bar({ type: K.detailType, cx: p.x, cy: p.y, ang: phi + (r() < 0.3 ? Math.PI / 2 : rad(between(r, -3, 3))), len: H * between(r, 0.5, 1.0), wid: H * between(r, 0.008, 0.015), depth: frontBiasedDepth(between(r, HAIRLINE_BACK, HAIRLINE_FRONT)), hex: accentHue && r() < 0.3 ? accentHue : K.ink, role: 'detail', rng: r, origin, noSize: true }));
      }
    }

    // --- a single small accent -------------------------------------------------------------
    const accentType = [T.triangle, T.block, T.circle].find(has);
    if (accentHue && accentType && K.accentChance < 0.6) {
      const r = R('accent');
      const p = at(between(r, -0.25, 0.25) * H, between(r, -0.25, 0.25) * H);
      const e = H * between(r, 0.04, 0.09);
      items.push(bar({ type: accentType, cx: p.x, cy: p.y, ang: phi + (r() < 0.5 ? 0 : Math.PI / 2), len: e * 1.5, wid: e, depth: STEP * 8 + between(r, 0, 0.8), hex: accentHue, role: 'accent', rng: r, origin }));
    }
    return items;
  }
};
