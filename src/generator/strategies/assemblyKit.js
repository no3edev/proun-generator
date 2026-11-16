// @ts-check
import * as THREE from 'three';
import { createRng } from '../rng.js';
import { screenDirection, barOrientation, flatOrientation, blockOrientation, luminance, between, rad } from './common.js';
import { T, sizeMult, spreadOf, scaleFor } from './shared.js';

/** @typedef {import('./run.js').PlanItem} PlanItem */
/** @typedef {import('./run.js').PlanContext} PlanContext */

// Shared tools of the assembly strategies (tower, cross, mass): the ones that compose upright or orthogonal forms laid edge to edge, the way
// the references' stepped blocks and crossed bars are. Like the older strategies they compose in screen space and every random draw comes from a
// stream keyed by (seed, strategy, label, i), so adding or removing one element never changes another.

/**
 * @param {PlanContext} ctx
 * @param {string} name the strategy's stream name
 */
export function makeKit(ctx, name) {
  const { seed, frame, basis, colors } = ctx;
  const H = frame.halfH * 2;
  const R = (/** @type {string} */ label, /** @type {number} */ i = 0) => createRng(seed, name, label, i);
  const has = (/** @type {string} */ t) => ctx.shapes.has(t);

  // colour plan: one chromatic accent, everything else neutral (as in the other strategies)
  const rc = R('colour');
  const accentHue = colors.saturated.length ? colors.saturated[Math.floor(rc() * colors.saturated.length)] : null;
  const neutrals = colors.neutrals.length ? colors.neutrals : [ctx.ink];
  const dark = neutrals.slice(0, Math.max(1, Math.ceil(neutrals.length / 2)));
  const light = neutrals.slice(Math.floor(neutrals.length / 2));
  const pick = (/** @type {string[]} */ list, /** @type {() => number} */ rng) => list[Math.floor(rng() * list.length)];
  const accentChance = rc(); // one draw, kept at a fixed place in the colour stream

  /** the box-like types a stack, mass or bar can be made of */
  const boxTypes = [T.block, T.plane, T.beam, T.cube].filter(has);
  /** a hairline is a rod, else a thin box or plank, else (with only beams enabled) a very thin beam */
  const detailType = [T.rod, T.block, T.plane, T.beam].find(has) || null;

  /**
   * One bar-like form: `len` long on screen along `ang`, `wid` wide, centred at (cx, cy). Planes lie flat to the camera; blocks and beams
   * are bars rolled to show their side faces (or in 45-degree steps with snapRotation); a rod is a hairline; a triangle or a segment lies flat;
   * a circle takes `wid` as its diameter; a fixed cube takes `wid` as its edge. Size and spread settings are applied here: the form's own size
   * multiplier scales it, and spread moves it from `origin` (the composition's centre).
   * @param {{ type: string, cx: number, cy: number, ang: number, len: number, wid: number, depth: number, hex: string, role: string, rng: () => number,
   *           origin?: { x: number, y: number }, tilt?: number, thick?: number, noSize?: boolean }} o
   * @returns {PlanItem}
   */
  function bar(o) {
    const { type, rng } = o;
    // the draws are the same for every type, in this order (changing it changes existing compositions)
    const k = o.noSize ? 1 : sizeMult(ctx, type, rng);
    const rollDraw = rng(), signDraw = rng(), depthDraw = rng(), tiltDraw = rng();
    const sp = spreadOf(ctx, type);
    const org = o.origin || { x: o.cx, y: o.cy };
    const x = org.x + (o.cx - org.x) * sp, y = org.y + (o.cy - org.y) * sp;
    const len = o.len * k, wid = o.wid * k;
    const tilt = o.tilt !== undefined ? o.tilt : (ctx.snapRotation || tiltDraw < 0.6 ? 0 : (tiltDraw < 0.8 ? -1 : 1) * rad(5 + 8 * rollDraw));
    const roll = ctx.snapRotation ? Math.round(rollDraw * 4) * (Math.PI / 4) : rad(20 + 35 * rollDraw) * (signDraw < 0.5 ? -1 : 1);
    /** @type {[number, number, number]} */
    let scale;
    let orientation;
    if (type === T.plane) {
      scale = scaleFor(ctx, type, len, wid, H * 0.012);
      orientation = flatOrientation(basis, ctx.billboard, o.ang);
    } else if (type === T.triangle || type === T.segment) {
      scale = scaleFor(ctx, type, len, wid, Math.min(len, wid) * 0.25);
      orientation = flatOrientation(basis, ctx.billboard, o.ang);
    } else if (type === T.circle) {
      scale = scaleFor(ctx, type, wid, wid, 1); scale[2] = 1;
      orientation = new THREE.Quaternion();
    } else if (type === T.cube) {
      scale = scaleFor(ctx, type, wid, wid, wid);
      orientation = blockOrientation(basis, o.ang);
    } else { // block, beam, rod
      // thickness along the view: like the form's width, but never more than a slab (H * 0.08): a thick block needs a wide depth gap from its neighbours, and a stack or a mass is dozens of them
      const d = o.thick !== undefined ? o.thick : Math.min(wid, H * 0.08) * (0.6 + 0.5 * depthDraw);
      scale = scaleFor(ctx, type, len, wid, d);
      orientation = barOrientation(screenDirection(basis, o.ang, tilt), roll);
    }
    return { type, role: o.role, x, y, depth: o.depth, orientation, scale, hex: o.hex };
  }

  return { H, R, has, accentHue, accentChance, neutrals, dark, light, pick, boxTypes, detailType, bar, ink: ctx.ink, luminance, between, rad };
}
