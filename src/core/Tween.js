import * as THREE from 'three';
import { Billboard } from './Billboard.js';
import { clampColor } from '../texture/materials.js';

// Eases position/scale (lerp), rotation (quaternion slerp — shortest
// path), and color (RGB lerp, then re-applied through each shape's own
// shading scheme: per-material multipliers, or per-vertex for a
// vertex-colored shape like the sphere). No external dependency.

const active = [];

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Removes any active tween(s) targeting `mesh`. Used both when a new
 * tween starts on a mesh that's already mid-transition, and when an
 * instance is deleted entirely (see Composition.setCount) — without
 * this, a removed mesh's tween would keep running forever, updating a
 * mesh no longer in the scene and holding a reference that prevents
 * it from being garbage-collected.
 */
export function removeForMesh(mesh) {
  for (let i = active.length - 1; i >= 0; i--) {
    if (active[i].mesh === mesh) active.splice(i, 1);
  }
}

/**
 * @param {THREE.Mesh} mesh
 * @param {{position: THREE.Vector3, rotation: {x:number,y:number,z:number}, scale: THREE.Vector3, hex: string}} target
 * @param {number} duration ms
 * @param {Function} [onComplete]
 */
export function add(mesh, target, duration, onComplete) {
  // if this mesh is already mid-transition, cancel that tween instead
  // of letting both run: two tweens on one mesh fight over its
  // position/rotation/scale/color every frame, and — since color's
  // "start" is read from a cache that's only updated on completion,
  // not every frame — re-triggering mid-flight used to make color
  // jump straight to a stale value instead of easing from wherever it
  // actually was
  removeForMesh(mesh);

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
    // keep this live every frame (not just on completion) so that if
    // a new tween starts mid-flight, its start color is the color
    // actually on screen right now, not a stale cached one
    t.mesh.userData.baseColor = interpolatedBase.clone();

    if (t.mesh.userData.isVertexColored) {
      const colorAttr = t.mesh.geometry.attributes.color;
      const shadeFactors = t.mesh.userData.shadeFactors;
      for (let vi = 0; vi < shadeFactors.length; vi++) {
        const c = clampColor(interpolatedBase.clone().multiplyScalar(shadeFactors[vi]));
        colorAttr.setXYZ(vi, c.r, c.g, c.b);
      }
      colorAttr.needsUpdate = true;
    } else if (Array.isArray(t.mesh.material)) {
      const mults = t.mesh.userData.shadeMultipliers;
      t.mesh.material.forEach((mat, idx) => {
        mat.color.copy(clampColor(interpolatedBase.clone().multiplyScalar(mults[idx])));
      });
    } else {
      const mult = t.mesh.userData.shadeMultipliers ? t.mesh.userData.shadeMultipliers[0] : 1.0;
      t.mesh.material.color.copy(clampColor(interpolatedBase.clone().multiplyScalar(mult)));
    }

    if (p >= 1) {
      t.mesh.userData.baseHex = t.endHex;
      active.splice(i, 1);
      if (t.onComplete) t.onComplete();
    }
  }
}

export const Tween = { add, update, removeForMesh };
