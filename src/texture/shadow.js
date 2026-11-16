// @ts-check
import * as THREE from 'three';
import { toneModeFor } from './tone.js';
import { createRng } from '../generator/rng.js';
import { installShadowHatch } from './hatch.js';

// THE GRAPHIC SHADOW PLANE (Stage 4.2).
//
// In the references a form often has a dark flat companion pushed a little down and to the right and a hair behind it: not a cast shadow (it
// follows no light, and every one in a picture falls the same way) but a tonal plane that lifts the form off what is behind it.
// Here it is a CHILD MESH of its parent: the parent's own geometry, one flat colour, offset in screen space, always down-right, just behind.
// Being a child it moves, scales, grows, shrinks, hides and is disposed with its parent.
//
//   who    triangles, crescents, segments and beams (not circles, which have no volume to lift off the page and look poor with one; not cubes/planks, whose faces do the work; not rods or outlines), and not a
//          'detail'; none in pale scenes and none under the legacy generator
//   where  down-right on screen by a fraction of the form's size (more for thick forms), and SHADOW.behind behind it along the view
//          axis, under the solver's smallest gap (COLLISION.margin 0.18), so it never reaches the next shape back
//   colour the parent's colour toward the palette's ink, desaturated, over the paper at about 55%: PRE-MIXED and opaque. (A real 55% alpha
//          would blend twice wherever the extruded body overlaps itself, and a flat opaque plane is what the references show.)
//   change a shadow that is not wanted any more slides back behind its parent (offset to zero: hidden by it exactly) and a new one slides
//          out, riding the same easing as the geometry; its colour eases like the parent's

export const SHADOW = {
  /** shape types that carry a shadow plane */
  types: new Set(['triangle', 'crescent', 'segment', 'beam']),
  /** how far it is mixed toward the ink, how much of its colour is kept toward grey, and how much of it shows over the paper */
  toInk: 0.55, desaturate: 0.35, opacity: 0.55,
  /** the offset on screen: a fraction of the form's size, clamped (world units); the direction is down-right */
  fraction: 0.05, min: 0.05, max: 0.22,
  /** beams: the offset follows their thickness */
  beamFraction: 0.5, beamMax: 0.18,
  /** how far behind the parent (world units, along the view axis) */
  behind: 0.06,
  /** registration imperfection: each shadow's offset is a little longer or shorter (a fraction) and turned a little (degrees), by seed */
  jitterLength: 0.15, jitterAngleDeg: 6,
  /** unit direction on screen: x to the right, y up */
  dir: [Math.SQRT1_2, -Math.SQRT1_2]
};

/** does this shape type carry a shadow plane */
export const hasShadow = (/** @type {string} */ type) => SHADOW.types.has(type);

/**
 * The shadow's flat colour: the parent's colour mixed toward the ink, desaturated, then over the paper at SHADOW.opacity.
 * @param {string} hex the parent's colour @param {string} paper @param {string} ink
 * @param {THREE.Color} [out]
 */
export function shadowColor(hex, paper, ink, out = new THREE.Color()) {
  out.set(hex).lerp(tmpInk.set(ink), SHADOW.toInk);
  const l = 0.2126 * out.r + 0.7152 * out.g + 0.0722 * out.b;
  out.r += (l - out.r) * SHADOW.desaturate;
  out.g += (l - out.g) * SHADOW.desaturate;
  out.b += (l - out.b) * SHADOW.desaturate;
  return out.lerp(tmpPaper.set(paper), 1 - SHADOW.opacity);
}
const tmpInk = new THREE.Color();
const tmpPaper = new THREE.Color();

/**
 * The shadow's offset in WORLD units for a form of this type and scale: down-right on screen by a fraction of its size, and behind it.
 * @param {string} type @param {number[]} scale @param {{ x: number, y: number, z: number }} half the shape's localHalfExtents
 * @param {{ right: THREE.Vector3, up: THREE.Vector3, depth: THREE.Vector3 }} view
 */
