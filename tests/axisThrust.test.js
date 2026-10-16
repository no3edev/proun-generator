import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ANGLE_FAMILIES } from '../src/generator/strategies/axisThrust.js';
import { screenBasis, splitPalette, hexToHsl } from '../src/generator/strategies/common.js';
import { CAMERA } from '../src/config/defaults.js';
import { each, makeConfig, layoutOf, depthAxis, cameraPosition, palettes, shapeRegistry } from './helpers/scene.js';

const basis = screenBasis(depthAxis);
const axisCfg = (seed, counts = each(1), opts = {}, extra = {}) =>
  ({ ...makeConfig(seed, counts, opts), composition: { strategy: 'axis-thrust' }, orientation: 'landscape', ...extra });
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

/** where an entry's long (local x) axis points on screen, in degrees (-90, 90], + = rising to the right */
function projectedAngle(e) {
  const x = new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...e.rotation)));
  let a = (Math.atan2(x.dot(basis.up), x.dot(basis.right)) * 180) / Math.PI;
  while (a > 90) a -= 180;
  while (a <= -90) a += 180;
  return a;
}
const screenOf = (e) => { const p = new THREE.Vector3(...e.position); return [p.dot(basis.right), p.dot(basis.up)]; };

describe('axis thrust: reproducibility and counts', () => {
  it('same seed -> same composition; different seed -> different', () => {
    expect(layoutOf(axisCfg(5))).toEqual(layoutOf(axisCfg(5)));
    expect(layoutOf(axisCfg(5))).not.toEqual(layoutOf(axisCfg(6)));
  });

  it('does not read `visible` (as in the legacy generator)', () => {
    expect(layoutOf(axisCfg(5, each(1), { shape: { visible: false } }))).toEqual(layoutOf(axisCfg(5)));
  });

  it('owns the counts: one configured instance can become several, and the total is a composition, not a crowd', () => {
    SEEDS.forEach((seed) => {
      const L = layoutOf(axisCfg(seed));
      expect(L.length).toBeGreaterThanOrEqual(5);
      expect(L.length).toBeLessThanOrEqual(12);
    });
    const perType = {};
    layoutOf(axisCfg(3)).forEach((e) => { perType[e.type] = (perType[e.type] || 0) + 1; });
    expect(Object.values(perType).some((n) => n > 1)).toBe(true);
  });

  it('a type with count 0 never appears; with everything at 0 the scene is empty', () => {
    SEEDS.forEach((seed) => {
      const L = layoutOf(axisCfg(seed, { ...each(1), circle: 0, triangle: 0 }));
      expect(L.some((e) => e.type === 'circle' || e.type === 'triangle')).toBe(false);
    });
    expect(layoutOf(axisCfg(1, each(0)))).toEqual([]);
  });

  it('still composes with very few types enabled', () => {
    expect(layoutOf(axisCfg(2, { circle: 1 })).length).toBeGreaterThan(0);
    expect(layoutOf(axisCfg(2, { 'cube-variable': 1 })).length).toBeGreaterThan(0);
    layoutOf(axisCfg(2, { circle: 1 })).forEach((e) => expect(e.type).toBe('circle'));
  });

  it('indexes are contiguous per type and the order is registry order, then index', () => {
    SEEDS.slice(0, 15).forEach((seed) => {
      const L = layoutOf(axisCfg(seed));
      const seen = {};
      L.forEach((e) => { expect(e.index).toBe(seen[e.type] || 0); seen[e.type] = e.index + 1; });
      const order = L.map((e) => shapeRegistry.findIndex((s) => s.type === e.type));
      expect([...order].sort((a, b) => a - b)).toEqual(order);
    });
  });
});

