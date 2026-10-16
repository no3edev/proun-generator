// @ts-check
import * as THREE from 'three';
import { computeAABB, resolveCollisions } from '../CollisionResolver.js';
import { frameFor, screenBasis, lift, splitPalette } from './common.js';

/** @typedef {import('../../types.js').LayoutEntry} LayoutEntry */
/** @typedef {import('../../types.js').ShapeDef} ShapeDef */
/** @typedef {import('../../types.js').ShapeSettings} ShapeSettings */

/**
 * One planned instance, in SCREEN terms. The runner turns it into a scene
 * entry; a strategy never deals in scene coordinates.
 * @typedef {Object} PlanItem
 * @property {string} type    a shape type the strategy was allowed to use
 * @property {string} role    anchor | support | connector | accent | detail
 * @property {number} x       screen position (frustum units, y up)
 * @property {number} y
 * @property {number} depth   along the view axis, positive toward the camera
 * @property {THREE.Quaternion} orientation  ignored for camera-facing shapes
 * @property {[number, number, number]} scale
 * @property {string} hex
 */

/**
 * What a strategy's plan() receives.
 * @typedef {Object} PlanContext
 * @property {number} seed
 * @property {{ halfW: number, halfH: number }} frame
 * @property {ReturnType<typeof screenBasis>} basis
 * @property {THREE.Quaternion} billboard
 * @property {Map<string, ShapeDef>} shapes        shapes the strategy may use (count > 0, not locked)
 * @property {Record<string, ShapeSettings>} settings
 * @property {{ saturated: string[], neutrals: string[] }} colors
 * @property {string} ink
 * @property {boolean} snapRotation  whether orientation should be snapped (see strategies' own docs)
 */

/**
 * @typedef {Object} Strategy
 * @property {string} label
 * @property {(ctx: PlanContext) => PlanItem[]} plan
 */

/**
 * Runs a strategy: plans in screen space, lifts to the scene, resolves depth
 * collisions around any locked types, and returns layout entries in the same
 * order generateLayout() uses (registry order, then index).
 *
 * Contract with the rest of the app (decided with the strategy work):
 *  - the strategy OWNS the counts: a type's `count` only says whether it may
 *    be used (0 = excluded); `visible` is a display toggle and, as in the
 *    legacy generator, doesn't change the layout;
 *  - a locked type is replayed verbatim and immovable, and is left out of
 *    the plan, exactly as in the legacy generator.
 *
 * @param {object} args
 * @param {Strategy} args.strategy
 * @param {import('../../types.js').SceneConfigState} args.config
 * @param {{ accents: string[], ink?: string, paper?: string }} args.palette
 * @param {ShapeDef[]} args.shapeDefs
 * @param {{ depthAxis: THREE.Vector3, billboard: THREE.Quaternion }} args.view
 * @returns {LayoutEntry[]}
 */
export function runStrategy({ strategy, config, palette, shapeDefs, view }) {
  const basis = screenBasis(view.depthAxis);
  /** @type {Map<string, ShapeDef>} */
  const usable = new Map();
  shapeDefs.forEach((shape) => {
    const s = config.shapes[shape.type];
    if (s && !s.locked && s.count > 0) usable.set(shape.type, shape);
  });

  const items = strategy.plan({
    seed: config.seed,
    frame: frameFor(config.orientation),
    basis,
    billboard: view.billboard,
    shapes: usable,
    settings: config.shapes,
    colors: splitPalette(palette),
    ink: palette.ink || '#000000',
    snapRotation: shapeDefs.some((sd) => usable.has(sd.type) && config.shapes[sd.type].snapRotation)
  }).filter((it) => usable.has(it.type));

  /** @typedef {{ entry: Omit<LayoutEntry, 'position'> & { role?: string }, position: THREE.Vector3, box: THREE.Box3, fixed?: boolean, collides: boolean, order: number }} Cand */
  /** @type {Cand[]} */
  const cands = [];
  /** @type {Map<string, number>} */
  const nextIndex = new Map();

  shapeDefs.forEach((shape, order) => {
    const settings = config.shapes[shape.type];
    if (!settings) return;
    if (settings.locked) {
      settings.locked.forEach((e, i) => {
        const position = new THREE.Vector3(...e.position);
        const scale = new THREE.Vector3(...e.scale);
        const q = shape.facesCamera ? view.billboard.clone() : new THREE.Quaternion().setFromEuler(new THREE.Euler(...e.rotation));
        cands.push({
          entry: { type: shape.type, index: i, rotation: e.rotation, scale: e.scale, hex: e.hex },
          position, box: computeAABB(shape.localHalfExtents, position, q, scale), fixed: true,
          collides: shape.collides !== false, order
        });
      });
    }
  });

  items.forEach((it) => {
    const shape = /** @type {ShapeDef} */ (usable.get(it.type));
    const order = shapeDefs.indexOf(shape);
    const index = nextIndex.get(it.type) || 0;
    nextIndex.set(it.type, index + 1);
    const position = lift(basis, it.x, it.y, it.depth);
    const scale = new THREE.Vector3(...it.scale);
    const q = shape.facesCamera ? view.billboard.clone() : it.orientation;
    const euler = new THREE.Euler().setFromQuaternion(shape.facesCamera ? new THREE.Quaternion() : it.orientation, 'XYZ');
    cands.push({
      entry: {
        type: it.type, index, rotation: [euler.x + 0, euler.y + 0, euler.z + 0], scale: scale.toArray(), hex: it.hex, role: it.role
      },
      position, box: computeAABB(shape.localHalfExtents, position, q, scale),
      collides: shape.collides !== false, order
    });
  });

  // depth-only resolution between everything that collides, locked types fixed
  resolveCollisions(cands.filter((c) => c.collides), view.depthAxis);

  cands.sort((a, b) => a.order - b.order || a.entry.index - b.entry.index);
  return cands.map((c) => ({ ...c.entry, position: c.position.toArray() }));
}
