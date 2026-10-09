import * as THREE from 'three';
import { materialSetMesh } from '../texture/materials.js';

const TYPE = 'triangle';

// ExtrudeGeometry groups front+back caps at material index 0, sides at
// index 1 (verified against the installed three.js version — this is
// the opposite of what you might assume from the constructor order)
const SHADE_MULTIPLIERS = [1.0, 0.7];

export default {
  type: TYPE,
  label: 'Triangle 90°',
  facesCamera: false,
  localHalfExtents: { x: 0.5, y: 0.5, z: 0.1 },

  create(hex) {
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, -0.5);
    shape.lineTo(0.5, -0.5);
    shape.lineTo(-0.5, 0.5);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false });
    geo.center();
    return materialSetMesh(geo, hex, SHADE_MULTIPLIERS, TYPE);
  },

  // elongated in x/y independently, mild depth variation
  randomScale(rng) {
    return new THREE.Vector3(
      0.6 + rng() * 1.6,
      0.6 + rng() * 1.6,
      0.6 + rng() * 1.0
    );
  }
};
