import { describe, it, expect } from 'vitest';
import { readTab, writeTab, TAB_STORAGE_KEY } from '../src/ui/PanelTabs.js';

const store = (init = {}) => {
  const m = { ...init };
  return { m, getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; } };
};
const ids = ['scene', 'shapes', 'motion', 'surface'];

describe('tab memory', () => {
  it('opens the first tab by default', () => {
    expect(readTab(store(), ids)).toBe('scene');
    expect(readTab(null, ids)).toBe('scene');
  });
  it('remembers the last tab', () => {
    const st = store();
    writeTab(st, 'surface');
    expect(readTab(st, ids)).toBe('surface');
  });
  it('ignores a tab that no longer exists, bad JSON, and failing storage', () => {
    expect(readTab(store({ [TAB_STORAGE_KEY]: JSON.stringify({ tab: 'gone' }) }), ids)).toBe('scene');
    expect(readTab(store({ [TAB_STORAGE_KEY]: '{nope' }), ids)).toBe('scene');
    const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
    expect(readTab(bad, ids)).toBe('scene');
    expect(() => writeTab(bad, 'motion')).not.toThrow();
  });
});
