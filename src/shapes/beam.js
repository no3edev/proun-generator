import * as THREE from 'three';
import { materialSetMesh } from '../texture/materials.js';

const TYPE = 'beam';

// Face tones, in BoxGeometry's face order: +x -x +y -y +z -z. The beam's
// length runs along its local x, so +x / -x are the two END faces. A beam
// is read from its long faces and its cut ends, so the tones separate them
// more than the generic box does (top light, underside dark, ends darkest):
// the visible faces span about 1.8:1 where a plain box spans 1.3:1, as in
// the reference works' beams. A first step toward per-family tonal
// profiles; the general tonal system is a later stage.
export const BEAM_SHADE_MULTIPLIERS = [0.58, 0.58, 1.08, 0.6, 0.92, 0.72];

// A long structural bar with a rectangular section: the beam of Lissitzky's
// Prouns (long, 6-25 times as long as it is thick, often stacked or paired,
// its end faces showing). Unlike the variable cube, which can come out as a
// stripe, a slab or a chunk, a beam is always a beam, and its dimensions are
// predictable: local x is the length, local y and z the section.
//   defaults count 0   starts out off, so existing compositions look the same
export default {
  type: TYPE,
  label: 'Beam',
  facesCamera: false,
  defaults: { count: 0 },
  localHalfExtents: { x: 0.5, y: 0.5, z: 0.5 },

  create(hex) {
    return materialSetMesh(new THREE.BoxGeometry(1, 1, 1), hex, BEAM_SHADE_MULTIPLIERS, TYPE);
  },

  // length 2.6-5.0; a section 0.11-0.3 wide, its other side 0.7-1.6 times that
  randomScale(rng) {
    const length = 2.6 + rng() * 2.4;
    const width = 0.11 + rng() * 0.19;
    const depth = width * (0.7 + rng() * 0.9);
    return new THREE.Vector3(length, width, depth);
  }
};
