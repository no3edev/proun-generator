// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';

// Canvas textures need a real canvas; the UI behavior doesn't.
vi.mock('../src/texture/PigmentLayer.js', async () => {
  const T = await import('three');
  return { pickStructureTexture: () => new T.Texture() };
});
vi.mock('../src/export/PngExporter.js', () => ({ exportPNG: vi.fn() }));

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const bodyMarkup = html.match(/<body>([\s\S]*?)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');

let SceneConfig, SceneHistory, Composition, exportPNG;
const $ = (id) => document.getElementById(id);
const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
const settle = async () => (await import('../src/core/Tween.js')).Tween.update(100000);
const panelOf = (type) => $(`vis-${type}`).closest('div').parentElement;

beforeEach(async () => {
  vi.resetModules();
  vi.useRealTimers();
  localStorage.clear();
  document.body.innerHTML = bodyMarkup;
  ({ SceneConfig, SceneHistory } = await import('../src/config/store.js'));
  ({ Composition } = await import('../src/core/Composition.js'));
  ({ exportPNG } = await import('../src/export/PngExporter.js'));
  const { Billboard } = await import('../src/core/Billboard.js');

  const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 100);
  camera.position.set(4.2, 3.4, 5.2);
  camera.lookAt(0, 0, 0);
  Billboard.computeFromCamera(camera);
  Composition.init(new THREE.Scene());
  SceneHistory.start();

  const { initPanel } = await import('../src/ui/Panel.js');
  initPanel();
});

describe('lock toggle', () => {
  const lockBtn = (type) => panelOf(type).querySelector('.lock-toggle');

  it('every shape tab has one, labelled for its shape', () => {
    expect(lockBtn('sphere').getAttribute('aria-label')).toBe('Lock Sphere');
    expect(lockBtn('sphere').getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelectorAll('.lock-toggle').length).toBeGreaterThanOrEqual(7);
  });

  it('locking freezes the type, flips the button, and disables the controls that are baked in', () => {
    SceneConfig.update({ shapes: { sphere: { count: 3 } } });
    const panel = panelOf('sphere');
    lockBtn('sphere').click();

    expect(SceneConfig.get().shapes.sphere.locked).toHaveLength(3);
    expect(lockBtn('sphere').getAttribute('aria-pressed')).toBe('true');
    expect(lockBtn('sphere').getAttribute('aria-label')).toBe('Unlock Sphere');
    expect(lockBtn('sphere').classList.contains('active')).toBe(true);
    expect(panel.querySelector('.shape-props').classList.contains('locked')).toBe(true);
    expect(panel.querySelector('.shape-props').inert).toBe(true);
    const [minus, plus] = panel.querySelectorAll('.stepper-btn');
    expect(minus.disabled && plus.disabled).toBe(true);
    expect(panel.querySelector('.count-row input').disabled).toBe(true);
    expect(panel.querySelector('input[type="range"]').disabled).toBe(true);
    expect(panel.querySelector('.count-row input').value).toBe('3');
  });

  it('the Visible checkbox stays usable while locked', () => {
    lockBtn('sphere').click();
    const vis = $('vis-sphere');
    expect(vis.disabled).toBe(false);
    vis.checked = false;
    fire(vis, 'change');
    expect(SceneConfig.get().shapes.sphere.visible).toBe(false);
  });

  it('clicking again unlocks and gives the controls back', () => {
    lockBtn('sphere').click();
    lockBtn('sphere').click();
    expect(SceneConfig.get().shapes.sphere.locked).toBeNull();
    expect(lockBtn('sphere').getAttribute('aria-pressed')).toBe('false');
    const panel = panelOf('sphere');
    expect(panel.querySelector('.shape-props').inert).toBe(false);
    expect(panel.querySelector('.count-row input').disabled).toBe(false);
  });

  it('cannot lock a type that has no instances (and says so by being disabled)', () => {
    expect(SceneConfig.get().shapes.rod.count).toBe(0);
    expect(lockBtn('rod').disabled).toBe(true);
    lockBtn('rod').click();
    expect(SceneConfig.get().shapes.rod.locked).toBeNull();
  });

  it('becomes available as soon as the count goes above zero', () => {
    const panel = panelOf('rod');
    const [, plus] = panel.querySelectorAll('.stepper-btn');
    plus.click();
    expect(SceneConfig.get().shapes.rod.count).toBe(1);
    expect(lockBtn('rod').disabled).toBe(false);
  });

  it('a preset that carries a lock rebuilds the tab in its locked state', () => {
    const entries = [{ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], hex: '#112233' }];
    SceneConfig.replace({ shapes: { sphere: { locked: entries } } });
    expect(lockBtn('sphere').getAttribute('aria-pressed')).toBe('true');
    expect(panelOf('sphere').querySelector('.shape-props').classList.contains('locked')).toBe(true);
  });

  it('locking one type does not disable another', () => {
    lockBtn('sphere').click();
    expect(panelOf('plane').querySelector('.count-row input').disabled).toBe(false);
    expect(lockBtn('plane').getAttribute('aria-pressed')).toBe('false');
  });
});

