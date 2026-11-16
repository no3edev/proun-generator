import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { HATCH_ANGLES, HATCH_GLSL, hatchShared, hatchAngle, hatchesSurface, hatchesShadow, setHatchNow, newHatchState, installShadowHatch } from '../src/texture/hatch.js';
import { patchFragment } from '../src/texture/PigmentResponse.js';
import { DYNAMICS } from '../src/config/defaults.js';

// Stage 5.2c: graphite hatching on the Mass backdrop (when dark) and about half the shadow planes; strategies only.
const cfg = (strategy, seed = 11) => ({ seed, composition: { strategy } });
const ent = (type, role, hex, x = 0, y = 0) => ({ type, role, hex, position: [x, y, 0] });

describe('the angle of a picture', () => {
  it('is one of the set, the same every time for a seed, and varies between seeds', () => {
    const set = new Set(HATCH_ANGLES.map((d) => (d * Math.PI) / 180));
    const seen = new Set();
    for (let s = 0; s < 60; s++) {
      const a = hatchAngle(s);
      expect(set.has(a)).toBe(true);
      expect(hatchAngle(s)).toBe(a);
      seen.add(a);
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });
});

describe('which surfaces are hatched', () => {
  it('the Mass backdrop when it is dark: the anchor disc or box, or the large dark plane behind a pale one', () => {
    expect(hatchesSurface(ent('circle', 'anchor', '#2a2926'), cfg('mass'))).toBe(true);
    expect(hatchesSurface(ent('plane', 'anchor', '#2a2926'), cfg('mass'))).toBe(true);
    expect(hatchesSurface(ent('cube-variable', 'anchor', '#2a2926'), cfg('mass'))).toBe(true);
    expect(hatchesSurface(ent('plane', 'support', '#2a2926'), cfg('mass'))).toBe(true);
  });
  it('not a pale backdrop, not the assembled blocks in front of it, not another strategy, not legacy, not without a config', () => {
    expect(hatchesSurface(ent('circle', 'anchor', '#e8e4da'), cfg('mass'))).toBe(false);
    expect(hatchesSurface(ent('cube-variable', 'support', '#2a2926'), cfg('mass'))).toBe(false);
    expect(hatchesSurface(ent('circle', 'anchor', '#2a2926'), cfg('axis-thrust'))).toBe(false);
    expect(hatchesSurface(ent('circle', 'anchor', '#2a2926'), cfg('legacy'))).toBe(false);
    expect(hatchesSurface(ent('circle', 'anchor', '#2a2926'), null)).toBe(false);
  });
  it('about half of the shadow planes, by seed, the same each time, none under legacy', () => {
    let n = 0;
    for (let i = 0; i < 400; i++) if (hatchesShadow(ent('beam', 'detail', '#888', i * 0.37, i * 0.11), cfg('axis-thrust', 7))) n++;
    expect(n / 400).toBeGreaterThan(0.4);
    expect(n / 400).toBeLessThan(0.6);
    const e = ent('triangle', 'accent', '#c33', 1.2, -0.4);
    expect(hatchesShadow(e, cfg('axis-thrust', 7))).toBe(hatchesShadow(e, cfg('axis-thrust', 7)));
    expect(hatchesShadow(e, cfg('legacy', 7))).toBe(false);
    expect(hatchesShadow(e, null)).toBe(false);
  });
});

describe('setting it on a mesh', () => {
  const mk = () => ({ userData: { front: newHatchState(), shadow: { mesh: { userData: { hatch: newHatchState() } } } } });
  it('gives the backdrop its amount, angle and seed, and a shadow plane its own amount', () => {
    const m = mk();
    setHatchNow(/** @type {any} */ (m), ent('circle', 'anchor', '#2a2926'), cfg('mass', 11));
    expect(m.userData.front.uHatchAmt.value).toBe(1);
    expect(m.userData.front.uHatchAng.value).toBe(hatchAngle(11));
    expect(m.userData.shadow.mesh.userData.hatch.uHatchAng.value).toBe(hatchAngle(11));
  });
  it('takes it all away under legacy', () => {
    const m = mk();
    setHatchNow(/** @type {any} */ (m), ent('circle', 'anchor', '#2a2926'), cfg('mass', 11));
    setHatchNow(/** @type {any} */ (m), ent('circle', 'anchor', '#2a2926'), cfg('legacy', 11));
    expect(m.userData.front.uHatchAmt.value).toBe(0);
    expect(m.userData.shadow.mesh.userData.hatch.uHatchAmt.value).toBe(0);
  });
  it('leaves a mesh without the state alone', () => {
    expect(() => setHatchNow(/** @type {any} */ ({ userData: {} }), ent('circle', 'anchor', '#222'), cfg('mass'))).not.toThrow();
  });
});

describe('the shaders', () => {
  it('the lab numbers start at the defaults', () => {
    expect(hatchShared.uHatchSpacing.value).toBe(DYNAMICS.hatch.spacing);
    expect(HATCH_GLSL).toContain('vec3 hatchApplyW(');
    expect(HATCH_GLSL).toContain('vec3 hatchBlend(');
  });
  it('the pigment shader applies it after the edge block, behind the per-mesh amount and the lab switch', () => {
    const out = patchFragment('void main() {\n#include <map_fragment>\n}');
    expect(out).toContain('if ( uHatchOn > 0.5 ) diffuseColor.rgb = hatchBlend( diffuseColor.rgb, pWc, uFront );');
    expect(out.indexOf('uEdgeAmt > 0.0 &&')).toBeLessThan(out.indexOf('hatchBlend( diffuseColor.rgb, pWc'));
  });
  it('a shadow plane\'s flat material is patched with the lines, and the programs are shared', () => {
    const child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    installShadowHatch(child);
    const mat = /** @type {THREE.MeshBasicMaterial} */ (child.material);
    const shader = /** @type {any} */ ({ uniforms: {}, vertexShader: 'void main() {\n#include <begin_vertex>\n}', fragmentShader: 'void main() {\n#include <color_fragment>\n}' });
    mat.onBeforeCompile(shader, /** @type {any} */ ({}));
    expect(shader.vertexShader).toContain('vHatchP');
    expect(shader.fragmentShader).toContain('hatchBlend( diffuseColor.rgb, vHatchP, uHatchMix )');
    expect(shader.fragmentShader).toContain('uniform float uHatchMix;');
    expect(shader.fragmentShader).toContain('float vnoise(');
    expect(shader.uniforms.uHatchAmt).toBe(child.userData.hatch.uHatchAmt);
    expect(shader.uniforms.uHatchSpacing).toBe(hatchShared.uHatchSpacing);
    expect(mat.customProgramCacheKey()).toBe('shadow-hatch-1');
  });
});

describe('a change of hatching goes through the transition (v0.14.7)', () => {
  const mk = () => ({ userData: { front: newHatchState(), shadow: { mesh: { userData: { hatch: newHatchState() } } } } });
  it('what the surface had is kept as what it fades out of, when it is given what it will have', () => {
    const m = mk();
    setHatchNow(/** @type {any} */ (m), ent('circle', 'anchor', '#2a2926'), cfg('mass', 11));      // dark backdrop: hatched at seed 11's angle
    expect(m.userData.front.uHatchAmt.value).toBe(1);
    const ang11 = m.userData.front.uHatchAng.value, seed11 = m.userData.front.uHatchSeed.value;
    setHatchNow(/** @type {any} */ (m), ent('circle', 'anchor', '#e8e4da'), cfg('mass', 529));     // a pale backdrop: the lines go
    expect(m.userData.front.uHatchAmt.value).toBe(0);
    expect(m.userData.front.uHatchFromAmt.value).toBe(1);
    expect(m.userData.front.uHatchFromAng.value).toBe(ang11);
    expect(m.userData.front.uHatchFromSeed.value).toBe(seed11);
  });
  it('a shadow plane remembers too, and starts a change at its old hatching (mix 1 at rest)', () => {
    const m = mk();
    expect(m.userData.shadow.mesh.userData.hatch.uHatchMix.value).toBe(1);
    setHatchNow(/** @type {any} */ (m), ent('beam', 'detail', '#888', 1, 2), cfg('axis-thrust', 7));
    const first = m.userData.shadow.mesh.userData.hatch.uHatchAmt.value;
    setHatchNow(/** @type {any} */ (m), ent('beam', 'detail', '#888', 3, 4), cfg('axis-thrust', 8));
    expect(m.userData.shadow.mesh.userData.hatch.uHatchFromAmt.value).toBe(first);
  });
  it('at rest (mix 1) only the new hatching is drawn: the blend skips the old one', () => {
    expect(HATCH_GLSL).toContain('if ( uHatchFromAmt > 0.5 && m < 1.0 )');
  });
});
