import * as THREE from 'three';
import { materialSetMesh } from '../texture/materials.js';

const TYPE = 'triangle';

// ExtrudeGeometry groups sides at material index 0, front+back caps at index 1
const SHADE_MULTIPLIERS = [0.7, 1.0];

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
  randomScale() {
    return new THREE.Vector3(
      0.6 + Math.random() * 1.6,
      0.6 + Math.random() * 1.6,
      0.6 + Math.random() * 1.0
    );
  }
};
