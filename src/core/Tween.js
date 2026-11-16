import * as THREE from 'three';
import { Billboard } from './Billboard.js';
import { paintMesh, setShade, shiftShade, settleShade } from '../texture/materials.js';
import { updateHighlight } from '../texture/highlight.js';
import { Rhythm } from './Rhythm.js';
import { easeAt } from './schedule.js';

// Eases position/scale (lerp), rotation (quaternion slerp — shortest
// path), and color (see below; classic RGB lerp of the base color, repainted each frame via
// paintMesh() — Tween knows nothing about how a shape is shaded; see the
// shading contract in texture/materials.js). No external dependency.

const active = [];
// The last tween of each mesh, kept after it finishes so the lab's pause can
// scrub the last change back and forth (0 = before, 1 = after) even when
// nothing is animating any more. Cleared per mesh by removeForMesh/add.
/** @type {Map<THREE.Mesh, any>} */
const finished = new Map();
/** finished tweens the pause has moved off their end state */
/** @type {Set<any>} */
const scrubbed = new Set();
const scratchColor = new THREE.Color(); // reused every frame — no per-frame allocation

// Color travels one of two ways. Classic: the base color is lerped in RGB
// every frame (what every shape did before). Front: the mesh is painted its
// NEW color at once and a per-mesh `front` number sweeps the old color away
// in the shader (see texture/PigmentResponse.js) — only for meshes that
// carry the front state (everything built by materialSetMesh; not the
// sphere, which keeps the classic lerp).
const colorFront = { enabled: true, delay: 0.1 };

