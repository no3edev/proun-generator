// @ts-check
import * as THREE from 'three';
import { createRng } from '../generator/rng.js';

// THE GRAPHIC TONAL SYSTEM (Stage 4.1).
//
// The references do not shade by physical light. A solid's faces take one of two or three flat tones that were
// chosen for the picture: a "faceted" work (a cube at about 53 / 160 / 226 on the screen, 4.3:1), a "subtle" one
// (boxes within 1.1-1.4:1; the dark graphic shadow plane of Stage 4.2 does the work), a "pale" one (almost
// no dark at all). So here the tone of a face is not a function of a light direction but of the face's ROLE
// on screen, and the mode is a property of the SCENE, never of an object:
//
//   mode   chosen per scene from the seed, weighted by the composition strategy (MODE_MIX)
//   role   light (the face turned most to the top of the picture), dark (the face turned most to the left),
//          mid (the other one); decided from the solid's TARGET orientation, so a box that turns during
//          a change carries its tones with it, like painted faces
//   tone   a display-space factor per role (DISPLAY), turned into the linear multiplier a THREE.Color wants
//
// Only composition strategies are toned: the legacy generator keeps its fixed per-face tables (and so its
// pixels). Flat forms keep their cap/side tones, the sphere stays plain. Rods and beams are always subtle,
// whatever the scene's mode. When the mode changes between two compositions the old tone rides the colour
// front of the overpaint (see PigmentResponse.js), so nothing pops.

/** @typedef {'faceted' | 'subtle' | 'pale'} ToneMode */

/** @type {readonly ToneMode[]} */
export const TONE_MODES = ['faceted', 'subtle', 'pale'];

/**
 * Display-space factors [light, mid, dark] per mode. Light faces of pale colours clamp at white, which is what a
 * flat painted highlight does. Ratios (light : dark): faceted 3.0, subtle 1.21, pale 1.10.
 * @type {Record<ToneMode, [number, number, number]>}
 */
export const DISPLAY = {
  faceted: [1.18, 0.72, 0.39],
  subtle: [1.04, 0.95, 0.86],
  pale: [1.2, 1.15, 1.09]
};

/** The share of scenes in each mode, per strategy. Averaged over the three strategies: 40 / 45 / 15. */
export const MODE_MIX = /** @type {Record<string, Record<ToneMode, number>>} */ ({
  'axis-thrust': { faceted: 0.4, subtle: 0.45, pale: 0.15 },
  'disc-beams': { faceted: 0.2, subtle: 0.65, pale: 0.15 },
  'central-cluster': { faceted: 0.6, subtle: 0.25, pale: 0.15 }
});

/** Box-bodied types and whether they follow the scene's mode (false: always subtle). */
const BOXES = /** @type {Record<string, boolean>} */ ({ 'cube-fixed': true, 'cube-variable': true, plane: true, rod: false, beam: false });

/** A display-space factor as the linear multiplier THREE.Color.multiplyScalar needs (sRGB is about gamma 2.2). @param {number} f */
export const linearOf = (f) => Math.pow(f, 2.2);

/**
 * The tonal mode of a scene, a pure function of (seed, strategy). null under the legacy generator or an unknown strategy.
 * @param {number} seed @param {string} strategy
 * @returns {ToneMode | null}
 */
export function toneModeFor(seed, strategy) {
  const mix = MODE_MIX[strategy];
  if (!mix) return null;
  let r = createRng('tone-mode', strategy, seed)();
  for (const mode of TONE_MODES) {
    r -= mix[mode];
    if (r < 0) return mode;
  }
  return 'subtle';
}

/** does this shape type take part in the box tonal system */
export const hasBoxTone = (/** @type {string} */ type) => type in BOXES;

const NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((a) => new THREE.Vector3(...a));
const n = new THREE.Vector3();