export function shadowWorldOffset(type, scale, half, view, jitter = { length: 0, angle: 0 }) {
  let m;
  if (type === 'beam') m = Math.min(SHADOW.beamMax, Math.max(SHADOW.min, SHADOW.beamFraction * Math.max(scale[1], scale[2])));
  else m = Math.min(SHADOW.max, Math.max(SHADOW.min, SHADOW.fraction * 2 * Math.max(half.x * scale[0], half.y * scale[1])));
  m *= 1 + jitter.length;
  const [bx, by] = SHADOW.dir;
  const ca = Math.cos(jitter.angle), sa = Math.sin(jitter.angle);
  const dx = bx * ca - by * sa, dy = bx * sa + by * ca;
  return new THREE.Vector3()
    .addScaledVector(view.right, dx * m)
    .addScaledVector(view.up, dy * m)
    .addScaledVector(view.depth, -SHADOW.behind);
}

/**
 * The registration imperfection of one shadow plane: a seeded change of its offset's length and direction, within SHADOW.jitterLength
 * (a fraction) and SHADOW.jitterAngleDeg (degrees), the same every time for a scene and a form.
 * @param {number} seed @param {{ type: string, position?: number[] }} entry
 */
export function shadowJitter(seed, entry) {
  const p = entry.position || [0, 0, 0];
  const r = createRng('shadow-jitter', seed, entry.type, Math.round(p[0] * 100), Math.round(p[1] * 100));
  return { length: (2 * r() - 1) * SHADOW.jitterLength, angle: ((2 * r() - 1) * SHADOW.jitterAngleDeg * Math.PI) / 180 };
}

/**
 * What a layout entry wants of its shadow plane: null if the type carries none (no plane is attached), else `local` (the child's
 * position in the parent's own frame: zero when the shadow is not wanted, which tucks it exactly behind the parent) and `color`
 * (null when not wanted: it keeps the colour it has).
 * @param {{ type: string, role?: string, hex: string, rotation: number[], scale: number[] }} entry
 * @param {{ half: { x: number, y: number, z: number }, config: any, palette: { paper: string, ink: string }, view: { right: THREE.Vector3, up: THREE.Vector3, depth: THREE.Vector3 } }} ctx
 * @returns {{ local: THREE.Vector3, color: THREE.Color | null } | null}
 */
export function shadowFor(entry, ctx) {
  if (!hasShadow(entry.type)) return null;
  const mode = toneModeFor(ctx.config.seed, ctx.config.composition.strategy);
  if (!mode || mode === 'pale' || entry.role === 'detail') return { local: new THREE.Vector3(), color: null };
  const w = shadowWorldOffset(entry.type, entry.scale, ctx.half, ctx.view, shadowJitter(ctx.config.seed, entry));
  // into the parent's frame at the entry's target orientation and size (the child inherits both)
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...entry.rotation));
  const local = w.applyQuaternion(q.invert());
  local.set(local.x / entry.scale[0], local.y / entry.scale[1], local.z / entry.scale[2]);
  return { local, color: shadowColor(entry.hex, ctx.palette.paper, ctx.palette.ink) };
}

/**
 * Attaches the shadow plane to a mesh: the parent's geometry, one flat opaque colour, tucked behind it and hidden until wanted.
 * @param {THREE.Mesh} mesh
 */
export function attachShadow(mesh) {
  const child = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    // never wins a depth tie against its parent (same geometry, nearly the same place as it comes out from behind): it can only show
    // where it is out from behind, not flicker over the parent's own surface
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
  }));
  child.visible = false;
  child.userData.isShadow = true;
  installShadowHatch(child);
  mesh.add(child);
  mesh.userData.shadow = { mesh: child };
  return child;
}

/**
 * Puts a mesh's shadow plane straight into the state `want` asks for (no easing): a new shape, or a shape that is not animating.
 * @param {THREE.Mesh} mesh @param {{ local: THREE.Vector3, color: THREE.Color | null } | null} want
 */
export function setShadowNow(mesh, want) {
  const sh = mesh.userData.shadow;
  if (!sh || !want) return;
  sh.mesh.position.copy(want.local);
  if (want.color) sh.mesh.material.color.copy(want.color);
  sh.mesh.visible = want.local.lengthSq() > 1e-12;
}
