// @ts-check
import * as THREE from 'three';
import { toneModeFor } from './tone.js';
import { createRng } from '../generator/rng.js';

// SELECTIVE HIGHLIGHTS (Stage 4.3).
//
// A major form of a faceted or subtle scene carries ONE narrow light edge strip on its up-left side, opposite the shadow plane's
// down-right: a flat tonal band, not a reflection (it follows no light). It is drawn in the form's own shader, so it needs no extra
// geometry, rides whatever colour the form is showing (a change of colour never leaves it behind) and costs nothing at rest on forms that
// have none (a uniform branch, like the overpaint).
//
//   who    the scene's anchor and its largest one or two other forms by projected area (the count is a seeded draw), among the types that
//          carry a shadow plane (triangles, crescents, segments, beams; circles have no volume and take neither), never a detail; none in pale scenes, none under legacy
//   what   the part of the form within a strip of its width (a fraction of its extent along the strip's direction, clamped) of its up-left
//          edge is mixed toward the paper tint
//   change the strip fades in and out with the geometry's easing; while a form turns or changes size its strip follows (it is recomputed
//          from the form's current orientation and scale every frame of a change)

export const HIGHLIGHT = {
  /** the types that carry a highlight (the same as the shadow plane's) */
  types: new Set(['triangle', 'crescent', 'segment', 'beam']),
  /** how far the strip's colour is mixed toward the paper tint */
  strength: 0.45,
  /** the strip's width: a fraction of the form's extent along its direction, clamped (world units) */
  width: 0.09, minWidth: 0.04, maxWidth: 0.16,
  /** the direction on screen the strip faces: up-left (x to the right, y up) */
  dir: [-Math.SQRT1_2, Math.SQRT1_2],
  /** other forms that take one besides the anchor: this many or one more (a seeded draw) */
  others: 1
};

/** does this shape type carry a highlight */
export const hasHighlight = (/** @type {string} */ type) => HIGHLIGHT.types.has(type);

/** The strip's direction in world space (the screen's up-left). @param {{ right: THREE.Vector3, up: THREE.Vector3 }} view */
export function highlightDirection(view) {
  return new THREE.Vector3().addScaledVector(view.right, HIGHLIGHT.dir[0]).addScaledVector(view.up, HIGHLIGHT.dir[1]).normalize();
}

/** a rough projected area of an entry, for ranking @param {{ type: string, scale: number[] }} e @param {{ x: number, y: number, z: number }} half */
function areaOf(e, half) {
  if (e.type === 'beam') return e.scale[0] * Math.max(e.scale[1], e.scale[2]);
  return 4 * half.x * e.scale[0] * half.y * e.scale[1];
}

/**
 * Which entries of a layout carry a highlight: the anchor and the largest one or two others by area, among the eligible types, in a
 * faceted or subtle scene. Pure and deterministic.
 * @template {{ type: string, role?: string, scale: number[] }} E
 * @param {E[]} entries
 * @param {{ config: any, halfOf: (type: string) => { x: number, y: number, z: number } }} ctx
 * @returns {Set<E>}
 */
export function pickHighlights(entries, ctx) {
  const out = new Set();
  const mode = toneModeFor(ctx.config.seed, ctx.config.composition.strategy);
  if (!mode || mode === 'pale') return out;
  const eligible = entries.filter((e) => hasHighlight(e.type) && e.role !== 'detail');
  const anchor = eligible.find((e) => e.role === 'anchor');
  if (anchor) out.add(anchor);
  const rng = createRng('highlight', ctx.config.composition.strategy, ctx.config.seed);
  const n = HIGHLIGHT.others + (rng() < 0.5 ? 1 : 0);
  eligible
    .filter((e) => e !== anchor)
    .map((e) => ({ e, a: areaOf(e, ctx.halfOf(e.type)) }))
    .sort((x, y) => y.a - x.a)
    .slice(0, n)
    .forEach(({ e }) => out.add(e));
  return out;
}

const n = new THREE.Vector3();
const inv = new THREE.Quaternion();

/**
 * Recomputes a mesh's strip from its CURRENT orientation and scale: the direction `front.uHiDir` (world) in the mesh's own space,
 * scaled so that a dot product with an object-space position is the distance along the direction in world units; the edge (the largest
 * such distance over the geometry) and the strip's width. A no-op for a mesh without a highlight state.
 * @param {THREE.Mesh} mesh
 */
export function updateHighlight(mesh) {
  const f = mesh.userData.front;
  if (!f || !f.uHiN || !mesh.geometry) return;
  inv.copy(mesh.quaternion).invert();
  n.copy(f.hiDir).applyQuaternion(inv).multiply(mesh.scale);
  f.uHiN.value.copy(n);
  const pos = mesh.geometry.attributes.position;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const d = pos.getX(i) * n.x + pos.getY(i) * n.y + pos.getZ(i) * n.z;
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  const w = Math.min(HIGHLIGHT.maxWidth, Math.max(HIGHLIGHT.minWidth, HIGHLIGHT.width * (hi - lo)));
  f.uHiBand.value.set(hi, w);
}

/**
 * Puts a mesh's highlight straight into the state `want` asks for (no easing): a new shape. Call it after the mesh has its place.
 * @param {THREE.Mesh} mesh @param {{ on: boolean, dir: THREE.Vector3, tint: THREE.Color } | null} want
 */
export function setHighlightNow(mesh, want) {
  const f = mesh.userData.front;
  if (!f || !f.uHiN || !want) return;
  f.hiDir.copy(want.dir);
  f.uHiTint.value.copy(want.tint);
  f.uHiAmt.value = want.on ? 1 : 0;
  updateHighlight(mesh);
}
