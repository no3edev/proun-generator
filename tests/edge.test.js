import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { hasEdge, edgeKind, edgeWanted, setEdgeNow } from '../src/texture/edge.js';
import { outlineSegments, fieldData, edgeFieldFor, emptyField } from '../src/texture/edgeField.js';
import { patchFragment } from '../src/texture/PigmentResponse.js';
import { DYNAMICS } from '../src/config/defaults.js';

// Stage 5.2a: the edge character of box-like faces belongs to strategies' box shapes only; legacy never has it.
const front = () => ({ uEdgeAmt: { value: 0 }, uEdgeKind: { value: 0 }, uEdgeSdf: { value: emptyField }, uEdgeR: { value: 0 } });
const mesh = (geoType, shapeType) => ({ geometry: { type: geoType }, userData: { shapeType, front: front() } });
const triangleGeo = () => { const sh = new THREE.Shape(); sh.moveTo(-0.5, -0.5); sh.lineTo(0.5, -0.5); sh.lineTo(0, 0.5); sh.closePath(); const g = new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: false }); g.center(); return g; };
const cfg = (strategy) => ({ composition: { strategy } });

describe('which meshes have an edge band', () => {
  it('boxes read their edge from the face, extruded outlines and discs from a field; a rod and the sphere have none', () => {
    expect(edgeKind(mesh('BoxGeometry', 'beam'))).toBe('box');
    expect(edgeKind(mesh('BoxGeometry', 'cube-fixed'))).toBe('box');
    expect(edgeKind(mesh('BoxGeometry', 'rod'))).toBe(null);
    expect(edgeKind(mesh('ExtrudeGeometry', 'triangle'))).toBe('field');
    expect(edgeKind(mesh('CircleGeometry', 'circle'))).toBe('field');
    expect(hasEdge(mesh('IcosahedronGeometry', 'sphere'))).toBe(false);
    expect(hasEdge(/** @type {any} */ ({ userData: {} }))).toBe(false);
  });
});

describe('which compositions want it', () => {
  it('any strategy, not the legacy generator, not a missing config', () => {
    expect(edgeWanted(cfg('axis-thrust'))).toBe(true);
    expect(edgeWanted(cfg('legacy'))).toBe(false);
    expect(edgeWanted(null)).toBe(false);
  });
  it('sets the amount on the mesh and takes it off again when the composition goes back to legacy', () => {
    const m = mesh('BoxGeometry', 'beam');
    setEdgeNow(/** @type {any} */ (m), cfg('axis-thrust'));
    expect(m.userData.front.uEdgeAmt.value).toBe(1);
    setEdgeNow(/** @type {any} */ (m), cfg('legacy'));
    expect(m.userData.front.uEdgeAmt.value).toBe(0);
    const rod = mesh('BoxGeometry', 'rod');
    setEdgeNow(/** @type {any} */ (rod), cfg('axis-thrust'));
    expect(rod.userData.front.uEdgeAmt.value).toBe(0);
  });
  it('an extruded outline gets its field and radius, and gives them up again under legacy', () => {
    const m = { geometry: triangleGeo(), userData: { shapeType: 'triangle', front: front() } };
    setEdgeNow(/** @type {any} */ (m), cfg('axis-thrust'));
    expect(m.userData.front.uEdgeAmt.value).toBe(1);
    expect(m.userData.front.uEdgeKind.value).toBe(1);
    expect(m.userData.front.uEdgeSdf.value).not.toBe(emptyField);
    expect(m.userData.front.uEdgeR.value).toBeGreaterThan(0.2);   // the unit triangle's inscribed radius is about 0.29
    setEdgeNow(/** @type {any} */ (m), cfg('legacy'));
    expect(m.userData.front.uEdgeAmt.value).toBe(0);
    expect(m.userData.front.uEdgeKind.value).toBe(0);
    expect(m.userData.front.uEdgeSdf.value).toBe(emptyField);
  });
  it('a mesh without the colour-front state is left alone', () => {
    expect(() => setEdgeNow(/** @type {any} */ ({ geometry: { type: 'BoxGeometry' }, userData: {} }), cfg('axis-thrust'))).not.toThrow();
  });
});

