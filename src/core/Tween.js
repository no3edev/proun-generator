import * as THREE from 'three';
import { Billboard } from './Billboard.js';
import { paintMesh } from '../texture/materials.js';

// Eases position/scale (lerp), rotation (quaternion slerp — shortest
// path), and color (RGB lerp of the base color, repainted each frame via
// paintMesh() — Tween knows nothing about how a shape is shaded; see the
// shading contract in texture/materials.js). No external dependency.

const active = [];
const scratchColor = new THREE.Color(); // reused every frame — no per-frame allocation

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Removes any active tween(s) targeting `mesh`. Used both when a new
 * tween starts on a mesh that's already mid-transition, and when an
 * instance is deleted entirely (see Composition) — without
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
 * Where `mesh` is headed: the end values of its running tween, or null if
 * it isn't animating. Locking a shape type freezes this (the destination),
 * not whatever half-way frame happens to be on screen.
 * @param {THREE.Mesh} mesh
 */
export function targetOf(mesh) {
  const t = active.find((a) => a.mesh === mesh);
  if (!t) return null;
  return {
    position: t.endPosition.clone(),
    quaternion: t.endQuaternion.clone(),
    scale: t.endScale.clone(),
    color: t.endColor.clone()
  };
}

/**
 * @param {THREE.Mesh} mesh
 * @param {{position: THREE.Vector3, rotation: {x:number,y:number,z:number}, scale: THREE.Vector3, hex: string}} target
 * @param {number} duration ms
 */
export function add(mesh, target, duration) {
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
    // paintMesh() keeps userData.baseColor live every frame, so this is the
    // color actually on screen right now even if we interrupt a tween
    baseColor: mesh.userData.baseColor.clone()
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
    duration,
    elapsed: 0
  });
}

export function update(dt) {
  for (let i = active.length - 1; i >= 0; i--) {
    const t = active[i];
    t.elapsed += dt;
    const p = Math.min(t.elapsed / t.duration, 1);
    const e = easeInOutCubic(p);

    // on the final frame, land on the exact target values rather than a
    // lerp that may be 1 ulp off — so a finished scene is bit-for-bit the
    // layout it was generated from
    if (p >= 1) {
      t.mesh.position.copy(t.endPosition);
      t.mesh.scale.copy(t.endScale);
    } else {
      t.mesh.position.lerpVectors(t.start.position, t.endPosition, e);
      t.mesh.scale.lerpVectors(t.start.scale, t.endScale, e);
    }
    if (t.mesh.userData.facesCamera) {
      // always facing the fixed camera — rotation is never eased
      t.mesh.quaternion.copy(Billboard.get());
    } else if (p >= 1) {
      t.mesh.quaternion.copy(t.endQuaternion);
    } else {
      t.mesh.quaternion.slerpQuaternions(t.start.quaternion, t.endQuaternion, e);
    }

    paintMesh(t.mesh, p >= 1 ? t.endColor : scratchColor.copy(t.start.baseColor).lerp(t.endColor, e));

    if (p >= 1) active.splice(i, 1);
  }
}

export const Tween = { add, update, removeForMesh, targetOf };
