// The distance to the outline of an extruded shape (stage 5.2b): what the edge band needs on triangles, frames, circles,
// crescents, rings and segments, where a face's edge is not a straight line along its own bounding box.
//
// The outline is read off the geometry itself, so no shape needs to say what it looks like: on the front cap (the faces that
// look along +z), an edge that belongs to ONE triangle only is on the outline (a hole's boundary included: a frame's, a ring's);
// an edge two triangles share is inside. For every texel of a grid over the bounding box the field stores the distance to the
// nearest outline segment and the direction to it, in the shape's own (unscaled) units.
//
// The shape is placed with a non-uniform scale, so a distance in local units is not a world distance: moving d along the unit
// direction n in local space moves d * |scale * n| in the world, and the shader multiplies by that (PigmentResponse.js).
//
// One field per distinct outline (a texture of RES x RES half floats, 128 KB), kept for the life of the page: the shapes are
// the same every time one is made, and the fields are never disposed with a mesh.
import * as THREE from 'three';

export const FIELD_RES = 128;

/**
 * The outline's segments: flat [x0, y0, x1, y1, ...] of the edges that the front cap's triangles do not share.
 * @param {THREE.BufferGeometry} geo
 */
export function outlineSegments(geo) {
  const pos = geo.getAttribute('position');
  if (!pos) return [];
  const index = geo.getIndex();
  const tri = (/** @type {number} */ i) => (index ? [index.getX(3 * i), index.getX(3 * i + 1), index.getX(3 * i + 2)] : [3 * i, 3 * i + 1, 3 * i + 2]);
  const n = index ? index.count / 3 : pos.count / 3;
  // the front cap is where the extrusion ends: the faces that look along +z, at the greatest z
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nrm = new THREE.Vector3();
  const caps = [];
  let zMax = -Infinity;
  for (let i = 0; i < n; i++) {
    const [ia, ib, ic] = tri(i);
    a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
    nrm.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    if (nrm.z > 0.99) { caps.push([a.clone(), b.clone(), c.clone()]); zMax = Math.max(zMax, a.z); }
  }
  const key = (/** @type {THREE.Vector3} */ v) => `${Math.round(v.x * 1e4)},${Math.round(v.y * 1e4)}`;
  /** @type {Map<string, { count: number, seg: number[] }>} */
  const edges = new Map();
  for (const t of caps) {
    if (Math.abs(t[0].z - zMax) > 1e-4) continue;
    for (let e = 0; e < 3; e++) {
      const p = t[e], q = t[(e + 1) % 3];
      const kp = key(p), kq = key(q);
      const k = kp < kq ? `${kp}|${kq}` : `${kq}|${kp}`;
      const cur = edges.get(k);
      if (cur) cur.count += 1; else edges.set(k, { count: 1, seg: [p.x, p.y, q.x, q.y] });
    }
  }
  /** @type {number[]} */
  const out = [];
  edges.forEach((v) => { if (v.count === 1) out.push(...v.seg); });
  return out;
}

/**
 * The field's data: RES x RES texels over the box [min, max] (x, y), each RGBA = distance to the outline, the unit direction to
 * the nearest point on it (x, y: 0..1 encoding of -1..1), 1. Also the largest distance anywhere (the inscribed radius).
 * @param {number[]} seg outlineSegments @param {{ minX: number, minY: number, maxX: number, maxY: number }} box
 * @param {number} [res]
 */
export function fieldData(seg, box, res = FIELD_RES) {
  const data = new Float32Array(res * res * 4);
  let maxD = 0;
  const w = box.maxX - box.minX, h = box.maxY - box.minY;
  for (let j = 0; j < res; j++) {
    const y = box.minY + ((j + 0.5) / res) * h;
    for (let i = 0; i < res; i++) {
      const x = box.minX + ((i + 0.5) / res) * w;
      let best = Infinity, bx = 0, by = 0;
      for (let s = 0; s < seg.length; s += 4) {
        const x0 = seg[s], y0 = seg[s + 1], dx = seg[s + 2] - x0, dy = seg[s + 3] - y0;
        const l2 = dx * dx + dy * dy;
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / l2)) : 0;
        const px = x0 + t * dx, py = y0 + t * dy;
        const d2 = (x - px) * (x - px) + (y - py) * (y - py);
        if (d2 < best) { best = d2; bx = px - x; by = py - y; }
      }
      const d = Math.sqrt(best);
      const L = d > 1e-9 ? d : 1;
      const o = 4 * (j * res + i);
      data[o] = d; data[o + 1] = 0.5 + 0.5 * (bx / L); data[o + 2] = 0.5 + 0.5 * (by / L); data[o + 3] = 1;
      if (d > maxD) maxD = d;
    }
  }
  return { data, maxD };
}

/** @type {Map<string, { texture: THREE.DataTexture, radius: number }>} */
const cache = new Map();

/** A 1x1 stand-in for meshes without a field: a sampler uniform always needs a texture. */
export const emptyField = new THREE.DataTexture(new Uint16Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat, THREE.HalfFloatType);
emptyField.needsUpdate = true;

/**
 * The field of a geometry's outline (made once per distinct outline).
 * @param {THREE.BufferGeometry} geo
 * @returns {{ texture: THREE.DataTexture, radius: number } | null} null for a geometry with no outline to read
 */
export function edgeFieldFor(geo) {
  const seg = outlineSegments(geo);
  if (seg.length < 12) return null;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = /** @type {THREE.Box3} */ (geo.boundingBox);
  const key = `${bb.min.x.toFixed(4)},${bb.min.y.toFixed(4)},${bb.max.x.toFixed(4)},${bb.max.y.toFixed(4)}|${seg.length}|${seg.reduce((s, v, i) => s + v * (1 + (i % 7)), 0).toFixed(4)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { data, maxD } = fieldData(seg, { minX: bb.min.x, minY: bb.min.y, maxX: bb.max.x, maxY: bb.max.y });
  const half = new Uint16Array(data.length);
  for (let i = 0; i < data.length; i++) half[i] = THREE.DataUtils.toHalfFloat(data[i]);
  const texture = new THREE.DataTexture(half, FIELD_RES, FIELD_RES, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  const made = { texture, radius: maxD };
  cache.set(key, made);
  return made;
}