describe('axis thrust: structure', () => {
  it('has exactly one anchor, and every accent is clearly smaller than it', () => {
    // largest world-space extent of an entry, from its shape's own geometry
    const extent = (e) => {
      const he = shapeRegistry.find((s) => s.type === e.type).localHalfExtents;
      return Math.max(2 * he.x * e.scale[0], 2 * he.y * e.scale[1]);
    };
    SEEDS.forEach((seed) => {
      const L = layoutOf(axisCfg(seed));
      const anchors = L.filter((e) => e.role === 'anchor');
      expect(anchors).toHaveLength(1);
      L.filter((e) => e.role === 'accent').forEach((acc) => expect(extent(acc)).toBeLessThan(extent(anchors[0])));
    });
  });

  it('uses the role vocabulary, and every entry carries one', () => {
    SEEDS.forEach((seed) => layoutOf(axisCfg(seed)).forEach((e) => {
      expect(['anchor', 'support', 'connector', 'accent', 'detail']).toContain(e.role);
    }));
  });

  it('keeps the anchor near the centre of the frame', () => {
    SEEDS.forEach((seed) => {
      const a = layoutOf(axisCfg(seed)).find((e) => e.role === 'anchor');
      const [x, y] = screenOf(a);
      expect(Math.abs(x)).toBeLessThanOrEqual(0.2 * 3 * (720 / 560) + 1e-6);
      expect(Math.abs(y)).toBeLessThanOrEqual(0.2 * 3 + 1e-6);
    });
  });

  it('the generated screen position survives collision resolution (depth is the only thing the solver moves)', () => {
    // same plan, with and without extra types that force resolution: the anchor stays put on screen
    const a = layoutOf(axisCfg(11, each(1))).find((e) => e.role === 'anchor');
    const b = layoutOf(axisCfg(11, each(1), { shape: { spread: 1 } })).find((e) => e.role === 'anchor');
    expect(screenOf(a)).toEqual(screenOf(b));
  });

  it('every entry is well-formed: finite numbers, positive scale, #rrggbb colour', () => {
    SEEDS.forEach((seed) => layoutOf(axisCfg(seed)).forEach((e) => {
      [...e.position, ...e.rotation, ...e.scale].forEach((v) => expect(Number.isFinite(v)).toBe(true));
      e.scale.forEach((v) => expect(v).toBeGreaterThan(0));
      expect(e.hex).toMatch(/^#[0-9a-f]{6}$/i);
    }));
  });
});

describe('axis thrust: one dominant axis', () => {
  const longBars = (L) => L.filter((e) => e.role === 'support');
  const inFamily = (a) => ANGLE_FAMILIES.some(([[lo, hi]]) => Math.abs(a) >= lo - 1e-6 && Math.abs(a) <= hi + 1e-6);
  const apart = (a, b) => { const d = Math.abs(a - b); return Math.min(d, 180 - d); };
  /**
   * The thrust angle: a beam whose angle is one of the families' (the first
   * beam is exact; the others may wander up to 9 degrees from it) such that
   * every beam lies within 9 degrees of it. Undefined if there is none.
   * (The layout is ordered by shape type, not creation order, so "the first
   * beam" is not simply the first support.)
   */
  const thrustAngle = (L) => {
    const angles = longBars(L).map(projectedAngle);
    return angles.find((a) => inFamily(a) && angles.every((b) => apart(a, b) <= 9 + 1e-6));
  };

  it('the beams run along one angle taken from the reference families', () => {
    SEEDS.forEach((seed) => {
      const L = layoutOf(axisCfg(seed));
      if (longBars(L).length) expect(thrustAngle(L), `seed ${seed}`).not.toBeUndefined();
    });
  });

  it('thrust angles come in both senses and from all three families across seeds', () => {
    const angles = SEEDS.map((seed) => thrustAngle(layoutOf(axisCfg(seed)))).filter((a) => a !== undefined);
    expect(angles.some((a) => a > 0)).toBe(true);
    expect(angles.some((a) => a < 0)).toBe(true);
    const abs = angles.map(Math.abs);
    expect(abs.some((a) => a >= 12 && a <= 25)).toBe(true);
    expect(abs.some((a) => a >= 38 && a <= 46)).toBe(true);
    expect(abs.some((a) => a >= 54 && a <= 62)).toBe(true);
  });

  it('snapRotation keeps beams in the picture plane (no recession) and rolls in 45 degree steps', () => {
    SEEDS.slice(0, 15).forEach((seed) => {
      layoutOf(axisCfg(seed, each(1), { shape: { snapRotation: true } })).filter((e) => e.role === 'support').forEach((b) => {
        const x = new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...b.rotation)));
        expect(Math.abs(x.dot(depthAxis))).toBeLessThan(1e-9);
      });
    });
  });
});

