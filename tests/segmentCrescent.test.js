import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import segment, { segmentShape, segmentGeometry, SEGMENT_DEPTH } from '../src/shapes/segment.js';
import crescent, { crescentShape, crescentGeometry } from '../src/shapes/crescent.js';
import { getShape } from '../src/shapes/registry.js';
import { createRng } from '../src/generator/rng.js';
import { screenBasis, hexToHsl, splitPalette } from '../src/generator/strategies/common.js';
import { each, makeConfig, layoutOf, depthAxis, palettes, shapeRegistry } from './helpers/scene.js';

const basis = screenBasis(depthAxis);
const axisCfg = (seed, counts, opts) => ({ ...makeConfig(seed, counts, opts), composition: { strategy: 'axis-thrust' }, orientation: 'landscape' });
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const flat = each(1, { segment: 1, crescent: 1 });

// polygon helpers (the outline as points)
const outline = (shape) => shape.getPoints(400);
const area = (pts) => Math.abs(THREE.ShapeUtils.area(pts));
function inside(pts, x, y) { // ray casting
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
const bboxHalf = (geo) => {
  geo.computeBoundingBox();
  const s = geo.boundingBox.getSize(new THREE.Vector3());
  return { x: s.x / 2, y: s.y / 2, z: s.z / 2 };
};

describe.each([['segment', segment, segmentGeometry], ['crescent', crescent, crescentGeometry]])('%s: the shape', (name, shape, geometry) => {
  it('is registered, flat, off by default, with the documented contract', () => {
    expect(getShape(name)).toBe(shape);
    expect(shape.facesCamera).toBe(false);
    expect(shape.defaults).toEqual({ count: 0 });
    expect(shape.collides).toBeUndefined();
  });

  it('localHalfExtents match the geometry it builds (the collision proxy is true to the form)', () => {
    const half = bboxHalf(geometry());
    expect(half.x).toBeCloseTo(shape.localHalfExtents.x, 3);
    expect(half.y).toBeCloseTo(shape.localHalfExtents.y, 3);
    expect(half.z).toBeCloseTo(shape.localHalfExtents.z, 3);
  });

  it('builds finite, centred geometry', () => {
    const geo = geometry();
    const pos = geo.getAttribute('position');
    expect(pos.count).toBeGreaterThan(30);
    for (let i = 0; i < pos.array.length; i++) expect(Number.isFinite(pos.array[i])).toBe(true);
    geo.computeBoundingBox();
    const c = geo.boundingBox.getCenter(new THREE.Vector3());
    expect(c.length()).toBeLessThan(1e-6);
    expect(geo.groups.length).toBe(2); // caps, sides: the two shade multipliers
  });

  it('randomScale is finite and positive, reproducible, and thin in z', () => {
    for (let i = 0; i < 200; i++) {
      const s = shape.randomScale(createRng(5, name, 'scale', i));
      [s.x, s.y, s.z].forEach((v) => { expect(Number.isFinite(v)).toBe(true); expect(v).toBeGreaterThan(0); });
      expect(s.z).toBeLessThanOrEqual(1.0);
    }
    expect(shape.randomScale(createRng(2, name, 'a', 0)).toArray()).toEqual(shape.randomScale(createRng(2, name, 'a', 0)).toArray());
  });
});

describe('segment: the outline', () => {
  const pts = outline(segmentShape());

  it('is a circular segment: the right area, 1 across the chord and SEGMENT_DEPTH deep', () => {
    const R = (0.25 + SEGMENT_DEPTH ** 2) / (2 * SEGMENT_DEPTH);
    const theta = 2 * Math.asin(0.5 / R);
    const analytic = (R * R / 2) * (theta - Math.sin(theta));
    expect(area(pts) / analytic).toBeGreaterThan(0.99);
    expect(area(pts) / analytic).toBeLessThan(1.01);
    const ys = pts.map((p) => p.y), xs = pts.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(SEGMENT_DEPTH, 3);
  });

  it('has acute tips (a segment, not a half-ellipse): the arc leaves the chord at 55-70 degrees', () => {
    const tip = new THREE.Vector2(0.5, 0);
    const near = pts.filter((p) => p.y > 1e-4 && p.distanceTo(tip) < 0.04).sort((a, b) => a.y - b.y)[0];
    const toArc = near.clone().sub(tip).normalize();
    const angle = (Math.acos(toArc.dot(new THREE.Vector2(-1, 0))) * 180) / Math.PI;
    expect(angle).toBeGreaterThan(55);
    expect(angle).toBeLessThan(70);
  });

  it('is flat on one side: the chord is straight, the arc bulges toward +y only', () => {
    expect(inside(pts, 0, 0.05)).toBe(true);
    expect(inside(pts, 0, -0.05)).toBe(false);
    expect(inside(pts, 0, SEGMENT_DEPTH + 0.02)).toBe(false);
  });
});

describe('crescent: the outline', () => {
  const pts = outline(crescentShape());
  const R = 0.5, r = 0.42, d = 0.2;

  it('is a disc less a smaller, offset disc: the right area', () => {
    const lens = r * r * Math.acos((d * d + r * r - R * R) / (2 * d * r))
      + R * R * Math.acos((d * d + R * R - r * r) / (2 * d * R))
      - 0.5 * Math.sqrt((-d + r + R) * (d + r - R) * (d - r + R) * (d + r + R));
    const analytic = Math.PI * R * R - lens;
    expect(area(pts) / analytic).toBeGreaterThan(0.99);
    expect(area(pts) / analytic).toBeLessThan(1.01);
  });

  it('is concave: solid at the back, hollow where the bite is, nothing beyond the horns', () => {
    expect(inside(pts, -0.4, 0)).toBe(true);   // the thick back of the moon
    expect(inside(pts, 0, 0)).toBe(false);     // the bite
    expect(inside(pts, 0.45, 0)).toBe(false);  // past the horns' tips
    expect(inside(pts, 0.15, 0.45)).toBe(true); // along the upper horn
  });
});

describe('segment and crescent: in the legacy generator', () => {
  it('enabling them leaves every other type\'s candidate alone', () => {
    const base = layoutOf(makeConfig(9, each(1)));
    const withFlat = layoutOf(makeConfig(9, each(1, { segment: 2, crescent: 2 })));
    expect(withFlat.filter((e) => e.type === 'segment')).toHaveLength(2);
    expect(withFlat.filter((e) => e.type === 'crescent')).toHaveLength(2);
    expect(withFlat.filter((e) => e.type !== 'segment' && e.type !== 'crescent').map((e) => `${e.type}:${e.index}:${e.hex}`))
      .toEqual(base.map((e) => `${e.type}:${e.index}:${e.hex}`));
  });
});

describe('segment and crescent: in Axis thrust', () => {
  const extent = (e) => {
    const he = shapeRegistry.find((s) => s.type === e.type).localHalfExtents;
    return Math.max(2 * he.x * e.scale[0], 2 * he.y * e.scale[1]);
  };
  /** projected angle (degrees, mod 180) of an entry's local x axis */
  const angleOf = (e) => {
    const x = new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...e.rotation)));
    return ((Math.atan2(x.dot(basis.up), x.dot(basis.right)) * 180) / Math.PI + 180) % 180;
  };
  const apart = (a, b) => { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); };

  it('are off unless enabled: the default composition has neither', () => {
    SEEDS.forEach((seed) => layoutOf(axisCfg(seed, each(1))).forEach((e) => expect(['segment', 'crescent']).not.toContain(e.type)));
  });

  it('both appear when enabled, as accents and (the segment) as the anchor', () => {
    const all = SEEDS.flatMap((seed) => layoutOf(axisCfg(seed, flat)));
    expect(all.some((e) => e.type === 'segment' && e.role === 'accent')).toBe(true);
    expect(all.some((e) => e.type === 'crescent' && e.role === 'accent')).toBe(true);
    expect(all.some((e) => e.type === 'segment' && e.role === 'anchor')).toBe(true);
    expect(all.filter((e) => e.type === 'crescent').every((e) => e.role === 'accent')).toBe(true);
  });

  it('keeps the structure: one anchor, accents smaller than it, one saturated hue, on every palette', () => {
    for (const [name, palette] of Object.entries(palettes)) {
      const { saturated } = splitPalette(palette);
      SEEDS.slice(0, 15).forEach((seed) => {
        const L = layoutOf(axisCfg(seed, flat), name);
        const anchors = L.filter((e) => e.role === 'anchor');
        expect(anchors, `${name} ${seed}`).toHaveLength(1);
        L.filter((e) => e.role === 'accent').forEach((a) => expect(extent(a)).toBeLessThan(extent(anchors[0])));
        const hues = new Set(L.map((e) => e.hex).filter((h) => hexToHsl(h).s >= 0.5));
        expect(hues.size).toBeLessThanOrEqual(1);
        hues.forEach((h) => expect(saturated).toContain(h));
      });
    }
  });

  it('a segment anchor\'s chord runs along the axis, with the beams', () => {
    let checked = 0;
    SEEDS.forEach((seed) => {
      const L = layoutOf(axisCfg(seed, flat));
      const a = L.find((e) => e.role === 'anchor');
      if (a.type !== 'segment') return;
      const beams = L.filter((e) => e.role === 'support');
      if (!beams.length) return;
      checked++;
      // beams wander up to 9 degrees from the axis; the chord is exactly on it
      expect(Math.min(...beams.map((b) => apart(angleOf(a), angleOf(b))))).toBeLessThanOrEqual(9 + 1e-6);
    });
    expect(checked).toBeGreaterThan(0);
  });

  it('is reproducible, and well-formed', () => {
    expect(layoutOf(axisCfg(5, flat))).toEqual(layoutOf(axisCfg(5, flat)));
    SEEDS.forEach((seed) => layoutOf(axisCfg(seed, flat)).forEach((e) => {
      [...e.position, ...e.rotation, ...e.scale].forEach((v) => expect(Number.isFinite(v)).toBe(true));
      e.scale.forEach((v) => expect(v).toBeGreaterThan(0));
    }));
  });
});