/** Lab hook: choose how color travels, and how long after the geometry starts it begins. */
export function setColorFront(p) {
  colorFront.enabled = !!p.enabled;
  colorFront.delay = Math.min(0.9, Math.max(0, p.delay));
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
  finished.delete(mesh);
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
 * Makes the running tween of `mesh` end within `ms` from now, if it would take longer, WITHOUT moving the mesh: the progress
 * (and so the picture) stays exactly where it is, only the rest of the way is travelled faster. Used for shapes still
 * shrinking away from a slow change when a new change starts: they leave with the new change instead of lingering in it for
 * the rest of the old, longer one. A tween with no more than `ms` left, or no tween, is left alone.
 * @param {THREE.Mesh} mesh
 * @param {number} ms
 * @returns {boolean} whether it was shortened
 */
export function finishWithin(mesh, ms) {
  const t = active.find((a) => a.mesh === mesh);
  if (!t || !(ms > 0)) return false;
  const remaining = t.endMs - t.elapsed;       // until the last of its geometry, colour and material is done
  if (remaining <= ms) return false;
  // squeeze the whole timeline (window, every track's delay and span, and the time already spent) by the same factor: what is on
  // screen stays exactly as it is, and the rest is travelled in `ms`
  const k = ms / remaining;
  t.duration *= k; t.elapsed *= k; t.endMs *= k;
  t.startMs *= k; t.spanMs *= k; t.cStartMs *= k; t.cSpanMs *= k; t.mStartMs *= k; t.mSpanMs *= k;
  return true;
}

/** the plain cubic over the whole window: what every shape did before Stage 6.2 */
const PLAIN = { ease: /** @type {const} */ ('cubic'), mix: 0 };

/**
 * @param {THREE.Mesh} mesh
 * @param {{position: THREE.Vector3, rotation: {x:number,y:number,z:number}, scale: THREE.Vector3, hex: string, shade?: number[] | null}} target
 *        `shade`: the new per-face tone (tone.js), if the composition retones the shape;
 *        `highlight`: its selective highlight ({ on, dir: THREE.Vector3, tint: THREE.Color }, see texture/highlight.js);
 *        `shadow`: where its graphic shadow plane goes ({ local: THREE.Vector3, color: THREE.Color | null }, see texture/shadow.js)
 * @param {number} duration ms: the transition WINDOW; the shape's own part of it is `schedule`
 * @param {() => void} [onComplete] called once, when the tween reaches its end (not when it is canceled by another
 *        tween on the same mesh or by removeForMesh, and not while the lab's pause holds it): Composition uses it to
 *        dispose a shape that has finished shrinking away
 * @param {import('./schedule.js').Schedule | null} [schedule] when in the window the shape starts, how long it takes and how it
 *        eases (core/schedule.js); none = the whole window with one cubic ease
 */
export function add(mesh, target, duration, onComplete, schedule = null) {
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
  const front = colorFront.enabled ? mesh.userData.front : null;
  if (front) {
    // What is on screen now becomes the layer under the new change.
    // Uninterrupted: just the colour that had landed. Interrupted mid-change:
    // the change in flight is kept frozen where it was (its patches stay
    // changed) and the new one covers it; an older layer still unfinished by
    // then is settled onto its target (the one case that can pop).
    const landed = mesh.userData.baseColor;
    // the tone of each face moves through the same layers as the colour (a tone that changes rides the colour front)
    shiftShade(mesh, front.uFront.value < 1);
    // the paint grain moves through the layers too: if setPaintSlot() just gave this shape another part's paint the old grain is already kept, else it is the one in force
    if (front.uSeedFrom) {
      if (front.seedFromSet) front.seedFromSet = false;
      else front.uSeedFrom.value.copy(front.uSeed.value);
    }
    if (front.uFront.value < 1) {
      front.uFrom.value.copy(front.uMid.value);
      front.uMid.value.copy(landed);
      front.uFrontA.value = front.uFront.value;
    } else {
      front.uFrom.value.copy(landed);
      front.uMid.value.copy(landed);
      front.uFrontA.value = 1;
    }
    front.uFront.value = 0;
    // the new tone and colour are in place from the first frame; the shader reveals them
    if (target.shade) setShade(mesh, target.shade);
    paintMesh(mesh, targetColor);
  } else {
    const f = mesh.userData.front;
    if (f) {
      f.uFront.value = 1;
      if (f.uSeedFrom) { f.seedFromSet = false; f.uSeedFrom.value.copy(f.uSeed.value); }
    }
    if (target.shade) { setShade(mesh, target.shade); settleShade(mesh); } // no front to ride: the tone changes at once
  }
  // the shadow plane (a child) eases from where it is to where it is wanted: out from behind the parent, or back behind it
  const sh = mesh.userData.shadow;
  let shadow = null;
  if (sh && target.shadow) {
    const m = sh.mesh;
    shadow = {
      m, startPos: m.position.clone(), startColor: m.material.color.clone(),
      endPos: target.shadow.local.clone(), endColor: target.shadow.color ? target.shadow.color.clone() : m.material.color.clone(),
      shown: false
    };
    // A shadow plane tucked behind its parent at both ends (not wanted before, not wanted now) is exactly where its parent is and
    // drew over it for the whole change: a white copy (its colour until it is given one) flickering over the shape. It is drawn only
    // when it is, at one end or the other, out from behind.
    shadow.shown = shadow.startPos.lengthSq() > 1e-12 || shadow.endPos.lengthSq() > 1e-12;
    // one that comes out from behind starts in the colour it will have, not in whatever it had when it was last tucked away
    if (shadow.startPos.lengthSq() <= 1e-12) shadow.startColor.copy(shadow.endColor);
    if (shadow.shown) m.visible = true;
  }
  // the highlight's amount fades with the geometry's easing, from what it is now; its strip follows the form (see applyTween)
  const hf = mesh.userData.front;
  let highlight = null;
  if (hf && hf.uHiN && target.highlight) {
    hf.hiDir.copy(target.highlight.dir);
    hf.uHiTint.value.copy(target.highlight.tint);
    highlight = { f: hf, start: hf.uHiAmt.value, end: target.highlight.on ? 1 : 0 };
  }
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
    // three timelines inside the window (ms): the geometry's, the colour's (the sweep and the tone with it) and the material's
    // (highlight, the shadow's colour, hatching); with no schedule all three are the whole window with the plain cubic
    startMs: schedule ? schedule.delay * duration : 0,
    spanMs: schedule ? schedule.span * duration : duration,
    ease: schedule ? { ease: schedule.ease, mix: schedule.mix } : PLAIN,
    cStartMs: schedule ? schedule.color.delay * duration : 0,
    cSpanMs: schedule ? schedule.color.span * duration : duration,
    cEase: schedule ? { ease: schedule.color.ease, mix: schedule.color.mix } : PLAIN,
    mStartMs: schedule ? schedule.material.delay * duration : 0,
    mSpanMs: schedule ? schedule.material.span * duration : duration,
    mEase: schedule ? { ease: schedule.material.ease, mix: schedule.material.mix } : PLAIN,
    endMs: schedule
      ? Math.max(schedule.delay + schedule.span, schedule.color.delay + schedule.color.span, schedule.material.delay + schedule.material.span) * duration
      : duration,
    elapsed: 0,
    front,
    shadow,
    highlight,
    delay: colorFront.delay,
    onComplete
  });
}

/**
 * A progress 0..1 along a timeline that starts `startMs` into the change and takes `spanMs`.
 * @param {number} elapsed @param {number} startMs @param {number} spanMs
 */
