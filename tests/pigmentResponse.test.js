import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { patchFragment, patchVertex } from '../src/texture/PigmentResponse.js';

// Guards the shader injection against a three.js upgrade moving its anchors.
describe('patchFragment', () => {
  const src = THREE.ShaderLib.basic.fragmentShader;
  it('finds both anchors in this three.js version and injects the response', () => {
    const out = patchFragment(src);
    expect(out).not.toBe(src);
    expect(out).toContain('uniform float uFront;');
    // declarations come before main(), the body right after the map chunk
    expect(out.indexOf('uniform float uFront;')).toBeLessThan(out.indexOf('void main()'));
    expect(out.indexOf('#include <map_fragment>')).toBeLessThan(out.indexOf('fArrived'));
    // behind a uniform branch, so rest takes the original path
    expect(out).toContain('if ( uFront < 1.0 )');
    // tunable from the lab: edge width, grain and tone are uniforms
    expect(out).toContain('uniform float uFrontSoft;');
    expect(out).toContain('uniform float uTone;');
    // overpainting never reaches for the paper: no paper uniform in the shader
    expect(out).not.toContain('uPaper');
    // the paint field is a pure function: no time, no randomness, no texture lookup of its own
    expect(out).toContain('vec2 paintField(');
    expect(out).not.toMatch(/Math\.random|uTime/);
    // the legacy pattern path stays when procedural paint is off
    expect(out).toContain('if ( uPaintOn > 0.5 )');
    expect(out).toContain('sampledDiffuseColor.rgb');
    expect(out).not.toContain('@W');
    expect(out).not.toContain('@DS@');
    // strokes never flip in one frame: no hard comparison of the face's sides
    expect(out).not.toContain('dm.x >= dm.y');
    expect(out).toContain('smoothstep( 0.7, 0.9');
    // an interrupted change keeps the layer it interrupted
    expect(out).toContain('uniform float uFrontA;');
    expect(out).toContain('fArrivedA');
  });
  it('leaves an unknown shader untouched', () => {
    expect(patchFragment('void nothing() {}')).toBe('void nothing() {}');
  });
});

describe('color front injection', () => {
  it('adds the front to both shaders, behind a uniform branch', () => {
    const f = patchFragment(THREE.ShaderLib.basic.fragmentShader);
    expect(f).toContain('if ( uFront < 1.0 )');
    const v = patchVertex(THREE.ShaderLib.basic.vertexShader);
    expect(v).toContain('vFrontPos = position;');
    expect(v).toContain('vPaintPos = position * pScale;');
    expect(v.indexOf('varying vec3 vFrontPos;')).toBeLessThan(v.indexOf('void main()'));
  });
  it('leaves an unknown vertex shader untouched', () => {
    expect(patchVertex('void nothing() {}')).toBe('void nothing() {}');
  });
});
