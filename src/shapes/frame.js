import * as THREE from 'three';
import { materialSetMesh } from '../texture/materials.js';

const TYPE = 'frame';

// ExtrudeGeometry: front+back caps use material 0, the sides material 1
const SHADE_MULTIPLIERS = [1.0, 0.7];

// An outline frame: the thin open rectangle (the parallelogram of the
// references once it is turned out of the picture plane) that crosses solids
// and carries the accent colour. One extruded shape with a real hole.
// Proportions are fixed (FRAME_ASPECT : 1) and the shape scales uniformly,
// so its line weight stays in proportion to its size; scaling a hollow
// rectangle unevenly would thicken one pair of sides more than the other.
export const FRAME_ASPECT = 0.42;   // height / width
export const FRAME_BORDER = 0.022;  // line weight, as a fraction of the width
const FRAME_THICKNESS = 0.04;

/** The outline: the outer rectangle, 1 wide, with a rectangular hole leaving a FRAME_BORDER band. */
export function frameShape() {
  const w = 0.5, h = FRAME_ASPECT / 2, b = FRAME_BORDER;
  const shape = new THREE.Shape();
  shape.moveTo(-w, -h);
  shape.lineTo(w, -h);
  shape.lineTo(w, h);
  shape.lineTo(-w, h);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-w + b, -h + b);
  hole.lineTo(-w + b, h - b);
  hole.lineTo(w - b, h - b);
  hole.lineTo(w - b, -h + b);
  hole.closePath();
  shape.holes.push(hole);
  return shape;
}

export function frameGeometry() {
  const geo = new THREE.ExtrudeGeometry(frameShape(), { depth: FRAME_THICKNESS, bevelEnabled: false });
  geo.center();
  return geo;
}

// Local x is the long side, local z the thin extrusion, so it is turned in
// the picture plane like the triangle and the segment.
//   collides: false    an outline passes across other forms on purpose, like the
//                      rod; a solid collision box around an empty frame would
//                      only push things apart for no reason
//   defaults count 0   starts out off, so existing compositions look the same
export default {
  type: TYPE,
  label: 'Frame',
  facesCamera: false,
  collides: false,
  defaults: { count: 0 },
  localHalfExtents: { x: 0.5, y: FRAME_ASPECT / 2, z: FRAME_THICKNESS / 2 },

  create(hex) {
    return materialSetMesh(frameGeometry(), hex, SHADE_MULTIPLIERS, TYPE);
  },

  // uniform in x/y (see above): 1.6-4.0 long
  randomScale(rng) {
    const s = 1.6 + rng() * 2.4;
    return new THREE.Vector3(s, s, 0.5 + rng() * 0.5);
  }
};