function along(elapsed, startMs, spanMs) {
  return Math.min(Math.max((elapsed - startMs) / spanMs, 0), 1);
}

/**
 * Puts a tween's mesh where it is `t.elapsed` ms into the change. Three timelines run inside the window, each independent of the
 * others (Stage 6.3): the GEOMETRY (position, rotation, scale, the shadow plane's place, the highlight strip following the form),
 * the COLOUR (the new colour's sweep and the tone with it) and the MATERIAL (the highlight's amount, the shadow's colour and hatching).
 * @returns {boolean} whether all three are over
 */
function applyTween(t) {
  const p = along(t.elapsed, t.startMs, t.spanMs);          // geometry
  const e = easeAt(t.ease, p);
  const pc = along(t.elapsed, t.cStartMs, t.cSpanMs);       // colour
  const ec = easeAt(t.cEase, pc);
  const pm = along(t.elapsed, t.mStartMs, t.mSpanMs);       // material
  const em = easeAt(t.mEase, pm);

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

  if (t.highlight) {
    const h = t.highlight;
    h.f.uHiAmt.value = pm >= 1 ? h.end : h.start + (h.end - h.start) * em;
    if (h.f.uHiAmt.value > 0 || h.start > 0) updateHighlight(t.mesh); // the strip follows the form as it turns and resizes
  }
  if (t.shadow) {
    const sd = t.shadow;
    // the shadow plane's hatching goes through its change with it (hatch.js): the old fades out as the new fades in
    if (sd.m.userData.hatch) sd.m.userData.hatch.uHatchMix.value = pm >= 1 ? 1 : em;
    // where it is follows the geometry; what it looks like follows the material
    if (p >= 1) {
      sd.m.position.copy(sd.endPos);
      sd.m.visible = sd.endPos.lengthSq() > 1e-12; // tucked behind its parent again: nothing to draw
    } else {
      sd.m.visible = sd.shown;
      sd.m.position.lerpVectors(sd.startPos, sd.endPos, e);
    }
    if (pm >= 1) sd.m.material.color.copy(sd.endColor);
    else sd.m.material.color.copy(sd.startColor).lerp(sd.endColor, em);
  }
  if (t.front) {
    t.front.uFront.value = pc >= 1 ? 1 : Math.min(1, Math.max(0, (ec - t.delay) / (1 - t.delay)));
  } else {
    paintMesh(t.mesh, pc >= 1 ? t.endColor : scratchColor.copy(t.start.baseColor).lerp(t.endColor, ec));
  }
  return t.elapsed >= t.endMs;
}

export function update(dt) {
  if (Rhythm.hold !== null) {
    // The lab's pause: every change, running or just finished, is shown
    // `hold` durations in — geometry and color together. Nothing completes
    // or is dropped, so the slider can go back and forth.
    for (const t of active) {
      t.elapsed = Rhythm.hold * t.duration;
      applyTween(t);
    }
    for (const t of finished.values()) {
      t.elapsed = Rhythm.hold * t.duration;
      applyTween(t);
      scrubbed.add(t);
    }
    return;
  }

  if (scrubbed.size) {
    // released: a change the pause left part-way carries on from there
    for (const t of scrubbed) {
      if (t.elapsed < t.duration && finished.get(t.mesh) === t) {
        finished.delete(t.mesh);
        active.push(t);
      }
    }
    scrubbed.clear();
  }

  for (let i = active.length - 1; i >= 0; i--) {
    const t = active[i];
    t.elapsed += dt;
    if (applyTween(t)) {
      active.splice(i, 1);
      finished.set(t.mesh, t);
      if (t.onComplete) t.onComplete();
    }
  }
}

/** The meshes that have a tween running (diagnostics and the interruption fuzz tests: there must be at most one each). @returns {THREE.Mesh[]} */
export function activeMeshes() {
  return active.map((t) => t.mesh);
}

/** Ms until the running tween of `mesh` is over (its last timeline), or null (diagnostics and the interruption fuzz tests). @param {THREE.Mesh} mesh */
export function remainingOf(mesh) {
  const t = active.find((a) => a.mesh === mesh);
  return t ? Math.max(0, t.endMs - t.elapsed) : null;
}

/** Sizes of Tween's own bookkeeping, to see that nothing grows in a long session (diagnostics and the soak test). */
export function stats() {
  return { active: active.length, finished: finished.size, scrubbed: scrubbed.size };
}

export const Tween = { add, update, removeForMesh, targetOf, finishWithin, activeMeshes, remainingOf, stats };
