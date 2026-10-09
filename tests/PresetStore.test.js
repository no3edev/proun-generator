import { describe, it, expect, beforeEach, vi } from 'vitest';

function fakeStorage({ failWrites = false, failReads = false } = {}) {
  const m = new Map();
  return {
    getItem: (k) => {
      if (failReads) throw new Error('blocked');
      return m.has(k) ? m.get(k) : null;
    },
    setItem: (k, v) => {
      if (failWrites) throw new Error('quota');
      m.set(k, String(v));
    },
    _map: m
  };
}

const snap = (extra = {}) => ({
  palette: 'bauhaus',
  orientation: 'landscape',
  time: { durationMs: 1100, intervalMs: 4000, autoAdvance: false },
  shapes: { sphere: { count: 2 } },
  ...extra
});

// PresetStore keeps module-level fallback state, so load a fresh copy per test
async function freshStore(storage) {
  vi.resetModules();
  vi.stubGlobal('localStorage', storage);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  return import('../src/presets/PresetStore.js');
}

describe('PresetStore', () => {
  let storage;
  beforeEach(() => { storage = fakeStorage(); });

  it('saves and lists newest-first', async () => {
    const { PresetStore } = await freshStore(storage);
    PresetStore.save('one', snap());
    PresetStore.save('two', snap());
    expect(PresetStore.list().map((p) => p.name)).toEqual(['two', 'one']);
  });

  it('round-trips a snapshot and looks entries up by id', async () => {
    const { PresetStore } = await freshStore(storage);
    const rec = PresetStore.save('x', snap());
    expect(PresetStore.get(rec.id)).toMatchObject({ name: 'x', palette: 'bauhaus', shapes: { sphere: { count: 2 } } });
    expect(PresetStore.get('missing')).toBeNull();
  });

  it('deletes by id', async () => {
    const { PresetStore } = await freshStore(storage);
    const a = PresetStore.save('a', snap());
    PresetStore.save('b', snap());
    PresetStore.delete(a.id);
    expect(PresetStore.list().map((p) => p.name)).toEqual(['b']);
  });

  it('evicts the oldest past MAX_PRESETS', async () => {
    const { PresetStore, MAX_PRESETS } = await freshStore(storage);
    for (let i = 0; i < MAX_PRESETS + 5; i++) PresetStore.save(`p${i}`, snap());
    const list = PresetStore.list();
    expect(list).toHaveLength(MAX_PRESETS);
    expect(list[0].name).toBe(`p${MAX_PRESETS + 4}`);
  });

  it('names blank presets "Untitled"', async () => {
    const { PresetStore } = await freshStore(storage);
    expect(PresetStore.save('   ', snap()).name).toBe('Untitled');
  });

  it('survives corrupt stored JSON', async () => {
    storage.setItem('proun-presets-v1', '{not json');
    const { PresetStore } = await freshStore(storage);
    expect(PresetStore.list()).toEqual([]);
    expect(() => PresetStore.save('ok', snap())).not.toThrow();
    expect(PresetStore.list()).toHaveLength(1);
  });

  it('survives valid JSON of the wrong shape (an object, number or null instead of a list)', async () => {
    // previously this threw inside list() and broke the whole presets panel
    for (const bad of ['{"a":1}', '5', 'null', '"text"', 'true']) {
      const { PresetStore } = await freshStore(fakeStorage());
      storage = fakeStorage();
      storage.setItem('proun-presets-v1', bad);
      const store = (await freshStore(storage)).PresetStore;
      expect(() => store.list()).not.toThrow();
      expect(store.list()).toEqual([]);
      expect(() => store.save('after', snap())).not.toThrow();
      expect(store.list().map((p) => p.name)).toEqual(['after']);
    }
  });

  it('drops malformed entries already in storage', async () => {
    storage.setItem('proun-presets-v1', JSON.stringify([null, 5, { name: 'no shapes' }, { id: 'g', shapes: {} }]));
    const { PresetStore } = await freshStore(storage);
    expect(PresetStore.list().map((p) => p.id)).toEqual(['g']);
  });

  it('falls back to memory when storage is unavailable', async () => {
    const { PresetStore } = await freshStore(fakeStorage({ failReads: true, failWrites: true }));
    PresetStore.save('mem', snap());
    expect(PresetStore.list().map((p) => p.name)).toEqual(['mem']);
  });

  it('falls back to memory when writes fail (quota)', async () => {
    const { PresetStore } = await freshStore(fakeStorage({ failWrites: true }));
    PresetStore.save('mem', snap());
    expect(PresetStore.list()).toHaveLength(1);
  });

  describe('seed and schema version', () => {
    it('stores the seed and stamps the current config version', async () => {
      const { PresetStore } = await freshStore(storage);
      const { CONFIG_VERSION } = await import('../src/config/SceneConfig.js');
      const rec = PresetStore.save('seeded', snap({ seed: 123456, version: 1 }));
      expect(rec.seed).toBe(123456);
      expect(rec.version).toBe(CONFIG_VERSION);
    });

    it('keeps legacy (v1) records as v1 with a null seed — normalized on load, not rewritten', async () => {
      const { PresetStore } = await freshStore(storage);
      PresetStore.importJSON(JSON.stringify([{ version: 1, name: 'old', shapes: {} }]));
      expect(PresetStore.list()[0]).toMatchObject({ version: 1, seed: null });
    });

    it('drops a non-numeric seed', async () => {
      const { PresetStore } = await freshStore(storage);
      PresetStore.importJSON(JSON.stringify([{ name: 'x', seed: 'abc', shapes: {} }]));
      expect(PresetStore.list()[0].seed).toBeNull();
    });
  });

  describe('import / export', () => {
    it('exports and re-imports with fresh ids', async () => {
      const { PresetStore } = await freshStore(storage);
      const rec = PresetStore.save('src', snap());
      const json = PresetStore.exportOne(rec.id);
      const res = PresetStore.importJSON(json);
      expect(res).toEqual({ imported: 1, skipped: 0 });
      const ids = PresetStore.list().map((p) => p.id);
      expect(new Set(ids).size).toBe(2);
    });

    it('accepts a single object as well as an array', async () => {
      const { PresetStore } = await freshStore(storage);
      expect(PresetStore.importJSON(JSON.stringify({ name: 'solo', shapes: {} })).imported).toBe(1);
    });

    it('skips invalid entries instead of failing', async () => {
      const { PresetStore } = await freshStore(storage);
      const res = PresetStore.importJSON(JSON.stringify([{ shapes: {} }, { nope: true }, 7]));
      expect(res).toEqual({ imported: 1, skipped: 2 });
    });

    it('reports non-JSON input', async () => {
      const { PresetStore } = await freshStore(storage);
      expect(PresetStore.importJSON('hello')).toMatchObject({ imported: 0, error: expect.any(String) });
    });

    it('fills in missing fields on imported entries', async () => {
      const { PresetStore } = await freshStore(storage);
      PresetStore.importJSON(JSON.stringify([{ shapes: {} }]));
      expect(PresetStore.list()[0]).toMatchObject({ name: 'Untitled', palette: null, orientation: null, time: {} });
    });
  });
});
