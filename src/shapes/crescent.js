import * as THREE from 'three';
import { materialSetMesh } from '../texture/materials.js';

const TYPE = 'crescent';

// ExtrudeGeometry: front+back caps use material 0, the sides material 1
const SHADE_MULTIPLIERS = [1.0, 0.7];

// A crescent is a disc (radius CRESCENT_OUTER) with a smaller disc
// (CRESCENT_INNER, its centre CRESCENT_OFFSET toward +x) taken out of it. The
// two arcs meet in two sharp horns that point toward +x; the thick part of
// the moon is on the -x side.
const CRESCENT_OUTER = 0.5;
const CRESCENT_INNER = 0.42;
const CRESCENT_OFFSET = 0.2;
const CRESCENT_THICKNESS = 0.2;

// where the two circles cross (the horns' tips): x, and +-y
const TIP_X = (CRESCENT_OFFSET ** 2 + CRESCENT_OUTER ** 2 - CRESCENT_INNER ** 2) / (2 * CRESCENT_OFFSET);
const TIP_Y = Math.sqrt(CRESCENT_OUTER ** 2 - TIP_X ** 2);

/** The outline: the outer arc around the -x side, then back along the inner arc. */
export function crescentShape() {
  const outerTip = Math.atan2(TIP_Y, TIP_X);                      // the upper tip, seen from the outer circle's centre
  const innerTip = Math.atan2(TIP_Y, TIP_X - CRESCENT_OFFSET);    // and from the inner circle's centre
  const shape = new THREE.Shape();
  shape.absarc(0, 0, CRESCENT_OUTER, outerTip, 2 * Math.PI - outerTip, false);   // up and round the left to the lower tip
  shape.absarc(CRESCENT_OFFSET, 0, CRESCENT_INNER, 2 * Math.PI - innerTip, innerTip, true); // back along the inside, through the left
  shape.closePath();
  return shape;
}

/** The crescent's solid, centred on its bounding box. */
export function crescentGeometry() {
  const geo = new THREE.ExtrudeGeometry(crescentShape(), { depth: CRESCENT_THICKNESS, bevelEnabled: false, curveSegments: 48 });
  geo.center();
  return geo;
}

// A crescent: the sharp-horned moon of the reference works (the red crescent
// of one, the half-bowls of the stage figures). Flat, like the segment and
// the triangle; local x runs from the thick back to the horns' tips.
//   defaults count 0   starts out off, so existing compositions look the same
const WIDTH = CRESCENT_OUTER + TIP_X; // the back of the moon (-0.5) to the tips (TIP_X)
export default {
  type: TYPE,
  label: 'Crescent',
  facesCamera: false,
  defaults: { count: 0 },
  localHalfExtents: { x: WIDTH / 2, y: CRESCENT_OUTER, z: CRESCENT_THICKNESS / 2 },

  create(hex) {
    return materialSetMesh(crescentGeometry(), hex, SHADE_MULTIPLIERS, TYPE);
  },

  // moon-like proportions: a little taller than wide, thin in z
  randomScale(rng) {
    const w = 0.9 + rng() * 1.5;
    return new THREE.Vector3(w, w * (1.0 + rng() * 0.45), 0.5 + rng() * 0.5);
  }
};
