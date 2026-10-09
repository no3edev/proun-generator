import { describe, it, expect, vi } from 'vitest';
import { createHistory } from '../src/config/History.js';
import { createSceneConfig } from '../src/config/SceneConfig.js';

const ctx = () => ({
  shapeTypes: ['a', 'b'], paletteNames: ['warm', 'cool', 'ash'], orientationNames: ['landscape'],
  defaultPalette: 'warm', defaultOrientation: 'landscape', randomSeed: () => 100
});
function setup(options) {
  const config = createSceneConfig(ctx());
  const history = createHistory(config, options);
  return { config, history };
}
const roll = (config, seed, extra = {}) => config.update({ seed, ...extra });

describe('recording', () => {
  it('starts with the current composition as its only entry', () => {
    const { history } = setup();
    history.start();
    expect(history.size()).toBe(1);
    expect(history.position()).toBe(1);
    expect(history.canBack()).toBe(false);
    expect(history.canForward()).toBe(false);
  });

  it('records nothing before start()', () => {
    const { config, history } = setup();
    roll(config, 1);
    roll(config, 2);
    history.start();
    expect(history.size()).toBe(1); // only where we were at start()
  });

  it('adds an entry for every new seed', () => {
    const { config, history } = setup();
    history.start();
    roll(config, 1); roll(config, 2); roll(config, 3);
    expect(history.size()).toBe(4);
    expect(history.position()).toBe(4);
    expect(history.canBack()).toBe(true);
    expect(history.canForward()).toBe(false);
  });

  it('ignores changes that are not a new composition (settings, orientation, timing)', () => {
    const { config, history } = setup();
    history.start();
    config.update({ shapes: { a: { count: 4 } }, time: { durationMs: 2000 } });
    expect(history.size()).toBe(1);
  });

  it('a palette-only change updates the current entry instead of adding one', () => {
    const { config, history } = setup();
    history.start();
    roll(config, 1);
    config.update({ palette: 'cool' });
    expect(history.size()).toBe(2);
    roll(config, 2);
    history.back();
    expect(config.get()).toMatchObject({ seed: 1, palette: 'cool' });
  });

  it('a preset load counts when it brings a new seed, not when the seed is the same', () => {
    const { config, history } = setup();
    history.start();
    config.replace({ ...config.toJSON(), seed: 777 });
    expect(history.size()).toBe(2);
    config.replace({ ...config.toJSON() });
    expect(history.size()).toBe(2);
  });

  it('start() again begins a fresh history from the current composition', () => {
    const { config, history } = setup();
    history.start();
    roll(config, 1); roll(config, 2);
    history.start();
    expect(history.size()).toBe(1);
    expect(history.canBack()).toBe(false);
  });
});

describe('back / forward', () => {
  it('steps through the compositions, restoring seed and palette', () => {
    const { config, history } = setup();
    history.start();
    roll(config, 11);
    roll(config, 22, { palette: 'cool' });
    roll(config, 33, { palette: 'ash' });

    expect(history.back()).toBe(true);
    expect(config.get()).toMatchObject({ seed: 22, palette: 'cool' });
    expect(history.back()).toBe(true);
    expect(config.get()).toMatchObject({ seed: 11, palette: 'warm' });
    expect(history.back()).toBe(true);
    expect(config.get().seed).toBe(100);
    expect(history.back()).toBe(false);      // at the start
    expect(history.position()).toBe(1);

    expect(history.forward()).toBe(true);
    expect(config.get().seed).toBe(11);
    history.forward(); history.forward();
    expect(config.get()).toMatchObject({ seed: 33, palette: 'ash' });
    expect(history.forward()).toBe(false);   // at the end
  });

  it('moving does not itself add history', () => {
    const { config, history } = setup();
    history.start();
    roll(config, 1); roll(config, 2);
    history.back(); history.back(); history.forward();
    expect(history.size()).toBe(3);
  });

  it('a new composition after stepping back drops the "forward" entries (like a browser)', () => {
    const { config, history } = setup();
    history.start();
    roll(config, 1); roll(config, 2); roll(config, 3);
    history.back(); history.back();         // at seed 1
    roll(config, 9);
    expect(history.size()).toBe(3);         // 100, 1, 9
    expect(history.canForward()).toBe(false);
    history.back();
    expect(config.get().seed).toBe(1);
    history.back();
    expect(config.get().seed).toBe(100);
  });

  it('applies the CURRENT settings: going back never rewrites your sliders or counts', () => {
    const { config, history } = setup();
    history.start();
    roll(config, 1);
    config.update({ shapes: { a: { count: 7, spread: 0.3 } } });
    roll(config, 2);
    history.back();
    expect(config.get().seed).toBe(1);
    expect(config.get().shapes.a).toMatchObject({ count: 7, spread: 0.3 });
  });

  it('leaves a locked shape type locked while stepping through seeds', () => {
    const { config, history } = setup();
    history.start();
    roll(config, 1);
    config.update({ shapes: { a: { locked: [{ position: [1, 2, 3], rotation: [0, 0, 0], scale: [1, 1, 1], hex: '#112233' }] } } });
    roll(config, 2);
    history.back();
    history.back();
    expect(config.get().shapes.a.locked).toHaveLength(1);
    expect(config.get().shapes.a.count).toBe(1);
  });
});

describe('limit', () => {
  it('drops the oldest entries past the limit and keeps the position consistent', () => {
    const { config, history } = setup({ limit: 5 });
    history.start();
    for (let i = 1; i <= 8; i++) roll(config, i);
    expect(history.size()).toBe(5);
    expect(history.position()).toBe(5);
    for (let i = 0; i < 10; i++) history.back();
    expect(config.get().seed).toBe(4);      // the oldest survivor: 4..8
  });
});

describe('subscribe', () => {
  it('notifies when the position or availability changes, and can unsubscribe', () => {
    const { config, history } = setup();
    const fn = vi.fn();
    const off = history.subscribe(fn);
    history.start();
    expect(fn).toHaveBeenCalledTimes(1);
    roll(config, 1);
    expect(fn).toHaveBeenCalledTimes(2);
    history.back();
    expect(fn).toHaveBeenCalledTimes(3);
    config.update({ shapes: { a: { count: 3 } } }); // not a new composition
    expect(fn).toHaveBeenCalledTimes(3);
    off();
    history.forward();
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