describe('the shader', () => {
  it('carries the edge block after the highlight, only behind the per-mesh amount and the lab switch', () => {
    const src = 'void main() {\n#include <map_fragment>\n}';
    const out = patchFragment(src);
    expect(out).toContain('uniform float uEdgeAmt;');
    expect(out).toContain('if ( uEdgeAmt > 0.0 && uEdgeOn > 0.5 )');
    expect(out.indexOf('uHiAmt > 0.0')).toBeLessThan(out.indexOf('uEdgeAmt > 0.0 &&'));
  });
});

describe('the outline of an extruded shape', () => {
  it('is the front cap\'s unshared edges: a triangle has three', () => {
    const seg = outlineSegments(triangleGeo());
    expect(seg.length / 4).toBe(3);
  });
  it('a hole\'s boundary counts too: a square with a square hole has eight', () => {
    const sh = new THREE.Shape(); sh.moveTo(-1, -1); sh.lineTo(1, -1); sh.lineTo(1, 1); sh.lineTo(-1, 1); sh.closePath();
    const hole = new THREE.Path(); hole.moveTo(-0.5, -0.5); hole.lineTo(-0.5, 0.5); hole.lineTo(0.5, 0.5); hole.lineTo(0.5, -0.5); hole.closePath();
    sh.holes.push(hole);
    expect(outlineSegments(new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: false })).length / 4).toBe(8);
  });
  it('a disc\'s rim is its outline (the fan\'s inner edges are shared)', () => {
    expect(outlineSegments(new THREE.CircleGeometry(0.75, 48)).length / 4).toBe(48);
  });
});

describe('the distance field', () => {
  const square = [-0.5, -0.5, 0.5, -0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5];
  const box = { minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 };
  const texel = (d, res, x, y) => { const i = Math.floor((x + 0.5) * res), j = Math.floor((y + 0.5) * res); const o = 4 * (j * res + i); return { d: d[o], nx: d[o + 1] * 2 - 1, ny: d[o + 2] * 2 - 1 }; };
  it('is the distance to the nearest edge, with the direction to it', () => {
    const { data, maxD } = fieldData(square, box, 64);
    const mid = texel(data, 64, 0.0, 0.0);
    expect(mid.d).toBeCloseTo(0.5, 1);
    expect(maxD).toBeCloseTo(0.5, 1);
    const nearRight = texel(data, 64, 0.4, 0.05);
    expect(nearRight.d).toBeCloseTo(0.1, 1);
    expect(nearRight.nx).toBeCloseTo(1, 1);          // the nearest outline is on the right
    expect(Math.abs(nearRight.ny)).toBeLessThan(0.1);
    const nearTop = texel(data, 64, -0.05, 0.4);
    expect(nearTop.ny).toBeCloseTo(1, 1);
  });
  it('makes one texture per distinct outline and reuses it', () => {
    const a = edgeFieldFor(triangleGeo()), b = edgeFieldFor(triangleGeo());
    expect(a && b && a.texture === b.texture).toBe(true);
    expect(edgeFieldFor(new THREE.CircleGeometry(0.75, 48))).not.toBe(null);
    expect(/** @type {any} */ (edgeFieldFor(new THREE.CircleGeometry(0.75, 48))).radius).toBeCloseTo(0.75, 1);
    expect(edgeFieldFor(new THREE.BufferGeometry())).toBe(null);
  });
});

describe('the silhouette (stage 5.3)', () => {
  const out = patchFragment('void main() {\n#include <map_fragment>\n}');
  it('the shader tests whether the face beyond an edge looks away from the camera, for every edge of a box face', () => {
    expect(out).toContain('float silCover( float d, vec3 nb, vec2 pw )');
    expect(out).toContain('dot( normalize( nb / vPaintScale ), vToCamObj )');
    expect(out).toContain('sCover = min( silCover( eIn.x,');   // both of a box face's edges: a corner is as soft as the sides
    expect(out).toContain('silCover( eD, vec3( eDir, 0.0 ), pWc )');   // an extruded cap: the outline's normal
    expect(out).toContain('min( silCover( zF,');                      // an extrusion's side wall: the two caps
  });
  it('the coverage goes to the fragment\'s alpha only where the edge band is on', () => {
    expect(out).toContain('diffuseColor.a *= mix( 1.0, sCover, uEdgeAmt );');
  });
  it('the defaults are subtle: about a pixel at 1x, in world lengths', () => {
    expect(DYNAMICS.silhouette.softness).toBeGreaterThan(0.005);
    expect(DYNAMICS.silhouette.softness).toBeLessThan(0.03);
    expect(DYNAMICS.silhouette.irregularity).toBeLessThan(0.03);
  });
});
