import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { mulberry32 } from '../src/generator/rng.js';

// Canvas textures need a DOM; the contract doesn't depend on them.
vi.mock('../src/texture/PigmentLayer.js', async () => {
  const T = await import('three');
  return { pickStructureTexture: () => new T.Texture() };
});

const { shapeRegistry } = await import('../src/shapes/registry.js');
const { paintMesh, disposeMesh } = await import('../src/texture/materials.js');

afterEach(() => vi.restoreAllMocks());

// The "adding a shape" contract, enforced for every registered shape — a new
// shape module that breaks it fails here instead of misbehaving at runtime.
describe.each(shapeRegistry.map((s) => [s.type, s]))('shape contract: %s', (type, shape) => {
  it('has the declared metadata', () => {
    expect(typeof shape.label).toBe('string');
    expect(typeof shape.facesCamera).toBe('boolean');
    ['x', 'y', 'z'].forEach((a) => expect(shape.localHalfExtents[a]).toBeGreaterThan(0));
  });

  it('types are unique in the registry', () => {
    expect(shapeRegistry.filter((s) => s.type === type)).toHaveLength(1);
  });

  it('randomScale(rng) returns a finite, positive Vector3', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 100; i++) {
      const s = shape.randomScale(rng);
      expect(s).toBeInstanceOf(THREE.Vector3);
      [s.x, s.y, s.z].forEach((v) => {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThan(0);
      });
    }
  });

  it('randomScale draws only from the rng it is given (so seeds reproduce)', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random used'); });
    const a = shape.randomScale(mulberry32(5));
    const b = shape.randomScale(mulberry32(5));
    expect(a.toArray()).toEqual(b.toArray());
  });

  it('create() returns a mesh that honors the shading contract', () => {
    const mesh = shape.create('#c1362b');
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.userData.shapeType).toBe(type);
    expect(mesh.userData.baseColor).toBeInstanceOf(THREE.Color);
    expect(typeof mesh.userData.applyShade).toBe('function');
    if (shape.facesCamera) expect(mesh.userData.facesCamera).toBe(true);
  });

  it('localHalfExtents match the real geometry (collision uses them)', () => {
    const mesh = shape.create('#c1362b');
    mesh.geometry.computeBoundingBox();
    const size = mesh.geometry.boundingBox.getSize(new THREE.Vector3());
    // tolerance: flat shapes declare a hair of thickness; spheres are faceted
    expect(size.x / 2).toBeCloseTo(shape.localHalfExtents.x, 1);
    expect(size.y / 2).toBeCloseTo(shape.localHalfExtents.y, 1);
    expect(Math.abs(size.z / 2 - shape.localHalfExtents.z)).toBeLessThan(0.06);
  });

  it('paintMesh() records the base color and repaints without throwing', () => {
    const mesh = shape.create('#c1362b');
    const target = new THREE.Color('#336699');
    expect(() => paintMesh(mesh, target)).not.toThrow();
    expect(mesh.userData.baseColor.equals(target)).toBe(true);
    // the stored color is a copy, not an alias the caller can mutate
    target.set('#ffffff');
    expect(mesh.userData.baseColor.equals(target)).toBe(false);
  });

  it('disposeMesh() releases geometry, materials and their textures', () => {
    const mesh = shape.create('#c1362b');
    const geoSpy = vi.spyOn(mesh.geometry, 'dispose');
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const matSpies = mats.map((m) => vi.spyOn(m, 'dispose'));
    const mapSpies = mats.filter((m) => m.map).map((m) => vi.spyOn(m.map, 'dispose'));
    disposeMesh(mesh);
    expect(geoSpy).toHaveBeenCalledTimes(1);
    matSpies.forEach((s) => expect(s).toHaveBeenCalledTimes(1));
    mapSpies.forEach((s) => expect(s).toHaveBeenCalledTimes(1));
  });
});
