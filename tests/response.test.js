import { describe, it, expect, afterEach } from 'vitest';
import { paintSeed, paintSeedFor, surfaceMode } from '../src/texture/paintSeed.js';
import { setEdgeNow } from '../src/texture/edge.js';
import { emptyField } from '../src/texture/edgeField.js';
import { patchFragment, setMaterialEnergy, setResponseParams } from '../src/texture/PigmentResponse.js';
import { LAB_SCHEMA as LAB_SETTINGS, LAB_GROUP_TABS } from '../src/lab/labSettings.js';
import { DYNAMICS } from '../src/config/defaults.js';

// Stage 5.4: the materials' response to the event clock, the fixed / evolve switch for surface patterns, the regrouped lab.
afterEach(() => { surfaceMode.evolve = false; });

describe('surface patterns: fixed to the slot, or evolving with the composition seed', () => {
  it('fixed (the default): the slot\'s own seed whatever the composition', () => {
    expect(surfaceMode.evolve).toBe(false);
    expect(paintSeedFor('beam', 2, 11)).toEqual(paintSeed('beam', 2));
    expect(paintSeedFor('beam', 2, 999)).toEqual(paintSeed('beam', 2));
  });
  it('evolving: the same composition seed always draws the same surface, another seed another, inside the field\'s range', () => {
    surfaceMode.evolve = true;
    const a = paintSeedFor('beam', 2, 11);
    expect(paintSeedFor('beam', 2, 11)).toEqual(a);
    expect(paintSeedFor('beam', 2, 12)).not.toEqual(a);
    expect(a).not.toEqual(paintSeed('beam', 2));
    for (let s = 0; s < 100; s++) paintSeedFor('cube-fixed', s % 5, s).forEach((v) => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(97); });
  });
  it('evolving never applies without a composition strategy (null: legacy), so legacy stays byte-identical', () => {
    surfaceMode.evolve = true;
    expect(paintSeedFor('beam', 2, null)).toEqual(paintSeed('beam', 2));
    expect(paintSeedFor('beam', 2, undefined)).toEqual(paintSeed('beam', 2));
  });
});

describe('the response to the event clock', () => {
  const out = patchFragment('void main() {\n#include <map_fragment>\n}');
  it('scales the edge band, the silhouette softness and the paint tooth by the energy, per mesh and behind the lab switch', () => {
    expect(out).toContain('float edgeWR = uEdgeW * ( 1.0 + uRespOn * uRespAmt * uRespEdge * uEnergy );');
    expect(out).toContain('float soft = uSoftW * ( 1.0 + uRespOn * uRespAmt * uRespSoft * uEnergy );');
    expect(out).toContain('float pVisE = uPaintVis * ( 1.0 + uRespOn * uRespAmt * uRespTooth * uEnergy );');
  });
  it('hatching is not among them: it stays fixed', () => {
    expect(out).not.toMatch(/uHatch[A-Za-z]* \* \( 1\.0 \+ uResp/);
  });
  it('the defaults are subtle: at most about 40% on the edge and softness, a few percent on the tooth', () => {
    expect(DYNAMICS.response.edge).toBeLessThanOrEqual(0.4);
    expect(DYNAMICS.response.softness).toBeLessThanOrEqual(0.4);
    expect(DYNAMICS.response.tooth).toBeLessThanOrEqual(0.2);
  });
  it('the setters take numbers without throwing', () => {
    expect(() => { setMaterialEnergy(0.5); setResponseParams({ on: true, edge: 0.4, softness: 0.4, tooth: 0.15 }); setMaterialEnergy(0); }).not.toThrow();
  });
  it('a mesh has its share only under a strategy', () => {
    const f = { uEdgeAmt: { value: 0 }, uEdgeKind: { value: 0 }, uEdgeSdf: { value: emptyField }, uEdgeR: { value: 0 }, uRespAmt: { value: 0 } };
    const m = /** @type {any} */ ({ geometry: { type: 'BoxGeometry' }, userData: { shapeType: 'beam', front: f } });
    setEdgeNow(m, { composition: { strategy: 'axis-thrust' } });
    expect(f.uRespAmt.value).toBe(1);
    setEdgeNow(m, { composition: { strategy: 'legacy' } });
    expect(f.uRespAmt.value).toBe(0);
    // a rod has no edge band but still responds (its paint's tooth)
    const rod = /** @type {any} */ ({ geometry: { type: 'BoxGeometry' }, userData: { shapeType: 'rod', front: { ...f, uRespAmt: { value: 0 } } } });
    setEdgeNow(rod, { composition: { strategy: 'axis-thrust' } });
    expect(rod.userData.front.uRespAmt.value).toBe(1);
    expect(rod.userData.front.uEdgeAmt.value).toBe(0);
  });
});

describe('the regrouped lab', () => {
  const groups = (tab) => [...new Set(LAB_SETTINGS.filter((s) => s.group).map((s) => s.group))];
  it('the surface layers are Pigment, Edge, Response and Support, each as one run', () => {
    const order = LAB_SETTINGS.map((s) => s.group);
    for (const g of ['Pigment', 'Edge', 'Response', 'Support']) {
      const first = order.indexOf(g), last = order.lastIndexOf(g);
      expect(first).toBeGreaterThanOrEqual(0);
      expect(order.slice(first, last + 1).every((x) => x === g)).toBe(true);
    }
    expect(groups()).not.toContain('Paint');
    expect(groups()).not.toContain('Hatch');
    expect(groups()).not.toContain('Ground');
  });
  it('every group is on a tab, the surface ones on the surface tab', () => {
    groups().forEach((g) => expect(LAB_GROUP_TABS[g]).toBeDefined());
    ['Pigment', 'Edge', 'Response', 'Support'].forEach((g) => expect(LAB_GROUP_TABS[g]).toBe('surface'));
  });
  it('every key that existed before is still there (saved lab values survive)', () => {
    const keys = new Set(LAB_SETTINGS.map((s) => s.key));
    ['paintOn', 'paintVis', 'strokeScale', 'strokeLength', 'followStrokes', 'followStains', 'edgeOn', 'edgeWidth', 'edgeThin', 'edgePool', 'edgeSoft', 'edgeIrr',
      'hatchOn', 'hatchSpacing', 'hatchWidth', 'hatchLight', 'hatchDark', 'hatchWobble', 'hatchBreaks', 'groundOn', 'groundVis', 'groundScale', 'groundCracks',
      'groundCrackSize', 'groundCrackStretch', 'groundCrackVary', 'gmOn', 'gmDelay', 'gmDuration', 'gmEvolve', 'gmWarp', 'gmLift', 'colorFront', 'holdOn', 'hold']
      .forEach((k) => expect(keys.has(k)).toBe(true));
    ['respOn', 'respEdge', 'respSoft', 'respTooth', 'surfEvolve'].forEach((k) => expect(keys.has(k)).toBe(true));
  });
  it('the evolve switch starts off', () => {
    expect(LAB_SETTINGS.find((s) => s.key === 'surfEvolve').default).toBe(false);
  });
});
