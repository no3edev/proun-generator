// @ts-check
import * as THREE from 'three';
import { CAMERA, ORIENTATIONS } from '../../config/defaults.js';

// Shared building blocks for composition strategies. A strategy composes in
// SCREEN space (where the picture is judged) and this module lifts the
// result into the scene. The camera is fixed and orthographic, so a point's
// place on screen is independent of its depth: a strategy can place things
// exactly where it wants them in the frame, and the depth solver (which only
// slides shapes along the view axis) can never disturb that.

/**
 * The visible frame in screen units (the camera's frustum), for an
 * orientation name. Unknown / missing orientation -> landscape.
 * @param {string | undefined} orientation
 */
export function frameFor(orientation) {
  const dims = (orientation && ORIENTATIONS[/** @type {keyof typeof ORIENTATIONS} */ (orientation)]) || ORIENTATIONS.landscape;
  const halfH = CAMERA.frustumSize / 2;
  return { halfW: halfH * (dims.w / dims.h), halfH };
}

/**
 * The camera's screen basis, derived exactly as a lookAt() camera at
 * `depthAxis` (looking at the origin, y up) derives it. Pure: no camera object.
 * @param {THREE.Vector3} depthAxis unit vector from the origin toward the camera
 */
export function screenBasis(depthAxis) {
  const right = new THREE.Vector3(0, 1, 0).cross(depthAxis).normalize();
  const up = depthAxis.clone().cross(right).normalize();
  return { right, up, depth: depthAxis.clone().normalize() };
}

/**
 * A screen point (+ a depth along the view axis, positive toward the camera)
 * as a scene position.
 * @param {ReturnType<typeof screenBasis>} basis
 * @param {number} x
 * @param {number} y
 * @param {number} depth
 */
export function lift(basis, x, y, depth) {
  return new THREE.Vector3()
    .addScaledVector(basis.right, x)
    .addScaledVector(basis.up, y)
    .addScaledVector(basis.depth, depth);
}

/**
 * The world direction whose projection on screen points at `angle` (radians,
 * counter-clockwise from screen-right), tilted `tilt` radians out of the
 * screen plane (positive = toward the camera).
 * @param {ReturnType<typeof screenBasis>} basis
 * @param {number} angle
 * @param {number} [tilt]
 */
export function screenDirection(basis, angle, tilt = 0) {
  return new THREE.Vector3()
    .addScaledVector(basis.right, Math.cos(angle) * Math.cos(tilt))
    .addScaledVector(basis.up, Math.sin(angle) * Math.cos(tilt))
    .addScaledVector(basis.depth, Math.sin(tilt))
    .normalize();
}

/**
 * Orientation of a bar: its local x axis along `direction`, then rolled
 * about that axis. The roll decides which of the bar's faces the camera sees.
 * @param {THREE.Vector3} direction unit vector
 * @param {number} roll radians
 */
export function barOrientation(direction, roll) {
  const align = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction);
  const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), roll);
  return align.multiply(spin);
}

/**
 * Orientation of a flat form (facing the camera) turned by `angle` in the
 * picture plane.
 * @param {THREE.Quaternion} billboard the camera-facing orientation
 * @param {number} angle
 */
export function flatOrientation(billboard, angle) {
  const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);
  return billboard.clone().multiply(spin);
}

/**
 * Orientation of a world-aligned block turned about the view axis so that its
 * nearest projected edge direction lies along `angle` on screen. An unturned
 * block already shows three faces to the oblique camera; turning it about the
 * view axis only rotates the picture, so it keeps showing three.
 * @param {ReturnType<typeof screenBasis>} basis
 * @param {number} angle radians
 */
export function blockOrientation(basis, angle) {
  let best = 0;
  let bestAbs = Infinity;
  for (const e of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]) {
    const a = Math.atan2(e.dot(basis.up), e.dot(basis.right));
    // edges are undirected: compare modulo pi, to within (-pi/2, pi/2]
    let d = (angle - a) % Math.PI;
    if (d > Math.PI / 2) d -= Math.PI;
    if (d <= -Math.PI / 2) d += Math.PI;
    if (Math.abs(d) < bestAbs) { bestAbs = Math.abs(d); best = d; }
  }
  return new THREE.Quaternion().setFromAxisAngle(basis.depth, best);
}

// --- colour ----------------------------------------------------------

const SATURATED_FROM = 0.5; // HSL saturation at or above which a colour counts as a saturated accent hue

/** @param {string} hex */
export function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

/** Relative luminance (Rec. 601 weights, 0..1): good enough to rank tones. @param {string} hex */
export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/**
 * Splits a palette's accents into saturated hues (candidates for the scene's
 * single accent) and neutrals (greys, tans, browns, creams: free to vary),
 * the neutrals ordered dark -> light. Neutrals indistinguishable from the
 * paper are set aside unless nothing else is left.
 * @param {{ accents: string[], paper?: string }} palette
 */
export function splitPalette(palette) {
  const saturated = palette.accents.filter((h) => hexToHsl(h).s >= SATURATED_FROM);
  const all = palette.accents.filter((h) => !saturated.includes(h)).sort((a, b) => luminance(a) - luminance(b));
  const paperL = palette.paper ? luminance(palette.paper) : null;
  const apart = paperL === null ? all : all.filter((h) => Math.abs(luminance(h) - paperL) >= 0.09);
  return { saturated, neutrals: apart.length ? apart : all };
}

// --- small helpers ---------------------------------------------------

/**
 * One item from [value, weight] pairs.
 * @template T
 * @param {() => number} rng
 * @param {Array<[T, number]>} options
 * @returns {T | null}
 */
export function pickWeighted(rng, options) {
  const total = options.reduce((a, [, w]) => a + w, 0);
  if (!(total > 0)) return null;
  let r = rng() * total;
  for (const [v, w] of options) {
    r -= w;
    if (r < 0) return v;
  }
  return options[options.length - 1][0];
}

/** @param {() => number} rng @param {number} a @param {number} b */
export const between = (rng, a, b) => a + (b - a) * rng();
export const rad = (/** @type {number} */ deg) => (deg * Math.PI) / 180;
