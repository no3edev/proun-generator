import * as THREE from 'three';

// The camera is fixed (no orbit controls), so "always face the camera"
// is a single constant orientation, computed once from the camera's
// position. The circle shape uses this instead of a random rotation.
// The same direction vector doubles as the axis collision resolution
// pushes shapes along (see CollisionResolver.js) — depth, from this
// camera's point of view, IS this vector.
const quat = new THREE.Quaternion();
const dir = new THREE.Vector3();

export const Billboard = {
  computeFromCamera(camera) {
    dir.copy(camera.position).normalize();
    quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  },
  get() {
    return quat;
  },
  direction() {
    return dir;
  }
};