describe('history buttons', () => {
  const back = () => $('history-back');
  const forward = () => $('history-forward');

  it('start disabled — there is nothing to go back to yet', () => {
    expect(back().disabled).toBe(true);
    expect(forward().disabled).toBe(true);
  });

  it('enable after advancing; back restores the previous composition, forward returns', () => {
    const first = SceneConfig.get().seed;
    $('advance-btn').click();
    const second = SceneConfig.get().seed;
    expect(second).not.toBe(first);
    expect(back().disabled).toBe(false);
    expect(forward().disabled).toBe(true);

    back().click();
    expect(SceneConfig.get().seed).toBe(first);
    expect(back().disabled).toBe(true);
    expect(forward().disabled).toBe(false);

    forward().click();
    expect(SceneConfig.get().seed).toBe(second);
    expect(forward().disabled).toBe(true);
  });

  it('shows where you are in the title', () => {
    $('advance-btn').click();
    $('advance-btn').click();
    expect(back().title).toContain('3 of 3');
    back().click();
    expect(back().title).toContain('2 of 3');
  });

  it('a palette re-roll is a step too, and going back restores the palette', () => {
    const before = SceneConfig.get();
    const other = [...$('palette-select').options].map((o) => o.value).find((v) => v !== before.palette);
    $('palette-select').value = other;
    fire($('palette-select'), 'change');
    expect(SceneConfig.get().palette).toBe(other);
    back().click();
    expect(SceneConfig.get()).toMatchObject({ seed: before.seed, palette: before.palette });
    expect($('palette-select').value).toBe(before.palette);   // the control follows
  });

  it('going back does not touch your settings', () => {
    $('advance-btn').click();
    SceneConfig.update({ shapes: { sphere: { count: 6 } } });
    back().click();
    expect(SceneConfig.get().shapes.sphere.count).toBe(6);
  });
});

describe('← / → keys (main.js)', () => {
  async function wire() {
    const { initInteraction } = await import('../src/main.js');
    initInteraction();
  }
  const press = (target, code) => {
    const e = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
  };

  it('step back and forward through compositions', async () => {
    await wire();
    const first = SceneConfig.get().seed;
    $('advance-btn').click();
    const second = SceneConfig.get().seed;

    const left = press(document.body, 'ArrowLeft');
    expect(left.defaultPrevented).toBe(true);
    expect(SceneConfig.get().seed).toBe(first);
    press(document.body, 'ArrowRight');
    expect(SceneConfig.get().seed).toBe(second);
  });

  it('do nothing at the ends', async () => {
    await wire();
    const seed = SceneConfig.get().seed;
    press(document.body, 'ArrowLeft');
    press(document.body, 'ArrowRight');
    expect(SceneConfig.get().seed).toBe(seed);
  });

  it('are left alone while typing or operating a control (cursor keys must keep working there)', async () => {
    await wire();
    $('advance-btn').click();
    const seed = SceneConfig.get().seed;
    const name = document.querySelector('#presets-section input[type="text"]');
    const slider = document.querySelector('input[type="range"]');
    for (const el of [name, slider, $('palette-select'), $('duration-input')]) {
      const e = press(el, 'ArrowLeft');
      expect(e.defaultPrevented).toBe(false);
      expect(SceneConfig.get().seed).toBe(seed);
    }
  });
});

