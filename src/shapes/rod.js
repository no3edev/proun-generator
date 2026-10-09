import * as THREE from 'three';
import { boxMesh } from '../texture/materials.js';

const TYPE = 'rod';

// A thin line/axis in the spirit of the construction lines and suspension
// rods that run through Lissitzky's Prouns. It differs from the other
// shapes in three declared ways, none of which needs any special-casing
// elsewhere:
//   colorRole 'ink'    always the palette's near-black ink, never an accent
//   collides: false    passes through other shapes instead of pushing them
//                      (and isn't pushed): lines overlay, they don't stack
//   defaults count 0   starts out off, so existing compositions look the same
export default {
  type: TYPE,
  label: 'Rod',
  facesCamera: false,
  colorRole: 'ink',
  collides: false,
  defaults: { count: 0 },
  localHalfExtents: { x: 0.5, y: 0.5, z: 0.5 },

  create(hex) {
    return boxMesh(hex, TYPE);
  },

  // long on one randomly-chosen axis, hair-thin on the other two — so
  // rods come out horizontal, vertical or running into the depth
  randomScale(rng) {
    const axes = ['x', 'y', 'z'];
    const longAxis = axes[Math.floor(rng() * 3)];
    const s = { x: 1, y: 1, z: 1 };
    axes.forEach((a) => {
      s[a] = a === longAxis
        ? 2.2 + rng() * 2.6
        : 0.035 + rng() * 0.035;
    });
    return new THREE.Vector3(s.x, s.y, s.z);
  }
};
