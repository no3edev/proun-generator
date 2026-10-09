import { describe, it, expect } from 'vitest';
import { encodeShare, decodeShare, buildShareUrl, hasShareParam, SHARE_FORMAT } from '../src/config/share.js';
import { createSceneConfig } from '../src/config/SceneConfig.js';
import { SHAPE_LIMITS } from '../src/config/defaults.js';

const ctx = {
  shapeTypes: ['cube-fixed', 'sphere', 'plane'],
  paletteNames: ['Proun — classic', 'Proun 99 — ochre suspension'],
  orientationNames: ['landscape', 'portrait'],
  defaultPalette: 'Proun — classic',
  defaultOrientation: 'landscape',
  randomSeed: () => 1
};
const make = () => createSceneConfig(ctx);
const composed = () => {
  const c = make();
  c.update({
    seed: 3735928559, palette: 'Proun 99 — ochre suspension', orientation: 'portrait',
    shapes: {
      sphere: { count: 4, visible: false, sizeMin: 0.5, sizeMax: 2.5, spread: 0.75 },
      plane: { count: 7, spread: 1.9 }
    }
  });
  return c;
};

describe('encode / decode', () => {
  it('produces URL-safe text', () => {
    expect(encodeShare(composed().get())).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('round-trips a composition, including a non-ASCII palette name', () => {
    const src = composed().get();
    const patch = decodeShare(encodeShare(src));
    expect(patch.seed).toBe(src.seed);
    expect(patch.palette).toBe('Proun 99 — ochre suspension');
    expect(patch.orientation).toBe('portrait');

    const dst = make();
    dst.update(patch);
    const a = dst.get();
    expect(a.seed).toBe(src.seed);
    expect(a.palette).toBe(src.palette);
    expect(a.orientation).toBe(src.orientation);
    expect(a.shapes).toEqual(src.shapes);
  });

  it('does NOT carry timing — that is the viewer\'s own preference', () => {
    const src = make();
    src.update({ time: { durationMs: 5000, intervalMs: 9000, autoAdvance: true } });
    const dst = make();
    const before = dst.get().time;
    dst.update(decodeShare(encodeShare(src.get())));
    expect(dst.get().time).toEqual(before);
  });

  it('accepts "#s=…", "s=…" and the bare value', () => {
    const v = encodeShare(composed().get());
    expect(decodeShare(`#s=${v}`).seed).toBe(3735928559);
    expect(decodeShare(`s=${v}`).seed).toBe(3735928559);
    expect(decodeShare(v).seed).toBe(3735928559);
  });

  it('stays compact', () => {
    expect(encodeShare(composed().get()).length).toBeLessThan(500);
  });

  it('buildShareUrl replaces any existing fragment and keeps path + query', () => {
    const url = buildShareUrl(composed().get(), 'https://x.test/proun/?a=1#old');
    expect(url.startsWith('https://x.test/proun/?a=1#s=')).toBe(true);
    expect(url.match(/#/g)).toHaveLength(1);
    expect(decodeShare(url.slice(url.indexOf('#'))).seed).toBe(3735928559);
  });

  // GOLDEN (encode side): the exact link text for a known config. Changing how
  // links are written would make new links disagree with old ones.
  it('encodes a known config to the exact same text forever', () => {
    const c = make();
    c.update({ seed: 4242, shapes: { sphere: { count: 2, visible: false, sizeMin: 0.5, sizeMax: 1.5, spread: 0.6 } } });
    expect(encodeShare(c.get())).toBe('eyJ2IjoxLCJzIjo0MjQyLCJwIjoiUHJvdW4g4oCUIGNsYXNzaWMiLCJvIjoibGFuZHNjYXBlIiwiaCI6eyJjdWJlLWZpeGVkIjpbMSwxLDEsMSwxXSwic3BoZXJlIjpbMCwyLDAuNSwxLjUsMC42XSwicGxhbmUiOlsxLDEsMSwxLDFdfX0');
  });

  // GOLDEN: this link was produced by format v1. If this test fails, the link
  // format changed — which would break every link people already shared. Bump
  // SHARE_FORMAT and keep a decoder for the old one instead of editing this.
  it('decodes a golden v1 link forever', () => {
    const golden = 'eyJ2IjoxLCJzIjo0MjQyLCJwIjoiUHJvdW4g4oCUIGNsYXNzaWMiLCJvIjoibGFuZHNjYXBlIiwiaCI6eyJzcGhlcmUiOlswLDIsMC41LDEuNSwwLjZdfX0';
    expect(SHARE_FORMAT).toBe(1);
    expect(decodeShare(`#s=${golden}`)).toEqual({
      seed: 4242, palette: 'Proun — classic', orientation: 'landscape',
      // `locked: null` = "this link doesn't lock the type" (the decoder says so
      // explicitly, so a viewer's own lock can't leak into the linked composition).
      // The LINK TEXT above is unchanged and still decodes — that's the guarantee.
      shapes: { sphere: { visible: false, count: 2, sizeMin: 0.5, sizeMax: 1.5, spread: 0.6, snapRotation: false, locked: null } }
    });
  });
});

describe('hostile / corrupt input', () => {
  const b64 = (obj) => Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)).toString('base64url');

  it('returns null (never throws) for things that are not share links', () => {
    for (const junk of [undefined, null, '', '#', '#s=', 's=', '#x=1', '!!!', '#s=!!!', '#s=%%', 'a'.repeat(5000),
      `#s=${b64('not json')}`, `#s=${b64('null')}`, `#s=${b64('[]')}`, `#s=${b64('5')}`]) {
      expect(() => decodeShare(junk)).not.toThrow();
      expect(decodeShare(junk)).toBeNull();
    }
  });

  it('rejects an unknown format version and a missing/invalid seed', () => {
    expect(decodeShare(b64({ v: 99, s: 1 }))).toBeNull();
    expect(decodeShare(b64({ s: 1 }))).toBeNull();
    expect(decodeShare(b64({ v: SHARE_FORMAT }))).toBeNull();
    expect(decodeShare(b64({ v: SHARE_FORMAT, s: 'abc' }))).toBeNull();
    expect(decodeShare(b64({ v: SHARE_FORMAT, s: null }))).toBeNull();
  });

  it('rejects invalid UTF-8 rather than decoding it to garbage', () => {
    // otherwise-valid JSON with one corrupt byte inside a string: a lenient
    // decoder would quietly turn it into U+FFFD and carry on
    const corrupt = Buffer.concat([Buffer.from('{"v":1,"s":5,"p":"'), Buffer.from([0xff]), Buffer.from('"}')]);
    expect(decodeShare(corrupt.toString('base64url'))).toBeNull();
    const clean = Buffer.from('{"v":1,"s":5,"p":"ok"}');
    expect(decodeShare(clean.toString('base64url'))).toMatchObject({ seed: 5, palette: 'ok' });
  });

  it('skips malformed per-shape entries and non-numeric fields', () => {
    const patch = decodeShare(b64({
      v: 1, s: 1,
      h: { a: 'x', b: [1, 2], c: [1, 'many', null, {}, 0.5], d: [2, 3, 1, 1, 1], e: null }
    }));
    expect(patch.shapes).toEqual({ c: { visible: true, spread: 0.5, snapRotation: false, locked: null }, d: { count: 3, sizeMin: 1, sizeMax: 1, spread: 1, snapRotation: false, locked: null } });
  });

  it('ignores non-string palette / orientation', () => {
    const patch = decodeShare(b64({ v: 1, s: 1, p: 5, o: { x: 1 } }));
    expect(patch).toEqual({ seed: 1, shapes: {} });
  });

  it('out-of-range values are clamped when applied (a hand-edited link cannot break the scene)', () => {
    const patch = decodeShare(b64({
      v: 1, s: 7,
      h: { sphere: [1, 999, 0, 1e6, -50], 'no-such-shape': [1, 5, 1, 1, 1] }
    }));
    const c = make();
    c.update(patch);
    expect(c.get().shapes.sphere).toMatchObject({
      count: SHAPE_LIMITS.count.max, sizeMin: SHAPE_LIMITS.size.min, sizeMax: SHAPE_LIMITS.size.max, spread: SHAPE_LIMITS.spread.min
    });
    expect(c.get().shapes['no-such-shape']).toBeUndefined();
  });

  it('an unknown palette or orientation in a link is ignored, not applied', () => {
    const c = make();
    c.update(decodeShare(b64({ v: 1, s: 9, p: 'No Such Palette', o: 'upside-down' })));
    expect(c.get().palette).toBe('Proun — classic');
    expect(c.get().orientation).toBe('landscape');
    expect(c.get().seed).toBe(9);
  });
});

describe('hasShareParam', () => {
  it('detects the parameter, valid or not', () => {
    expect(hasShareParam('#s=abc')).toBe(true);
    expect(hasShareParam('#s=')).toBe(true);
    expect(hasShareParam('#x=1&s=2')).toBe(true);
    expect(hasShareParam('')).toBe(false);
    expect(hasShareParam('#section')).toBe(false);
    expect(hasShareParam(undefined)).toBe(false);
  });
});


describe('locked shapes in links', () => {
  const E = (over = {}) => ({ position: [1.234567891, -2, 3], rotation: [0.1, 0.2, 0.3], scale: [1, 2, 3], hex: '#c1362b', ...over });
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const payloadOf = (link) => JSON.parse(Buffer.from(link, 'base64url').toString('utf8'));

  it('a link with nothing locked has no lock data at all (so it is unchanged from before locks existed)', () => {
    expect('l' in payloadOf(encodeShare(make().get()))).toBe(false);
  });

  it('round-trips a locked type (numbers rounded to 5 places)', () => {
    const src = make();
    src.update({ seed: 5, shapes: { sphere: { locked: [E(), E({ hex: '#222222', position: [0, 0, 0] })] } } });
    const dst = make();
    dst.update(decodeShare(encodeShare(src.get())));
    const got = dst.get().shapes.sphere;
    expect(got.count).toBe(2);
    expect(got.locked).toHaveLength(2);
    expect(got.locked[0].position[0]).toBeCloseTo(1.23457, 5);
    expect(got.locked[0].rotation).toEqual([0.1, 0.2, 0.3]);
    expect(got.locked[0].scale).toEqual([1, 2, 3]);
    expect(got.locked[1].hex).toBe('#222222');
    expect(dst.get().shapes.plane.locked).toBeNull();
  });

  it('a link that does not lock a type UNlocks it for the viewer (the link is the whole composition)', () => {
    const viewer = make();
    viewer.update({ shapes: { plane: { locked: [E()] } } });
    viewer.update(decodeShare(encodeShare(make().get())));
    expect(viewer.get().shapes.plane.locked).toBeNull();
  });

  it('ignores malformed lock data (the type simply arrives unlocked)', () => {
    const base = { v: 1, s: 1, h: { sphere: [1, 3, 1, 1, 1] } };
    const row = [1, 2, 3, 0, 0, 0, 1, 1, 1, '#aabbcc'];
    for (const bad of [
      { l: { sphere: 'x' } }, { l: { sphere: [[1, 2]] } }, { l: { sphere: [[...row.slice(0, 9), 5]] } },
      { l: { sphere: [[...row.slice(0, 8), 'x', '#aabbcc']] } }, { l: { sphere: [row, null] } }, { l: 5 }, { l: null }, { l: { sphere: {} } }
    ]) {
      const patch = decodeShare(b64({ ...base, ...bad }));
      expect(patch.shapes.sphere.locked).toBeNull();
    }
    expect(decodeShare(b64({ ...base, l: { sphere: [row] } })).shapes.sphere.locked).toHaveLength(1);
  });

  it('lock data for a type the link does not describe is ignored', () => {
    const row = [1, 2, 3, 0, 0, 0, 1, 1, 1, '#aabbcc'];
    const patch = decodeShare(b64({ v: 1, s: 1, h: { sphere: [1, 1, 1, 1, 1] }, l: { ghost: [row] } }));
    expect(Object.keys(patch.shapes)).toEqual(['sphere']);
  });

  it('hostile numbers in a lock are clamped / the lock dropped when applied', () => {
    const c = make();
    c.update(decodeShare(b64({ v: 1, s: 1, h: { sphere: [1, 1, 1, 1, 1] }, l: { sphere: [[1e12, 0, 0, 0, 0, 0, 0, 0, 1e9, '#aabbcc']] } })));
    expect(c.get().shapes.sphere.locked[0].position[0]).toBe(50);
    expect(c.get().shapes.sphere.locked[0].scale).toEqual([0.001, 0.001, 100]);
    const d = make();
    d.update(decodeShare(b64({ v: 1, s: 1, h: { sphere: [1, 1, 1, 1, 1] }, l: { sphere: [[0, 0, 0, 0, 0, 0, 1, 1, 1, 'javascript:alert(1)']] } })));
    expect(d.get().shapes.sphere.locked).toBeNull();
  });

  it('even a fully locked scene (every type at the maximum count) fits and decodes', () => {
    const wide = createSceneConfig({ ...ctx, shapeTypes: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], defaultPalette: ctx.defaultPalette });
    const shapes = {};
    'abcdefg'.split('').forEach((t) => { shapes[t] = { locked: Array.from({ length: 12 }, (_, i) => E({ position: [i / 7, i / 3, -i / 5] })) }; });
    wide.update({ shapes });
    const link = encodeShare(wide.get());
    expect(link.length).toBeLessThan(16384);
    const back = decodeShare(link);
    expect(back).not.toBeNull();
    expect(Object.values(back.shapes).every((s) => s.locked && s.locked.length === 12)).toBe(true);
  });
});