describe('export control', () => {
  const btn = () => $('export-png-btn');

  it('offers 1x / 2x / 4x, defaulting to what is on screen', () => {
    const select = $('export-scale');
    expect([...select.options].map((o) => o.value)).toEqual(['1', '2', '4']);
    expect(select.value).toBe('1');
    expect(select.getAttribute('aria-label')).toBeTruthy();
  });

  it('exports at the chosen scale, named for the current seed, and reports what was written', async () => {
    exportPNG.mockResolvedValue({ requested: 4, scale: 4, limited: false, width: 5760, height: 4480 });
    $('export-scale').value = '4';
    btn().click();
    expect(btn().disabled).toBe(true);        // busy while it works
    await vi.waitFor(() => expect(btn().textContent).toBe('Saved 5760×4480'));
    expect(btn().disabled).toBe(false);
    expect(exportPNG).toHaveBeenCalledTimes(1);
    const [, options] = exportPNG.mock.calls[0];
    expect(options).toEqual({ scale: 4, seed: SceneConfig.get().seed });
  });

  it('says so when the GPU capped the size', async () => {
    exportPNG.mockResolvedValue({ requested: 4, scale: 2.5, limited: true, width: 3600, height: 2800 });
    $('export-scale').value = '4';
    btn().click();
    await vi.waitFor(() => expect(btn().textContent).toBe('Saved 3600×2800 (capped)'));
  });

  it('reports failure and stays usable', async () => {
    exportPNG.mockRejectedValue(new Error('GL lost'));
    btn().click();
    await vi.waitFor(() => expect(btn().textContent).toBe('Export failed'));
    expect(btn().disabled).toBe(false);
  });

  it('puts its label back after a moment', async () => {
    exportPNG.mockResolvedValue({ requested: 1, scale: 1, limited: false, width: 1, height: 1 });
    vi.useFakeTimers();
    btn().click();
    await vi.advanceTimersByTimeAsync(0);
    expect(btn().textContent).toBe('Saved 1×1');
    await vi.advanceTimersByTimeAsync(2600);
    expect(btn().textContent).toBe('Export PNG');
    vi.useRealTimers();
  });
});

describe('rod in the panel', () => {
  it('has a tab with its own glyph (not the circle fallback)', () => {
    const labels = [...document.querySelectorAll('#shape-tabs [aria-label]')].map((b) => b.getAttribute('aria-label'));
    expect(labels).toContain('Rod');
    const tab = [...document.querySelectorAll('#shape-tabs [aria-label="Rod"]')][0];
    const circle = [...document.querySelectorAll('#shape-tabs [aria-label="Circle"]')][0];
    expect(tab.innerHTML).not.toBe(circle.innerHTML);
  });

  it('adding rods through the UI puts them in the scene', async () => {
    const [, plus] = panelOf('rod').querySelectorAll('.stepper-btn');
    plus.click(); plus.click();
    expect(SceneConfig.get().shapes.rod.count).toBe(2);
  });
});


describe('snap rotation checkbox', () => {
  const snap = (type) => document.getElementById(`snap-${type}`);

  it('every shape that rotates has one, labelled in plain words, off by default', () => {
    ['cube-fixed', 'cube-variable', 'sphere', 'triangle', 'plane', 'rod'].forEach((t) => {
      expect(snap(t), t).not.toBeNull();
      expect(snap(t).checked).toBe(false);
      expect(snap(t).type).toBe('checkbox');
      expect(document.querySelector(`label[for="snap-${t}"]`).textContent).toBe('Snap rotation to 45°');
    });
  });

  it('the circle has none: it always faces the camera, so the option would do nothing', () => {
    expect(snap('circle')).toBeNull();
    expect($('vis-circle')).not.toBeNull();
  });

  it('lives in the settings panel with the other per-shape options', () => {
    const props = panelOf('plane').querySelector('.shape-props');
    expect(props.contains(snap('plane'))).toBe(true);
  });

  it('writes the setting for that shape only', () => {
    snap('plane').checked = true;
    fire(snap('plane'), 'change');
    expect(SceneConfig.get().shapes.plane.snapRotation).toBe(true);
    expect(SceneConfig.get().shapes['cube-fixed'].snapRotation).toBe(false);
    snap('plane').checked = false;
    fire(snap('plane'), 'change');
    expect(SceneConfig.get().shapes.plane.snapRotation).toBe(false);
  });

  it('is repainted from a loaded preset', () => {
    SceneConfig.replace({ shapes: { sphere: { snapRotation: true } } });
    expect(snap('sphere').checked).toBe(true);
    expect(snap('plane').checked).toBe(false);
  });

  it('is disabled while the type is locked (the rotations are frozen) and back afterwards', () => {
    panelOf('plane').querySelector('.lock-toggle').click();
    expect(snap('plane').disabled).toBe(true);
    panelOf('plane').querySelector('.lock-toggle').click();
    expect(snap('plane').disabled).toBe(false);
  });
});
