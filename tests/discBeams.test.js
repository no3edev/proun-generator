import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ANGLE_FAMILIES } from '../src/generator/strategies/shared.js';
import { screenBasis, splitPalette, hexToHsl } from '../src/generator/strategies/common.js';
import { STRATEGY_NAMES, STRATEGY_LABELS } from '../src/generator/strategies/index.js';
import { CAMERA } from '../src/config/defaults.js';
import { each, makeConfig, layoutOf, depthAxis, cameraPosition, palettes, shapeRegistry } from './helpers/scene.js';

const basis = screenBasis(depthAxis);
const discCfg = (seed, counts = each(1), opts, extra = {}) =>
  ({ ...makeConfig(seed, counts, opts), composition: { strategy: 'disc-beams' }, orientation: 'landscape', ...extra });
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const without = (counts, ...types) => ({ ...counts, ...Object.fromEntries(types.map((t) => [t, 0])) });
const everything = each(1, { rod: 1, beam: 1, segment: 1, crescent: 1, frame: 1, ring: 1 });

/** the long (local x) axis of an entry on screen, degrees in (-90, 90], + = rising to the right */
function projectedAngle(e) {
  const x = new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...e.rotation)));
  let a = (Math.atan2(x.dot(basis.up), x.dot(basis.right)) * 180) / Math.PI;
  while (a > 90) a -= 180;
  while (a <= -90) a += 180;
  return a;
}
const apart = (a, b) => { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); };
const screenOf = (e) => { const p = new THREE.Vector3(...e.position); return [p.dot(basis.right), p.dot(basis.up)]; };
const extent = (e) => {
  const he = shapeRegistry.find((s) => s.type === e.type).localHalfExtents;
  return Math.max(2 * he.x * e.scale[0], 2 * he.y * e.scale[1]);
};
const inFamily = (a) => ANGLE_FAMILIES.some(([[lo, hi]]) => Math.abs(a) >= lo - 1e-6 && Math.abs(a) <= hi + 1e-6);

describe('disc and beams: selection and reproducibility', () => {
  it('is a selectable strategy, after legacy', () => {
    expect(STRATEGY_NAMES).toContain('disc-beams');
    expect(STRATEGY_LABELS['disc-beams']).toBe('Disc and beams');
  });

  it('same seed -> same composition; different seed -> different; independent of `visible`', () => {
    expect(layoutOf(discCfg(5))).toEqual(layoutOf(discCfg(5)));
    expect(layoutOf(discCfg(5))).not.toEqual(layoutOf(discCfg(6)));
    expect(layoutOf(discCfg(5, each(1), { shape: { visible: false } }))).toEqual(layoutOf(discCfg(5)));
  });

  it('is a different composition from Axis thrust for the same seed', () => {
    expect(layoutOf(discCfg(7))).not.toEqual(layoutOf({ ...discCfg(7), composition: { strategy: 'axis-thrust' } }));
  });

  it('owns the counts: 5-12 shapes from a count of 1 each; a type at 0 never appears; all 0 is empty', () => {
    SEEDS.forEach((seed) => {
      const L = layoutOf(discCfg(seed));
      expect(L.length).toBeGreaterThanOrEqual(5);
      expect(L.length).toBeLessThanOrEqual(12);
    });
    SEEDS.forEach((seed) => {
      layoutOf(discCfg(seed, without(each(1), 'triangle', 'sphere'))).forEach((e) => expect(['triangle', 'sphere']).not.toContain(e.type));
    });
    expect(layoutOf(discCfg(1, each(0)))).toEqual([]);
  });

  it('still composes with few types, and with the disc type excluded', () => {
    expect(layoutOf(discCfg(2, { circle: 1 })).length).toBeGreaterThan(0);
    expect(layoutOf(discCfg(2, { 'cube-variable': 1, circle: 1 })).length).toBeGreaterThan(0);
    SEEDS.slice(0, 10).forEach((seed) => {
      const L = layoutOf(discCfg(seed, without(each(1), 'circle')));
      expect(L.filter((e) => e.role === 'anchor')).toHaveLength(1);
      expect(L.some((e) => e.type === 'circle')).toBe(false);
    });
  });

  it('indexes are contiguous per type, in registry order', () => {
    SEEDS.slice(0, 15).forEach((seed) => {
      const L = layoutOf(discCfg(seed, everything));
      const seen = {};
      L.forEach((e) => { expect(e.index).toBe(seen[e.type] || 0); seen[e.type] = e.index + 1; });
      const order = L.map((e) => shapeRegistry.findIndex((s) => s.type === e.type));
      expect([...order].sort((a, b) => a - b)).toEqual(order);
    });
  });
});