/**
 * The face roles of a box seen from the fixed camera: for each of BoxGeometry's six faces (+x -x +y -y +z -z) 0 light,
 * 1 mid, 2 dark. Visible faces: the one turned most to the top is light; of the others the one turned most to the left is
 * dark, any remaining one mid. Faces turned away (they show while the box turns during a change) are mid.
 * @param {THREE.Quaternion} q the box's orientation
 * @param {{ right: THREE.Vector3, up: THREE.Vector3, depth: THREE.Vector3 }} view the camera's screen basis
 * @returns {number[]}
 */
export function faceRoles(q, view) {
  const roles = [1, 1, 1, 1, 1, 1];
  const vis = [];
  for (let i = 0; i < 6; i++) {
    n.copy(NORMALS[i]).applyQuaternion(q);
    if (n.dot(view.depth) > 0.02) vis.push({ i, up: n.dot(view.up), right: n.dot(view.right) });
  }
  if (!vis.length) return roles;
  vis.sort((a, b) => b.up - a.up);
  roles[vis[0].i] = 0;
  const rest = vis.slice(1).sort((a, b) => a.right - b.right); // most to the left first
  if (rest.length) roles[rest[0].i] = 2;
  for (let k = 1; k < rest.length; k++) roles[rest[k].i] = 1;
  return roles;
}

/** The darkest a face may show on screen (0..255 luma): the references' blacks are never pure black (about #272727). */
export const DARK_FLOOR = 32;
/** How far a dark colour may be lifted as a whole to keep its darkest face above DARK_FLOOR. */
export const LIFT_CAP = 2.5;

const tmp = new THREE.Color();
/** The displayed (sRGB) Rec.601 luma, 0..255, of `hex` multiplied by the linear multiplier `m` (clamped as the material clamps it). @param {string} hex @param {number} m */
function lumaAfter(hex, m) {
  tmp.set(hex).multiplyScalar(m);
  tmp.r = Math.min(1, tmp.r); tmp.g = Math.min(1, tmp.g); tmp.b = Math.min(1, tmp.b);
  const o = tmp.getHex();
  return 0.299 * ((o >> 16) & 255) + 0.587 * ((o >> 8) & 255) + 0.114 * (o & 255);
}
/** The linear multiplier that brings `hex` to the displayed luma `target` (bisection; a colour that cannot get that bright clamps). @param {string} hex @param {number} target */
function multiplierFor(hex, target) {
  let lo = 0, hi = 8;
  if (lumaAfter(hex, hi) <= target) return hi;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (lumaAfter(hex, mid) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The six per-face multipliers for a box-bodied solid, or null if the type has no box tone (flat forms, the sphere).
 * With the solid's colour (`hex`) the tones are exact on screen: each role's displayed luma is the colour's own times the mode's
 * factor (so faceted really is 3:1, whatever the hue), and a dark colour is lifted as a whole, up to LIFT_CAP, so its darkest face
 * does not fall below DARK_FLOOR. Without it, the factors are turned into multipliers by the sRGB gamma (about 2.2).
 * @param {string} type @param {ToneMode} mode @param {THREE.Quaternion} q
 * @param {{ right: THREE.Vector3, up: THREE.Vector3, depth: THREE.Vector3 }} view
 * @param {string} [hex] the solid's colour
 * @returns {number[] | null}
 */
export function faceShades(type, mode, q, view, hex) {
  if (!hasBoxTone(type)) return null;
  const factors = DISPLAY[BOXES[type] ? mode : 'subtle'];
  let perRole;
  if (hex) {
    const base = lumaAfter(hex, 1);
    const lift = base > 0 ? Math.min(LIFT_CAP, Math.max(1, DARK_FLOOR / (base * factors[2]))) : 1;
    perRole = factors.map((f) => multiplierFor(hex, Math.max(1, base * f * lift)));
  } else {
    perRole = factors.map(linearOf);
  }
  return faceRoles(q, view).map((role) => perRole[role]);
}
