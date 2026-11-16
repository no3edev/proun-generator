import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { scheduleFor, easeAt, EASES, setStagger, stagger } from '../src/core/schedule.js';
import { MOTION_PROFILES, DYNAMICS } from '../src/config/defaults.js';
import { Tween } from '../src/core/Tween.js';
import { Rhythm } from '../src/core/Rhythm.js';

const ROLES = ['anchor', 'support', 'connector', 'accent', 'detail', undefined];
const TYPES = ['cube-fixed', 'rod', 'beam', 'ring'];

describe('per-object schedules (Stage 6.2)', () => {
  it('are deterministic: the same seed, type, role and index always move the same way, another seed does not', () => {
    const who = { seed: 4242, type: 'beam', role: 'support', index: 3 };
    expect(scheduleFor(who, 1)).toEqual(scheduleFor({ ...who }, 1));
    expect(scheduleFor(who, 1)).not.toEqual(scheduleFor({ ...who, seed: 4243 }, 1));
    expect(scheduleFor(who, 1)).not.toEqual(scheduleFor({ ...who, index: 4 }, 1));
  });

  it('keep every shape inside the window: it starts within the first 25% and has arrived by the end (heavy overlap)', () => {
    for (const role of ROLES) for (const type of TYPES) for (let seed = 1; seed <= 150; seed++) for (const index of [0, 1, 7]) {
      const s = scheduleFor({ seed, type, role, index }, 1);
      expect(s.delay, `${role}`).toBeGreaterThanOrEqual(0);
      expect(s.delay, `${role}`).toBeLessThanOrEqual(MOTION_PROFILES.maxStart + 1e-12);
      expect(s.span, `${role}`).toBeGreaterThan(0.3);
      expect(s.delay + s.span, `${role}`).toBeLessThanOrEqual(1 + 1e-12);
    }
  });

  it('follow the roles: anchors start first and take longest, details start last and take least', () => {
    const mean = (role, f) => { let t = 0; for (let seed = 1; seed <= 400; seed++) t += f(scheduleFor({ seed, type: 'beam', role, index: seed % 5 }, 1)); return t / 400; };
    const order = ['anchor', 'support', 'connector', 'accent', 'detail'];
    const delays = order.map((r) => mean(r, (s) => s.delay));
    const spans = order.map((r) => mean(r, (s) => s.span));
    for (let i = 1; i < order.length; i++) {
      expect(delays[i], order[i]).toBeGreaterThan(delays[i - 1]);
      expect(spans[i], order[i]).toBeLessThan(spans[i - 1]);
    }
    expect(scheduleFor({ seed: 1, type: 'beam', role: 'anchor', index: 0 }, 1).ease).toBe('sine');
    expect(scheduleFor({ seed: 1, type: 'beam', role: 'detail', index: 0 }, 1).ease).toBe('quart');
    expect(scheduleFor({ seed: 1, type: 'beam', index: 0 }, 1).ease).toBe('cubic');   // a legacy shape has no role
  });

  it('strength 0 is the motion before 6.2: the whole window, the plain cubic', () => {
    for (const role of ROLES) {
      const s = scheduleFor({ seed: 9, type: 'ring', role, index: 2 }, 0);
      expect(s).toMatchObject({ delay: 0, span: 1, mix: 0 });
      for (const t of [0.1, 0.37, 0.5, 0.9]) expect(easeAt(s, t)).toBeCloseTo(EASES.cubic(t), 12);
    }
  });

  it('the lab strength is clamped and used when none is given', () => {
    const before = stagger.amount;
    setStagger({ amount: 7 }); expect(stagger.amount).toBe(1);
    setStagger({ amount: -1 }); expect(stagger.amount).toBe(0);
    setStagger({ amount: NaN }); expect(stagger.amount).toBe(DYNAMICS.motion.stagger);
    setStagger({ amount: 0 });
    expect(scheduleFor({ seed: 1, type: 'beam', role: 'detail', index: 0 })).toMatchObject({ delay: 0, span: 1 });
    setStagger({ amount: before });
  });

  it('the easings run 0 to 1 and never go backwards, whatever the blend; their peak speeds are sine < cubic < quart', () => {
    for (const ease of Object.keys(EASES)) for (const mix of [0, 0.3, 1]) {
      let prev = 0;
      for (let i = 1; i <= 200; i++) { const v = easeAt({ ease, mix }, i / 200); expect(v).toBeGreaterThanOrEqual(prev - 1e-12); prev = v; }
      expect(easeAt({ ease, mix }, 0)).toBe(0); expect(easeAt({ ease, mix }, 1)).toBe(1);
    }
    const peak = (f) => { let m = 0; for (let i = 0; i < 1000; i++) m = Math.max(m, (f((i + 1) / 1000) - f(i / 1000)) * 1000); return m; };
    expect(peak(EASES.sine)).toBeCloseTo(1.571, 2);
    expect(peak(EASES.cubic)).toBeCloseTo(3, 1);
    expect(peak(EASES.quart)).toBeCloseTo(4, 1);
  });
});

