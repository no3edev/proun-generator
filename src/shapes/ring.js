import * as THREE from 'three';
import { materialSetMesh } from '../texture/materials.js';

const TYPE = 'ring';

// ExtrudeGeometry: front+back caps use material 0, the sides material 1
const SHADE_MULTIPLIERS = [1.0, 0.7];

// A partial ring: an arc band, 270 degrees of a circle of diameter 1, with
// the opening centred on local +x (the long circle outline of one reference
// work, the arcs of another). Thin: the band is RING_BAND wide, and the
// shape scales uniformly so that stays in proportion.
export const RING_BAND = 0.025;     // band width, as a fraction of the diameter
export const RING_SWEEP = (3 * Math.PI) / 2;
const RING_RADIUS = 0.5;
const RING_THICKNESS = 0.04;

/** The band: from the end of the opening round the circle (counter-clockwise) to its start. */
export function ringShape() {
  const start = (2 * Math.PI - RING_SWEEP) / 2;                  // half the opening, either side of +x
  const end = start + RING_SWEEP;
  const inner = RING_RADIUS - RING_BAND;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, RING_RADIUS, start, end, false);
  shape.lineTo(inner * Math.cos(end), inner * Math.sin(end));
  shape.absarc(0, 0, inner, end, start, true);
  shape.closePath();
  return shape;
}

/**
 * The ring's solid. NOT centred on its bounding box: the origin stays at the
 * circle's centre, so placing the shape places the circle, and turning it
 * turns the opening about the circle's centre. Only z is centred.
 */
export function ringGeometry() {
  const geo = new THREE.ExtrudeGeometry(ringShape(), { depth: RING_THICKNESS, bevelEnabled: false, curveSegments: 96 });
  geo.translate(0, 0, -RING_THICKNESS / 2);
  return geo;
}

// A partial ring, turned in the picture plane like the other flat forms.
//   collides: false    an outline crosses other forms on purpose, like the rod and
//                      the frame, and a box around a mostly empty circle would only
//                      push things apart (the envelope below is the whole circle)
//   defaults count 0   starts out off, so existing compositions look the same
export default {
  type: TYPE,
  label: 'Ring',
  facesCamera: false,
  collides: false,
  defaults: { count: 0 },
  // the circle's full envelope, centred on the circle (the geometry's origin)
  localHalfExtents: { x: RING_RADIUS, y: RING_RADIUS, z: RING_THICKNESS / 2 },

  create(hex) {
    return materialSetMesh(ringGeometry(), hex, SHADE_MULTIPLIERS, TYPE);
  },

  // uniform in x/y: a circle 1.2-3.4 across
  randomScale(rng) {
    const s = 1.2 + rng() * 2.2;
    return new THREE.Vector3(s, s, 0.5 + rng() * 0.5);
  }
};
