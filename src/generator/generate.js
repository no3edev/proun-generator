// @ts-check
import * as THREE from 'three';
import { BOUNDS, ROTATION_SNAP } from '../config/defaults.js';
import { computeAABB, resolveCollisions } from './CollisionResolver.js';
import { createRng } from './rng.js';

// The composition generator: a pure function of (config, palette, shapes,
// camera view). No DOM, no meshes, no Math.random, no module state — the
// same inputs always give the same Layout, which is what makes seeds,
// saved compositions, history and tests possible.
//
// Each instance draws from its OWN stream, keyed by (seed, type, index).
// That means changing the count of one type never perturbs the random
// draws of any other instance (collision resolution still runs over the
// whole set, so resolved positions can shift slightly).

/** @typedef {import('../types.js').LayoutEntry} LayoutEntry */
/** @typedef {import('../types.js').ShapeDef} ShapeDef */
/** @typedef {import('../types.js').ShapeSettings} ShapeSettings */

/**
 * Builds one instance's raw (not yet collision-resolved) candidate.
 * Exported for tests. The order of rng() draws below is part of the
 * seed -> composition mapping: reordering it changes every composition.
 *
 * @param {Object} args
 * @param {number} args.seed
 * @param {ShapeDef} args.shape
 * @param {number} args.index
 * @param {ShapeSettings} args.settings
 * @param {string[]} args.accents
 * @param {string} [args.ink]  the palette's ink, for shapes with colorRole 'ink'
 * @param {THREE.Quaternion} args.billboard
 */
export function buildCandidate({ seed, shape, index, settings, accents, ink, billboard }) {
  const rng = createRng(seed, shape.type, index);
  const sizeMult = settings.sizeMin + rng() * (settings.sizeMax - settings.sizeMin);
  const spread = settings.spread;

  const position = new THREE.Vector3(
    (rng() * 2 - 1) * BOUNDS.x * spread,
    (rng() * 2 - 1) * BOUNDS.y * spread,
    (rng() * 2 - 1) * BOUNDS.z * spread
  );
  const rotation = {
    // mostly grid-aligned, occasionally tilted — a nod to the mix of
    // orthogonal and diagonal forms in Prouns. Drawn even for
    // facesCamera shapes (which ignore it) so streams stay uniform.
    x: rng() < 0.7 ? 0 : rng() * Math.PI,
    y: rng() * Math.PI * 2,
    z: rng() < 0.7 ? 0 : (rng() - 0.5) * 0.6
  };
  // "snap rotation": round every angle to the nearest 45 degrees. Done AFTER
  // the draws above, so the random stream is untouched — the same seed gives
  // the same composition with its rotations snapped. (`+ 0` turns -0 into 0.)
  if (settings.snapRotation) {
    const snap = (/** @type {number} */ a) => Math.round(a / ROTATION_SNAP) * ROTATION_SNAP + 0;
    rotation.x = snap(rotation.x);
    rotation.y = snap(rotation.y);
    rotation.z = snap(rotation.z);
  }
  const scale = shape.randomScale(rng).multiplyScalar(sizeMult);
  // drawn even for ink-colored shapes, so a shape's stream doesn't depend on its role
  const accent = accents[Math.floor(rng() * accents.length)];
  const hex = shape.colorRole === 'ink' ? (ink || accent) : accent;

  const quat = shape.facesCamera
    ? billboard.clone()
    : new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z));

  return {
    type: shape.type,
    index,
    position,
    rotation,
    scale,
    hex,
    box: computeAABB(shape.localHalfExtents, position, quat, scale)
  };
}

/**
 * A locked shape type's stored instance as a candidate: used verbatim and
 * immovable, so everything else is resolved around it.
 * @param {ShapeDef} shape
 * @param {import('../types.js').LockedEntry} entry
 * @param {number} index
 * @param {THREE.Quaternion} billboard
 */
function lockedCandidate(shape, entry, index, billboard) {
  const position = new THREE.Vector3(...entry.position);
  const scale = new THREE.Vector3(...entry.scale);
  const rotation = { x: entry.rotation[0], y: entry.rotation[1], z: entry.rotation[2] };
  const quat = shape.facesCamera
    ? billboard.clone()
    : new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z));
  return {
    type: shape.type,
    index,
    position,
    rotation,
    scale,
    hex: entry.hex,
    box: computeAABB(shape.localHalfExtents, position, quat, scale),
    fixed: true
  };
}

/**
 * @param {object} args
 * @param {Pick<import('../types.js').SceneConfigState, 'seed' | 'shapes'>} args.config
 *        a SceneConfig state (only seed and shapes are read here)
 * @param {{ accents: string[], ink?: string }} args.palette
 * @param {ShapeDef[]} args.shapeDefs the shape registry
 * @param {{ depthAxis: THREE.Vector3, billboard: THREE.Quaternion }} args.view
 *        the camera's depth direction and camera-facing orientation, passed
 *        in rather than read from a global so this stays pure
 * @returns {LayoutEntry[]} ordered by shape (registry order), then index
 */
export function generateLayout({ config, palette, shapeDefs, view }) {
  /** @type {(ReturnType<typeof buildCandidate> & { fixed?: boolean })[]} */
  const candidates = [];
  /** the subset that takes part in collision resolution @type {typeof candidates} */
  const resolvable = [];
  shapeDefs.forEach((shape) => {
    const settings = config.shapes[shape.type];
    if (!settings) return;
    const own = settings.locked
      // a locked type is replayed exactly as stored: seed, size, spread and
      // palette no longer apply to it
      ? settings.locked.map((entry, i) => lockedCandidate(shape, entry, i, view.billboard))
      : Array.from({ length: settings.count }, (_, i) => buildCandidate({
        seed: config.seed,
        shape,
        index: i,
        settings,
        accents: palette.accents,
        ink: palette.ink,
        billboard: view.billboard
      }));
    own.forEach((c) => {
      candidates.push(c);
      // a shape with collides:false (a rod/line) passes through everything
      if (shape.collides !== false) resolvable.push(c);
    });
  });

  // between ALL colliding candidates, regardless of type (cube vs sphere is
  // treated the same as cube vs cube); mutates positions in place. Locked
  // candidates are fixed obstacles and never move.
  resolveCollisions(resolvable, view.depthAxis);

  return candidates.map((c) => ({
    type: c.type,
    index: c.index,
    position: c.position.toArray(),
    rotation: [c.rotation.x, c.rotation.y, c.rotation.z],
    scale: c.scale.toArray(),
    hex: c.hex
  }));
}