const mesh = () => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  m.userData.baseColor = new THREE.Color('#000000'); m.userData.applyShade = () => {};
  return m;
};
const target = (x, rz = 0) => ({ position: new THREE.Vector3(x, 0, 0), rotation: { x: 0, y: 0, z: rz }, scale: new THREE.Vector3(1, 1, 1), hex: '#ffffff' });

// a hand-made schedule: the geometry's track, with the colour and the material on the same one unless told otherwise
const sched = (delay, span, ease, mix = 1, color = null, material = null) => {
  const g = { delay, span, ease, mix };
  return { ...g, color: color || g, material: material || g };
};

describe('a scheduled tween', () => {
  beforeEach(() => Rhythm.reset());
  const W = 60_000;

  it('waits out its delay, then moves, and lands exactly on the target at its own end (completing once)', () => {
    const m = mesh(); const done = [];
    const s = sched(0.2, 0.5, 'quart');
    Tween.add(m, target(10, 1), W, () => done.push(1), s);
    Tween.update(0.2 * W - 1);
    expect(m.position.x).toBe(0);                      // not started
    Tween.update(0.25 * W + 1);                        // half way through its span (0.2 W delay + 0.25 W)
    expect(m.position.x).toBeCloseTo(5, 6);
    Tween.update(0.25 * W - 1500);                     // 1.5 s before its end at 0.7 W (a quartic ease is flat there: stay clear of float rounding)
    expect(m.position.x).toBeLessThan(10);
    expect(done).toEqual([]);
    Tween.update(1501);
    expect(m.position.x).toBe(10);
    expect(m.rotation.z).toBeCloseTo(1, 9);
    expect(done).toEqual([1]);
    Tween.update(W);
    expect(done).toEqual([1]);
  });

  it('with no schedule, or strength 0, moves exactly as it did before 6.2 (one cubic over the whole window)', () => {
    const a = mesh(), b = mesh(), c = mesh();
    Tween.add(a, target(10), W);
    Tween.add(b, target(10), W, undefined, scheduleFor({ seed: 5, type: 'beam', role: 'detail', index: 1 }, 0));
    Tween.add(c, target(10), W, undefined, null);
    for (let i = 0; i < 40; i++) {
      Tween.update(W / 40);
      expect(b.position.x).toBeCloseTo(a.position.x, 9);
      expect(c.position.x).toBeCloseTo(a.position.x, 9);
    }
    expect(a.position.x).toBe(10);
  });

  it('never goes backwards and never takes a step larger than its easing allows (no jumps), whatever the role', () => {
    for (const role of ROLES) {
      const m = mesh();
      const s = scheduleFor({ seed: 77, type: 'beam', role, index: 1 }, 1);
      Tween.add(m, target(10), W, undefined, s);
      const peak = { sine: 1.5708, cubic: 3, quart: 4 }[s.ease];
      const maxStep = (10 * peak * (W / 600)) / (s.span * W) + 1e-9;
      let prev = 0;
      for (let i = 0; i < 700; i++) {
        Tween.update(W / 600);
        const d = m.position.x - prev;
        expect(d, role).toBeGreaterThanOrEqual(-1e-12);
        expect(d, role).toBeLessThanOrEqual(maxStep);
        prev = m.position.x;
      }
      expect(m.position.x).toBe(10);
    }
  });

  it('a new target while it waits or moves starts from where the shape is: no jump, in position or rotation', () => {
    const m = mesh();
    Tween.add(m, target(10, 1), W, undefined, sched(0.2, 0.6, 'cubic'));
    Tween.update(0.1 * W);                             // still in its delay
    const q0 = m.quaternion.clone(); const x0 = m.position.x;
    Tween.add(m, target(-4, -1), W, undefined, sched(0.1, 0.5, 'quart'));
    Tween.update(0.05 * W);                            // still waiting (new delay)
    expect(m.position.x).toBeCloseTo(x0, 9);
    expect(m.quaternion.angleTo(q0)).toBeLessThan(1e-9);
    Tween.update(0.3 * W);                             // moving
    const x1 = m.position.x; const q1 = m.quaternion.clone();
    Tween.add(m, target(7, 0.5), W, undefined, sched(0, 1, 'sine'));
    Tween.update(0);
    expect(m.position.x).toBeCloseTo(x1, 9);
    expect(m.quaternion.angleTo(q1)).toBeLessThan(1e-9);
    Tween.update(2 * W);
    expect(m.position.x).toBe(7);
  });

  it('finishWithin keeps the picture and gets there in the time given, in its delay and in its move', () => {
    for (const at of [0.1, 0.5]) {
      const m = mesh();
      Tween.add(m, target(10), W, undefined, sched(0.2, 0.6, 'quart'));
      Tween.update(at * W);
      const x = m.position.x;
      expect(Tween.finishWithin(m, 1000)).toBe(true);
      Tween.update(0);
      expect(m.position.x).toBeCloseTo(x, 9);
      Tween.update(999);
      expect(m.position.x).toBeLessThan(10);
      Tween.update(2);
      expect(m.position.x).toBe(10);
    }
  });

  it('the lab pause shows the staggered state at a fraction of the window and lets the slider go back', () => {
    const early = mesh(), late = mesh();
    Tween.add(early, target(10), W, undefined, sched(0, 1, 'sine'));
    Tween.add(late, target(10), W, undefined, sched(0.25, 0.35, 'quart'));
    Rhythm.setHold(0.2, W);
    Tween.update(16);
    expect(early.position.x).toBeGreaterThan(0.5);
    expect(late.position.x).toBe(0);
    Rhythm.setHold(1, W);
    Tween.update(16);
    expect(early.position.x).toBe(10); expect(late.position.x).toBe(10);
    Rhythm.setHold(0.3, W);
    Tween.update(16);
    expect(late.position.x).toBeGreaterThan(0); expect(late.position.x).toBeLessThan(10);
    Rhythm.setHold(null, W);
    Tween.update(2 * W);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Stage 6.3: colour and material have timelines of their own
// ---------------------------------------------------------------------------------------------------------------------------------
describe('colour and material schedules (6.3)', () => {
  const meanOf = (role, pick) => { let t = 0; for (let seed = 1; seed <= 400; seed++) t += pick(scheduleFor({ seed, type: 'beam', role, index: seed % 5 }, 1)); return t / 400; };
  const ORDER = ['anchor', 'support', 'connector', 'accent', 'detail'];

  it('leave the geometry exactly as Stage 6.2 drew it (numbers pinned from v0.16.0)', () => {
    const pinned = [
      [4242, 'beam', 'support', 3, 0.03864753065165132, 0.7621633293572814, 'cubic'],
      [1, 'rod', 'anchor', 0, 0.009561780253425241, 0.9402071592397988, 'sine'],
      [99, 'ring', 'detail', 2, 0.22575498963939028, 0.3979090414009988, 'quart'],
      [7, 'beam', undefined, 1, 0.07727570001035929, 0.8090500629972667, 'cubic'],
      [12, 'circle', 'accent', 5, 0.1641118103824556, 0.5583876589639113, 'quart']
    ];
    for (const [seed, type, role, index, delay, span, ease] of pinned) {
      const s = scheduleFor({ seed, type, role: role ?? undefined, index }, 1);
      expect(s.delay).toBeCloseTo(delay, 14); expect(s.span).toBeCloseTo(span, 14); expect(s.ease).toBe(ease);
    }
  });

  it('are deterministic, and inside the window for every role, type and 150 seeds (each track over by the end of the window)', () => {
    const who = { seed: 4242, type: 'beam', role: 'accent', index: 2 };
    expect(scheduleFor(who, 1)).toEqual(scheduleFor({ ...who }, 1));
    for (const role of ROLES) for (const type of TYPES) for (let seed = 1; seed <= 150; seed++) {
      const s = scheduleFor({ seed, type, role, index: seed % 4 }, 1);
      for (const k of ['color', 'material']) {
        expect(s[k].delay, `${role} ${k}`).toBeGreaterThanOrEqual(0);
        expect(s[k].span, `${role} ${k}`).toBeGreaterThan(0.25);
        expect(s[k].delay + s[k].span, `${role} ${k}`).toBeLessThanOrEqual(1 + 1e-12);
      }
    }
  });

  it('run the other way round to the geometry: anchors recolour last, details first', () => {
    const cd = ORDER.map((r) => meanOf(r, (s) => s.color.delay));
    for (let i = 1; i < ORDER.length; i++) expect(cd[i], ORDER[i]).toBeLessThan(cd[i - 1]);
    const md = ORDER.map((r) => meanOf(r, (s) => s.material.delay));
    for (let i = 1; i < ORDER.length; i++) expect(md[i], ORDER[i]).toBeLessThan(md[i - 1]);
    // the opposite of the geometry's order
    expect(meanOf('anchor', (s) => s.color.delay)).toBeGreaterThan(meanOf('anchor', (s) => s.delay) + 0.2);
    expect(meanOf('detail', (s) => s.color.delay)).toBeLessThan(meanOf('detail', (s) => s.delay));
  });

  it('are independent of the geometry: an anchor starts moving before it recolours, a detail often recolours before it moves, and the three differ', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const a = scheduleFor({ seed, type: 'beam', role: 'anchor', index: 0 }, 1);
      expect(a.color.delay).toBeGreaterThan(a.delay);
    }
    let before = 0;
    for (let seed = 1; seed <= 100; seed++) { const d = scheduleFor({ seed, type: 'beam', role: 'detail', index: 0 }, 1); if (d.color.delay < d.delay) before++; }
    expect(before).toBeGreaterThan(80);
    const s = scheduleFor({ seed: 3, type: 'beam', role: 'support', index: 0 }, 1);
    expect(new Set([s.delay, s.color.delay, s.material.delay]).size).toBe(3);
  });

  it('at strength 0 all three tracks are the whole window with the plain cubic (the motion before 6.2, colour included)', () => {
    for (const role of ROLES) {
      const s = scheduleFor({ seed: 9, type: 'ring', role, index: 2 }, 0);
      for (const tr of [s, s.color, s.material]) expect(tr).toMatchObject({ delay: 0, span: 1, mix: 0 });
    }
  });
});

// a mesh with what Tween drives besides geometry: the colour front, the highlight and a shadow plane
function richMesh() {
  const m = mesh();
  m.userData.front = {
    uFront: { value: 1 }, uFrontA: { value: 1 }, uFrom: { value: new THREE.Color() }, uMid: { value: new THREE.Color() },
    uSeed: { value: new THREE.Vector2() }, uSeedFrom: { value: new THREE.Vector2() }, seedFromSet: false,
    uHiAmt: { value: 0 }, uHiN: { value: new THREE.Vector3() }, uHiBand: { value: new THREE.Vector2() }, uHiTint: { value: new THREE.Color() }, hiDir: new THREE.Vector3()
  };
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#000000' }));
  sh.position.set(0.2, -0.2, 0);                  // already out from behind its shape (one tucked behind it starts in its end colour, by design)
  sh.visible = true;
  m.userData.shadow = { mesh: sh };
  return m;
}
const richTarget = (x) => ({
  ...target(x),
  highlight: { on: true, dir: new THREE.Vector3(1, 0, 0), tint: new THREE.Color('#ffffff') },
  shadow: { local: new THREE.Vector3(0.5, -0.5, 0), color: new THREE.Color('#ffffff') }
});

describe('a tween with three timelines (6.3)', () => {
  beforeEach(() => Rhythm.reset());
  const W = 60_000;
  // geometry 0..0.3 of the window, colour 0.5..0.9, material 0.3..0.5: nothing overlaps, so each can be read on its own
  const apart = sched(0, 0.3, 'cubic', 1, { delay: 0.5, span: 0.4, ease: 'cubic', mix: 1 }, { delay: 0.3, span: 0.2, ease: 'cubic', mix: 1 });

  it('the colour front, the highlight and the shadow follow their own timelines, not the geometry\'s', () => {
    const m = richMesh(); const f = m.userData.front; const sh = m.userData.shadow.mesh;
    Tween.add(m, richTarget(10), W, undefined, apart);
    Tween.update(0.15 * W);                                          // geometry half way; colour and material not started
    expect(m.position.x).toBeCloseTo(5, 6);
    expect(f.uFront.value).toBe(0);
    expect(f.uHiAmt.value).toBe(0);
    expect(sh.material.color.getHex()).toBe(0x000000);
    expect(sh.position.x).toBeCloseTo(0.35, 6);                      // the shadow plane travels with the geometry (0.2 -> 0.5)
    Tween.update(0.2 * W);                                           // 0.35 W: geometry home, material under way, colour still waiting
    expect(m.position.x).toBe(10);
    expect(f.uFront.value).toBe(0);
    expect(f.uHiAmt.value).toBeGreaterThan(0); expect(f.uHiAmt.value).toBeLessThan(1);
    expect(sh.material.color.getHex()).not.toBe(0x000000);
    expect(sh.position.x).toBeCloseTo(0.5, 9);
    Tween.update(0.2 * W);                                           // 0.55 W: material done, colour just started
    expect(f.uHiAmt.value).toBe(1);
    expect(sh.material.color.getHex()).toBe(0xffffff);
    expect(f.uFront.value).toBeGreaterThanOrEqual(0); expect(f.uFront.value).toBeLessThan(0.2);
    Tween.update(0.2 * W);                                           // 0.75 W: 5/8 of the way through the colour's span
    expect(f.uFront.value).toBeCloseTo((EASES.cubic(0.625) - 0.1) / 0.9, 6);
  });

  it('completes once, when the LAST of the three is over (a colour that ends after the move is not cut short)', () => {
    const m = richMesh(); const f = m.userData.front; const done = [];
    Tween.add(m, richTarget(10), W, () => done.push(1), apart);
    Tween.update(0.3 * W + 10);
    expect(m.position.x).toBe(10);
    expect(done).toEqual([]);                                        // the geometry is over, the colour is not
    Tween.update(0.55 * W);                                          // 0.85 W
    expect(done).toEqual([]);
    expect(f.uFront.value).toBeLessThan(1);
    Tween.update(0.05 * W + 10);                                     // 0.9 W: the colour's end
    expect(f.uFront.value).toBe(1);
    expect(done).toEqual([1]);
    Tween.update(W);
    expect(done).toEqual([1]);
  });

  it('a colour that comes first lands before the shape has moved', () => {
    const m = richMesh(); const f = m.userData.front;
    const early = sched(0.3, 0.6, 'cubic', 1, { delay: 0, span: 0.2, ease: 'cubic', mix: 1 }, { delay: 0.05, span: 0.2, ease: 'cubic', mix: 1 });
    Tween.add(m, richTarget(10), W, undefined, early);
    Tween.update(0.25 * W);
    expect(f.uFront.value).toBe(1);
    expect(m.position.x).toBe(0);
    Tween.update(W);
    expect(m.position.x).toBe(10);
  });

  it('strength 0 recolours exactly as v0.15.1 did: the front follows the eased geometry progress, shifted by the colour delay', () => {
    const a = richMesh(), b = richMesh();
    Tween.add(a, richTarget(10), W);                                  // no schedule
    Tween.add(b, richTarget(10), W, undefined, scheduleFor({ seed: 5, type: 'beam', role: 'anchor', index: 1 }, 0));
    for (let i = 0; i < 40; i++) {
      Tween.update(W / 40);
      expect(b.userData.front.uFront.value).toBeCloseTo(a.userData.front.uFront.value, 9);
      expect(b.userData.front.uHiAmt.value).toBeCloseTo(a.userData.front.uHiAmt.value, 9);
    }
    expect(a.userData.front.uFront.value).toBe(1);
  });

  it('finishWithin keeps all three where they are and brings all three home in the time given', () => {
    const m = richMesh(); const f = m.userData.front; const sh = m.userData.shadow.mesh; const done = [];
    Tween.add(m, richTarget(10), W, () => done.push(1), apart);
    Tween.update(0.4 * W);                                           // geometry home, material half way, colour waiting
    const before = [m.position.x, f.uFront.value, f.uHiAmt.value, sh.material.color.getHex()];
    expect(Tween.finishWithin(m, 2000)).toBe(true);
    Tween.update(0);
    expect([m.position.x, f.uFront.value, f.uHiAmt.value, sh.material.color.getHex()]).toEqual(before);
    Tween.update(1999);
    expect(done).toEqual([]);
    Tween.update(2);
    expect(done).toEqual([1]);
    expect(f.uFront.value).toBe(1); expect(f.uHiAmt.value).toBe(1);
  });

  it('a change interrupted while the colour is still waiting does not jump (the layers freeze as before)', () => {
    const m = richMesh(); const f = m.userData.front;
    Tween.add(m, richTarget(10), W, undefined, apart);
    Tween.update(0.4 * W);
    const x = m.position.x;
    Tween.add(m, richTarget(-3), W, undefined, apart);
    Tween.update(0);
    expect(m.position.x).toBeCloseTo(x, 9);
    expect(f.uFront.value).toBe(0);
    Tween.update(2 * W);
    expect(m.position.x).toBe(-3);
    expect(f.uFront.value).toBe(1);
  });
});
