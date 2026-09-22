import * as THREE from 'three';
import { Billboard } from './Billboard.js';

// Eases position/scale (lerp), rotation (quaternion slerp — shortest
// path), and color (RGB lerp, then re-applied through each shape's own
// shading scheme: per-material multipliers, or per-vertex for a
// vertex-colored shape like the sphere). No external dependency.

const active = [];

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * @param {THREE.Mesh} mesh
 * @param {{position: THREE.Vector3, rotation: {x:number,y:number,z:number}, scale: THREE.Vector3, hex: string}} target
 * @param {number} duration ms
 * @param {Function} [onComplete]
 */
export function add(mesh, target, duration, onComplete) {
  const start = {
    position: mesh.position.clone(),
    quaternion: mesh.quaternion.clone(),
    scale: mesh.scale.clone(),
    baseColor: (mesh.userData.baseColor || new THREE.Color(mesh.userData.baseHex)).clone()
  };
  const targetColor = new THREE.Color(target.hex);
  const targetQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(target.rotation.x, target.rotation.y, target.rotation.z)
  );

  active.push({
    mesh, start,
    endPosition: target.position,
    endQuaternion: targetQuat,
    endScale: target.scale,
    endColor: targetColor,
    endHex: target.hex,
    duration,
    elapsed: 0,
    onComplete
  });
}

export function update(dt) {
  for (let i = active.length - 1; i >= 0; i--) {
    const t = active[i];
    t.elapsed += dt;
    const p = Math.min(t.elapsed / t.duration, 1);
    const e = easeInOutCubic(p);

    t.mesh.position.lerpVectors(t.start.position, t.endPosition, e);
    if (t.mesh.userData.facesCamera) {
      // always facing the fixed camera — rotation is never eased
      t.mesh.quaternion.copy(Billboard.get());
    } else {
      t.mesh.quaternion.slerpQuaternions(t.start.quaternion, t.endQuaternion, e);
    }
    t.mesh.scale.lerpVectors(t.start.scale, t.endScale, e);

    const interpolatedBase = t.start.baseColor.clone().lerp(t.endColor, e);

    if (t.mesh.userData.isVertexColored) {
      const colorAttr = t.mesh.geometry.attributes.color;
      const shadeFactors = t.mesh.userData.shadeFactors;
      for (let vi = 0; vi < shadeFactors.length; vi++) {
        const c = interpolatedBase.clone().multiplyScalar(shadeFactors[vi]);
        colorAttr.setXYZ(vi, Math.min(1, c.r), Math.min(1, c.g), Math.min(1, c.b));
      }
      colorAttr.needsUpdate = true;
    } else if (Array.isArray(t.mesh.material)) {
      const mults = t.mesh.userData.shadeMultipliers;
      t.mesh.material.forEach((mat, idx) => {
        const c = interpolatedBase.clone().multiplyScalar(mults[idx]);
        mat.color.setRGB(Math.min(1, c.r), Math.min(1, c.g), Math.min(1, c.b));
      });
    } else {
      const mult = t.mesh.userData.shadeMultipliers ? t.mesh.userData.shadeMultipliers[0] : 1.0;
      const c = interpolatedBase.clone().multiplyScalar(mult);
      t.mesh.material.color.setRGB(Math.min(1, c.r), Math.min(1, c.g), Math.min(1, c.b));
    }

    if (p >= 1) {
      t.mesh.userData.baseHex = t.endHex;
      t.mesh.userData.baseColor = t.endColor.clone();
      active.splice(i, 1);
      if (t.onComplete) t.onComplete();
    }
  }
}

export const Tween = { add, update };