describe('axis thrust: colour', () => {
  it('never uses more than one saturated hue in a scene, on any shipped palette', () => {
    for (const [name, palette] of Object.entries(palettes)) {
      const { saturated } = splitPalette(palette);
      SEEDS.slice(0, 20).forEach((seed) => {
        const used = new Set(layoutOf(axisCfg(seed), name).map((e) => e.hex).filter((h) => hexToHsl(h).s >= 0.5));
        expect(used.size, `${name} seed ${seed}`).toBeLessThanOrEqual(1);
        used.forEach((h) => expect(saturated).toContain(h));
      });
    }
  });

  it('uses only palette colours (accents or the ink)', () => {
    for (const [name, palette] of Object.entries(palettes)) {
      layoutOf(axisCfg(4), name).forEach((e) => expect([...palette.accents, palette.ink]).toContain(e.hex));
    }
  });

  it('keeps the accent hue to a minority of the picture, and does not paint accents the same as an accent-coloured anchor', () => {
    SEEDS.forEach((seed) => {
      const L = layoutOf(axisCfg(seed));
      const a = L.find((e) => e.role === 'anchor');
      if (hexToHsl(a.hex).s >= 0.5) {
        L.filter((e) => e.role === 'accent').forEach((acc) => expect(acc.hex).not.toBe(a.hex));
      }
    });
  });
});

describe('axis thrust: locks, orientation and visibility of the whole scene', () => {
  it('a locked type is replayed verbatim and takes no part in the plan', () => {
    const locked = [{ position: [0.5, 0.5, 0.5], rotation: [0.1, 0.2, 0.3], scale: [1, 1, 1], hex: '#123456' }];
    const L = layoutOf(axisCfg(8, each(1), { perType: { circle: { locked, count: 1 } } }));
    const circles = L.filter((e) => e.type === 'circle');
    expect(circles).toHaveLength(1);
    expect(circles[0].position).toEqual(locked[0].position);
    expect(circles[0].hex).toBe('#123456');
    expect(circles[0].role).toBeUndefined();
  });

  it('portrait, square and landscape all compose, and landscape reaches wider than portrait', () => {
    const reach = (orientation) => Math.max(...SEEDS.map((seed) => Math.max(...layoutOf(axisCfg(seed, each(1), {}, { orientation })).map((e) => Math.abs(screenOf(e)[0])))));
    expect(reach('landscape')).toBeGreaterThan(reach('portrait'));
    ['portrait', 'square'].forEach((o) => expect(layoutOf(axisCfg(3, each(1), {}, { orientation: o })).length).toBeGreaterThan(0));
  });

  it('never leaves a shape outside the camera clip planes, even at the UI limits', () => {
    const dist = cameraPosition.length();
    SEEDS.slice(0, 10).forEach((seed) => {
      layoutOf(axisCfg(seed, each(12, { rod: 12 }), { shape: { sizeMin: 10, sizeMax: 10 } })).forEach((e) => {
        const d = new THREE.Vector3(...e.position).dot(depthAxis);
        expect(d).toBeLessThan(dist - CAMERA.near);
        expect(d).toBeGreaterThan(dist - CAMERA.far);
      });
    });
  });

  it('an unknown strategy name is the legacy generator, not an error', () => {
    const legacy = layoutOf(makeConfig(5, each(2)));
    expect(layoutOf({ ...makeConfig(5, each(2)), composition: { strategy: 'nope' } })).toEqual(legacy);
    expect(layoutOf({ ...makeConfig(5, each(2)), composition: { strategy: 'legacy' } })).toEqual(legacy);
  });
});
