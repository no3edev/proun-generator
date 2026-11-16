import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { frontBiasedDepth, HAIRLINE_BACK, HAIRLINE_FRONT, HAIRLINE_FRONT_SHARE } from '../src/generator/strategies/shared.js';
import { each, makeConfig, layoutOf, cameraPosition } from './helpers/scene.js';

describe('hairline depth is biased to the front', () => {
  it('maps the range onto itself, monotonically, with the stated front share', () => {
    expect(frontBiasedDepth(HAIRLINE_BACK)).toBeCloseTo(HAIRLINE_BACK, 9);
    expect(frontBiasedDepth(HAIRLINE_FRONT)).toBeCloseTo(HAIRLINE_FRONT, 9);
    let prev = -Infinity, front = 0;
    const n = 4000;
    for (let i = 0; i <= n; i++) {
      const d = HAIRLINE_BACK + ((HAIRLINE_FRONT - HAIRLINE_BACK) * i) / n;
      const m = frontBiasedDepth(d);
      expect(m).toBeGreaterThanOrEqual(prev);
      expect(m).toBeGreaterThanOrEqual(HAIRLINE_BACK - 1e-9);
      expect(m).toBeLessThanOrEqual(HAIRLINE_FRONT + 1e-9);
      prev = m;
      if (m >= 0) front++;
    }
    expect(front / (n + 1)).toBeCloseTo(HAIRLINE_FRONT_SHARE, 2);
  });

  it('puts about 80% of rod hairlines in front of the anchor in Axis thrust and Disc and beams (after the solver)', () => {
    const v = cameraPosition.clone().normalize();
    for (const strategy of ['axis-thrust', 'disc-beams']) {
      let n = 0, behind = 0;
      for (let seed = 1; seed <= 150; seed++) {
        const layout = layoutOf({ ...makeConfig(seed, each(1, { rod: 1 })), composition: { strategy }, orientation: 'landscape' });
        const anchor = layout.find((e) => e.role === 'anchor');
        const ad = new THREE.Vector3(...anchor.position).dot(v);
        for (const e of layout) if (e.role === 'detail' && e.type === 'rod') { n++; if (new THREE.Vector3(...e.position).dot(v) < ad) behind++; }
      }
      expect(n).toBeGreaterThan(150);
      expect(behind / n).toBeLessThan(0.23);
    }
  });
});