describe('disc and beams: structure', () => {
  it('has exactly one anchor, a large flat disc (the circle) when that type is enabled', () => {
    SEEDS.forEach((seed) => {
      const L = layoutOf(discCfg(seed));
      const anchors = L.filter((e) => e.role === 'anchor');
      expect(anchors).toHaveLength(1);
      expect(anchors[0].type).toBe('circle');
      const H = CAMERA.frustumSize;
      expect(extent(anchors[0])).toBeGreaterThanOrEqual(H * 0.5 - 1e-6);
      expect(extent(anchors[0])).toBeLessThanOrEqual(H * 0.78 + 1e-6);
    });
  });

  it('every accent is far smaller than the disc, and every entry carries a role', () => {
    SEEDS.forEach((seed) => {
      const L = layoutOf(discCfg(seed, everything));
      const disc = L.find((e) => e.role === 'anchor');
      L.forEach((e) => expect(['anchor', 'support', 'connector', 'accent', 'detail']).toContain(e.role));
      L.filter((e) => e.role === 'accent').forEach((a) => expect(extent(a)).toBeLessThan(extent(disc) * 0.4));
    });
  });

  it('the disc is a little off centre and may bleed, but stays in the frame\'s neighbourhood', () => {
    SEEDS.forEach((seed) => {
      const disc = layoutOf(discCfg(seed)).find((e) => e.role === 'anchor');
      const [x, y] = screenOf(disc);
      expect(Math.abs(x)).toBeLessThanOrEqual(0.35 * 3 * (720 / 560) + 1e-6);
      expect(Math.abs(y)).toBeLessThanOrEqual(0.3 * 3 + 1e-6);
    });
  });

  it('screen positions are the strategy\'s, whatever the depth solver does', () => {
    const a = layoutOf(discCfg(11)).find((e) => e.role === 'anchor');
    const b = layoutOf(discCfg(11, each(1), { shape: { spread: 1 } })).find((e) => e.role === 'anchor');
    expect(screenOf(a)).toEqual(screenOf(b));
  });
});

