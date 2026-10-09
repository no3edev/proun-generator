import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('../src/texture/PigmentLayer.js', async () => {
  const T = await import('three');
  return { pickStructureTexture: () => new T.Texture() };
});

const { boxMesh, paintMesh, clampColor, BOX_SHADE_MULTIPLIERS } = await import('../src/texture/materials.js');
const { default: sphere } = await import('../src/shapes/sphere.js');
const { Tween } = await import('../src/core/Tween.js');

// reference implementation of the shading math (what Tween used to do inline)
const reference = (base, mult) => clampColor(new THREE.Color().copy(base).multiplyScalar(mult));
const close = (a, b) => ['r', 'g', 'b'].every((k) => Math.abs(a[k] - b[k]) < 1e-6);

describe('material-based shading (box)', () => {
  it('paints every face material as clamp(base x its multiplier) — identical to the old Tween math', () => {
    const mesh = boxMesh('#c1362b', 'cube-fixed');
    for (const hex of ['#c1362b', '#336699', '#ffffff', '#000000', '#f2ede2']) {
      const base = new THREE.Color(hex);
      paintMesh(mesh, base);
      mesh.material.forEach((mat, i) => {
        expect(close(mat.color, reference(base, BOX_SHADE_MULTIPLIERS[i]))).toBe(true);
      });
    }
  });

  it('a bright color never exceeds 1 on any channel (clamped)', () => {
    const mesh = boxMesh('#ffffff', 'cube-fixed');
    paintMesh(mesh, new THREE.Color('#ffffff'));
    mesh.material.forEach((m) => ['r', 'g', 'b'].forEach((k) => expect(m.color[k]).toBeLessThanOrEqual(1)));
  });
});

describe('vertex shading (sphere)', () => {
  const mesh = sphere.create('#c1362b');
  const attr = mesh.geometry.attributes.color;

  // paint mid-gray (0.5): each vertex then equals 0.5 x its facet factor (factors <= 1.2 -> no clamp)
  paintMesh(mesh, new THREE.Color().setRGB(0.5, 0.5, 0.5));
  const factors = Array.from({ length: attr.count }, (_, v) => attr.getX(v) / 0.5);

  it('shades per facet: all three vertices of a facet share one color', () => {
    for (let f = 0; f < attr.count / 3; f++) {
      const [a, b, c] = [0, 1, 2].map((j) => [attr.getX(f * 3 + j), attr.getY(f * 3 + j), attr.getZ(f * 3 + j)]);
      expect(b).toEqual(a);
      expect(c).toEqual(a);
    }
  });

  it('every vertex equals clamp(base x facet factor), for any base color', () => {
    const base = new THREE.Color().setRGB(0.2, 0.4, 0.8);
    paintMesh(mesh, base);
    for (let v = 0; v < attr.count; v += 37) {
      const ref = reference(base, factors[v]);
      expect(Math.abs(attr.getX(v) - ref.r)).toBeLessThan(1e-5);
      expect(Math.abs(attr.getY(v) - ref.g)).toBeLessThan(1e-5);
      expect(Math.abs(attr.getZ(v) - ref.b)).toBeLessThan(1e-5);
    }
  });

  it('clamps: a bright base never pushes a vertex channel above 1', () => {
    // facet factors reach ~1.2, so white x factor > 1 unless clamped
    paintMesh(mesh, new THREE.Color('#ffffff'));
    let max = 0;
    for (let v = 0; v < attr.count; v++) max = Math.max(max, attr.getX(v), attr.getY(v), attr.getZ(v));
    expect(max).toBeLessThanOrEqual(1);
    expect(factors.some((f) => f > 1)).toBe(true); // i.e. the clamp really is exercised here
  });

  it('flags the attribute for GPU upload on every repaint', () => {
    const before = attr.version;
    paintMesh(mesh, new THREE.Color('#123456'));
    expect(attr.version).toBeGreaterThan(before);
  });
});

describe('Tween (no GL needed)', () => {
  const target = (x, hex) => ({
    position: new THREE.Vector3(x, 0, 0),
    rotation: { x: 0, y: 0, z: 0 },
    scale: new THREE.Vector3(1, 1, 1),
    hex
  });
  const fresh = () => {
    const mesh = boxMesh('#000000', 'cube-fixed');
    mesh.position.set(0, 0, 0);
    return mesh;
  };

  it('eases to the exact target position, scale and color, then stops', () => {
    const mesh = fresh();
    Tween.add(mesh, target(10, '#336699'), 1000);
    Tween.update(500);
    expect(mesh.position.x).toBeGreaterThan(0);
    expect(mesh.position.x).toBeLessThan(10);
    Tween.update(600);
    expect(mesh.position.x).toBe(10);
    expect(mesh.scale.toArray()).toEqual([1, 1, 1]);
    expect(mesh.userData.baseColor.equals(new THREE.Color('#336699'))).toBe(true);
    mesh.material.forEach((mat, i) => {
      expect(close(mat.color, reference(new THREE.Color('#336699'), BOX_SHADE_MULTIPLIERS[i]))).toBe(true);
    });
    Tween.update(100); // finished tweens are dropped
    expect(mesh.position.x).toBe(10);
  });

  it('interrupting mid-flight restarts from the color actually on screen (no snap)', () => {
    const mesh = fresh();
    Tween.add(mesh, target(0, '#ffffff'), 1000);
    Tween.update(400);
    const mid = mesh.userData.baseColor.clone();
    expect(mid.equals(new THREE.Color('#000000'))).toBe(false);
    expect(mid.equals(new THREE.Color('#ffffff'))).toBe(false);
    Tween.add(mesh, target(0, '#ff0000'), 1000);
    Tween.update(0);
    expect(close(mesh.userData.baseColor, mid)).toBe(true);
    Tween.removeForMesh(mesh);
  });

  it('removeForMesh cancels a running tween', () => {
    const mesh = fresh();
    Tween.add(mesh, target(10, '#336699'), 1000);
    Tween.removeForMesh(mesh);
    Tween.update(2000);
    expect(mesh.position.x).toBe(0);
  });

  it('a second tween on the same mesh replaces the first instead of fighting it', () => {
    const mesh = fresh();
    Tween.add(mesh, target(10, '#336699'), 1000);
    Tween.add(mesh, target(-4, '#336699'), 1000);
    Tween.update(2000);
    expect(mesh.position.x).toBe(-4);
  });
});
