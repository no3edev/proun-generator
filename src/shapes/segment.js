import * as THREE from 'three';
import { materialSetMesh } from '../texture/materials.js';

const TYPE = 'segment';

// ExtrudeGeometry: front+back caps use material 0, the sides material 1
const SHADE_MULTIPLIERS = [1.0, 0.7];

// The segment's outline: a circular segment (an arc and its chord), 1 wide
// (the chord, along local x) and SEGMENT_DEPTH deep, the arc bulging toward
// +y. It is a segment of a circle, not a half-ellipse, so where the arc
// meets the chord the tips are acute: the sharp-cornered caps of the large
// white forms in the reference works.
export const SEGMENT_DEPTH = 0.3;
const SEGMENT_THICKNESS = 0.2;

/** The outline, y from 0 (the chord) to SEGMENT_DEPTH (the crown of the arc). */
export function segmentShape() {
  const half = 0.5;
  const R = (half * half + SEGMENT_DEPTH * SEGMENT_DEPTH) / (2 * SEGMENT_DEPTH); // circle radius through both ends and the crown
  const cy = SEGMENT_DEPTH - R;                                                  // its centre, below the chord
  const a = Math.atan2(0 - cy, half);                                            // angle of the right-hand tip
  const shape = new THREE.Shape();
  shape.moveTo(-half, 0);
  shape.lineTo(half, 0);
  shape.absarc(0, cy, R, a, Math.PI - a, false);                                 // over the top, counter-clockwise
  shape.closePath();
  return shape;
}

/** The segment's solid, centred on its bounding box so scale and rotation pivot on its middle. */
export function segmentGeometry() {
  const geo = new THREE.ExtrudeGeometry(segmentShape(), { depth: SEGMENT_THICKNESS, bevelEnabled: false, curveSegments: 40 });
  geo.center();
  return geo;
}

// A flat circular segment: half a disc or less, the flat form that sits
// behind and against the volumes in the reference works. Local x is the
// chord, the arc bulges toward +y, local z is the thin extrusion, so it
// can be turned in the picture plane like the triangle.
//   defaults count 0   starts out off, so existing compositions look the same
export default {
  type: TYPE,
  label: 'Segment',
  facesCamera: false,
  defaults: { count: 0 },
  // 1 along the chord, SEGMENT_DEPTH across, SEGMENT_THICKNESS thick, centred
  localHalfExtents: { x: 0.5, y: SEGMENT_DEPTH / 2, z: SEGMENT_THICKNESS / 2 },

  create(hex) {
    return materialSetMesh(segmentGeometry(), hex, SHADE_MULTIPLIERS, TYPE);
  },

  // chord 0.9-2.5; the arc's depth 0.7-1.7 times the base ratio, so the
  // segment runs from shallow to nearly a half disc; thin in z
  randomScale(rng) {
    const chord = 0.9 + rng() * 1.6;
    const deepen = 0.7 + rng() * 1.0;
    return new THREE.Vector3(chord, chord * deepen, 0.5 + rng() * 0.5);
  }
};