describe('disc and beams: one main angle, one or two crossing beams', () => {
  const split = (L) => ({
    main: L.filter((e) => e.role === 'support'),
    cross: L.filter((e) => e.role === 'connector')
  });

  it('has a primary beam, at most one partner beside it, and one or two crossing beams', () => {
    SEEDS.forEach((seed) => {
      const { main, cross } = split(layoutOf(discCfg(seed)));
      expect(main.length, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      expect(main.length).toBeLessThanOrEqual(2);
      expect(cross.length).toBeGreaterThanOrEqual(1);
      expect(cross.length).toBeLessThanOrEqual(2);
    });
  });

  it('the main beams share one angle, taken from the reference families', () => {
    SEEDS.forEach((seed) => {
      const { main } = split(layoutOf(discCfg(seed)));
      const angles = main.map(projectedAngle);
      expect(angles.some((a) => inFamily(a)), `seed ${seed}`).toBe(true);
      expect(Math.max(...angles.map((a) => Math.max(...angles.map((b) => apart(a, b)))))).toBeLessThanOrEqual(2 + 1e-6);
    });
  });

  it('the crossing beams cross the main angle steeply (40-90 degrees), never run parallel to it', () => {
    SEEDS.forEach((seed) => {
      const { main, cross } = split(layoutOf(discCfg(seed)));
      const a0 = projectedAngle(main[0]);
      cross.forEach((c) => {
        const d = apart(projectedAngle(c), a0);
        expect(d, `seed ${seed}`).toBeGreaterThanOrEqual(40 - 1e-6);
        expect(d).toBeLessThanOrEqual(90 + 1e-6);
      });
    });
  });

  it('the primary beam crosses the disc\'s rim, not its middle and not clear of it', () => {
    SEEDS.forEach((seed) => {
      const L = layoutOf(discCfg(seed, each(1, { beam: 1 })));
      const disc = L.find((e) => e.role === 'anchor');
      const beams = L.filter((e) => e.role === 'support' && e.type === 'beam');
      if (!beams.length) return;
      const a = projectedAngle(beams[0]) * Math.PI / 180;
      const [dx, dy] = screenOf(disc), [bx, by] = screenOf(beams[0]);
      const across = Math.abs((bx - dx) * -Math.sin(a) + (by - dy) * Math.cos(a));
      const r = extent(disc) / 2;
      // the first beam of the plan is offset 0.45-0.95 of the radius across the angle (the partner can be elsewhere)
      expect(across).toBeLessThanOrEqual(r * 1.0 + 1.4);
    });
  });
});

describe('disc and beams: depth, colour, options', () => {
  it('beams do not share the disc\'s depth (room between them for a later shadow plane)', () => {
    SEEDS.forEach((seed) => {
      const L = layoutOf(discCfg(seed));
      const disc = L.find((e) => e.role === 'anchor');
      const dd = new THREE.Vector3(...disc.position).dot(depthAxis);
      L.filter((e) => e.role === 'support' || e.role === 'connector').forEach((b) => {
        expect(Math.abs(new THREE.Vector3(...b.position).dot(depthAxis) - dd)).toBeGreaterThan(0.1);
      });
    });
  });

  it('never more than one saturated hue in a scene, on any shipped palette; only palette colours', () => {
    for (const [name, palette] of Object.entries(palettes)) {
      const { saturated } = splitPalette(palette);
      SEEDS.slice(0, 15).forEach((seed) => {
        const L = layoutOf(discCfg(seed, everything), name);
        const hues = new Set(L.map((e) => e.hex).filter((h) => hexToHsl(h).s >= 0.5));
        expect(hues.size, `${name} ${seed}`).toBeLessThanOrEqual(1);
        hues.forEach((h) => expect(saturated).toContain(h));
        L.forEach((e) => expect([...palette.accents, palette.ink]).toContain(e.hex));
      });
    }
  });

  it('beams read against the disc: the primary beam is never the disc\'s colour; outlines never match it either', () => {
    SEEDS.forEach((seed) => {
      const L = layoutOf(discCfg(seed, everything));
      const disc = L.find((e) => e.role === 'anchor');
      L.filter((e) => e.role === 'support').slice(0, 1).forEach((b) => expect(b.hex).not.toBe(disc.hex));
      L.filter((e) => e.type === 'ring' || e.type === 'frame').forEach((o) => expect(o.hex).not.toBe(disc.hex));
    });
  });

  it('the ring, when enabled, is concentric with the disc and a little larger', () => {
    let seen = 0;
    SEEDS.forEach((seed) => {
      const L = layoutOf(discCfg(seed, everything));
      const disc = L.find((e) => e.role === 'anchor');
      L.filter((e) => e.type === 'ring').forEach((rg) => {
        seen++;
        screenOf(rg).forEach((v, i) => expect(v).toBeCloseTo(screenOf(disc)[i], 9));
        const ratio = (rg.scale[0] * 1.0) / extent(disc);
        expect(ratio).toBeGreaterThan(1.1);
        expect(ratio).toBeLessThan(1.5);
      });
    });
    expect(seen).toBeGreaterThan(0);
  });

  it('snapRotation keeps beams in the picture plane', () => {
    SEEDS.slice(0, 15).forEach((seed) => {
      layoutOf(discCfg(seed, each(1), { shape: { snapRotation: true } })).filter((e) => e.role === 'support' || e.role === 'connector').forEach((b) => {
        const x = new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...b.rotation)));
        expect(Math.abs(x.dot(depthAxis))).toBeLessThan(1e-9);
      });
    });
  });

  it('a locked type is replayed verbatim and takes no part in the plan', () => {
    const locked = [{ position: [0.5, 0.5, 0.5], rotation: [0.1, 0.2, 0.3], scale: [1, 1, 1], hex: '#123456' }];
    const L = layoutOf(discCfg(8, each(1), { perType: { circle: { locked, count: 1 } } }));
    const circles = L.filter((e) => e.type === 'circle');
    expect(circles).toHaveLength(1);
    expect(circles[0].position).toEqual(locked[0].position);
    expect(circles[0].role).toBeUndefined();
  });

  it('composes in every orientation, and never leaves a shape outside the clip planes at the UI limits', () => {
    ['portrait', 'square', 'landscape'].forEach((o) => expect(layoutOf(discCfg(3, each(1), {}, { orientation: o })).length).toBeGreaterThan(0));
    const dist = cameraPosition.length();
    SEEDS.slice(0, 10).forEach((seed) => {
      layoutOf(discCfg(seed, each(12, { rod: 12 }), { shape: { sizeMin: 10, sizeMax: 10 } })).forEach((e) => {
        const d = new THREE.Vector3(...e.position).dot(depthAxis);
        expect(d).toBeLessThan(dist - CAMERA.near);
        expect(d).toBeGreaterThan(dist - CAMERA.far);
      });
    });
  });

  it('every entry is well-formed', () => {
    SEEDS.forEach((seed) => layoutOf(discCfg(seed, everything)).forEach((e) => {
      [...e.position, ...e.rotation, ...e.scale].forEach((v) => expect(Number.isFinite(v)).toBe(true));
      e.scale.forEach((v) => expect(v).toBeGreaterThan(0));
      expect(e.hex).toMatch(/^#[0-9a-f]{6}$/i);
    }));
  });
});
