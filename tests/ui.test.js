// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The real index.html markup, driving the real Panel / ShapeTabs /
// PresetsPanel / SceneConfig. No renderer: Composition isn't initialised, so
// this tests the UI <-> config wiring (what the controls write, and how they
// repaint when the config changes), not pixels.
const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const bodyMarkup = html.match(/<body>([\s\S]*?)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');

let SceneConfig;
const $ = (id) => document.getElementById(id);
const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
const setValue = (el, v, evt = 'change') => { el.value = v; fire(el, evt); };

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  document.body.innerHTML = bodyMarkup;
  ({ SceneConfig } = await import('../src/config/store.js'));
  const { initPanel } = await import('../src/ui/Panel.js');
  initPanel();
});

describe('controls reflect the config at startup', () => {
  it('populates and selects palette, orientation and time', () => {
    const c = SceneConfig.get();
    expect($('palette-select').value).toBe(c.palette);
    expect($('palette-select').options.length).toBeGreaterThan(1);
    expect($('orientation-select').value).toBe(c.orientation);
    expect($('duration-input').value).toBe(String(c.time.durationMs));
    expect($('interval-input').value).toBe(String(c.time.intervalMs));
    expect($('auto-toggle').checked).toBe(false);
  });

  it('limits come from config, not index.html', () => {
    expect($('duration-input').min).toBe('200');
    expect($('duration-input').max).toBe('6000');
    expect($('interval-input').min).toBe('500');
  });
});

describe('top-level controls write to the config', () => {
  it('palette change picks the palette AND a new seed (a re-roll)', () => {
    const before = SceneConfig.get();
    const other = [...$('palette-select').options].map((o) => o.value).find((v) => v !== before.palette);
    setValue($('palette-select'), other);
    expect(SceneConfig.get().palette).toBe(other);
    expect(SceneConfig.get().seed).not.toBe(before.seed);
  });

  it('orientation change does not re-roll', () => {
    const seed = SceneConfig.get().seed;
    setValue($('orientation-select'), 'portrait');
    expect(SceneConfig.get().orientation).toBe('portrait');
    expect(SceneConfig.get().seed).toBe(seed);
  });

  it('duration is clamped, and the field shows the clamped value', () => {
    setValue($('duration-input'), '-5');
    expect(SceneConfig.get().time.durationMs).toBe(200);
    expect($('duration-input').value).toBe('200');
    setValue($('duration-input'), '999999');
    expect(SceneConfig.get().time.durationMs).toBe(6000);
    expect($('duration-input').value).toBe('6000');
  });

  it('an emptied field falls back to the default', () => {
    setValue($('duration-input'), '2500');
    setValue($('duration-input'), '');
    expect(SceneConfig.get().time.durationMs).toBe(1100);
    expect($('duration-input').value).toBe('1100');
  });

  it('interval is clamped (a negative one can no longer make auto-advance spin)', () => {
    setValue($('interval-input'), '-100');
    expect(SceneConfig.get().time.intervalMs).toBe(500);
    expect($('interval-input').value).toBe('500');
  });

  it('auto toggle writes time.autoAdvance', () => {
    $('auto-toggle').checked = true;
    fire($('auto-toggle'), 'change');
    expect(SceneConfig.get().time.autoAdvance).toBe(true);
  });

  it('the Advance button picks a new seed', () => {
    const seed = SceneConfig.get().seed;
    $('advance-btn').click();
    expect(SceneConfig.get().seed).not.toBe(seed);
  });
});

describe('shape tabs write to the config', () => {
  it('builds one tab per registered shape', async () => {
    const { shapeRegistry } = await import('../src/shapes/registry.js');
    const labels = [...document.querySelectorAll('#shape-tabs [aria-label]')].map((b) => b.getAttribute('aria-label'));
    shapeRegistry.forEach((s) => expect(labels).toContain(s.label));
  });

  it('Visible checkbox writes shapes[type].visible', () => {
    const box = $('vis-sphere');
    box.checked = false;
    fire(box, 'change');
    expect(SceneConfig.get().shapes.sphere.visible).toBe(false);
  });

  it('count stepper (+, –, typed) writes and clamps shapes[type].count', () => {
    const panel = $('vis-sphere').closest('div').parentElement;
    const [minus, plus] = panel.querySelectorAll('.stepper-btn');
    const input = panel.querySelector('.count-row input');
    plus.click(); plus.click();
    expect(SceneConfig.get().shapes.sphere.count).toBe(3);
    expect(input.value).toBe('3');
    minus.click();
    expect(SceneConfig.get().shapes.sphere.count).toBe(2);
    setValue(input, '999');
    expect(SceneConfig.get().shapes.sphere.count).toBe(12);
    expect(input.value).toBe('12');
  });

  it('spread slider writes shapes[type].spread', () => {
    const panel = $('vis-sphere').closest('div').parentElement;
    const slider = panel.querySelector('input[type="range"]');
    setValue(slider, '1.5', 'input');
    expect(SceneConfig.get().shapes.sphere.spread).toBe(1.5);
  });

  it('shape controls never touch other shapes', () => {
    const before = JSON.stringify(SceneConfig.get().shapes.circle);
    $('vis-sphere').checked = false;
    fire($('vis-sphere'), 'change');
    expect(JSON.stringify(SceneConfig.get().shapes.circle)).toBe(before);
  });
});

describe('controls follow the config', () => {
  it('a replace (preset load) repaints every control and rebuilds the shape controls', () => {
    SceneConfig.replace({
      palette: [...$('palette-select').options][2].value,
      orientation: 'square',
      time: { durationMs: 3000, intervalMs: 7000, autoAdvance: true },
      shapes: { sphere: { count: 5, visible: false, sizeMin: 0.5, sizeMax: 2, spread: 0.3 } }
    });
    expect($('palette-select').value).toBe([...$('palette-select').options][2].value);
    expect($('orientation-select').value).toBe('square');
    expect($('duration-input').value).toBe('3000');
    expect($('interval-input').value).toBe('7000');
    expect($('auto-toggle').checked).toBe(true);

    const panel = $('vis-sphere').closest('div').parentElement; // freshly rebuilt
    expect($('vis-sphere').checked).toBe(false);
    expect(panel.querySelector('.count-row input').value).toBe('5');
    expect(panel.querySelector('input[type="range"]').value).toBe('0.3');
  });

  it('a pure re-roll (new seed) does not overwrite a number field being typed into', () => {
    $('duration-input').value = '77'; // typed, not yet committed
    SceneConfig.update({ seed: 12345 });
    expect($('duration-input').value).toBe('77');
  });
});

describe('presets', () => {
  const rows = () => [...document.querySelectorAll('.preset-row')];
  const click = (row, label) => row.querySelector(`[aria-label="${label}"]`).click();

  it('Save stores the whole config including the seed; Load restores it exactly', () => {
    SceneConfig.update({ seed: 555, orientation: 'portrait', shapes: { sphere: { count: 4 } } });
    const saved = SceneConfig.toJSON();

    const name = document.querySelector('#presets-section input[type="text"]');
    name.value = 'my preset';
    [...document.querySelectorAll('#presets-section button')].find((b) => b.textContent === 'Save').click();
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('my preset');

    SceneConfig.update({ seed: 1, orientation: 'square', shapes: { sphere: { count: 1 } } });
    click(rows()[0], 'Load preset');
    expect(SceneConfig.get()).toEqual(saved);
    expect($('orientation-select').value).toBe('portrait');
  });

  it('Load works for a legacy preset without a seed (fresh seed, settings applied)', () => {
    localStorage.setItem('proun-presets-v1', JSON.stringify([{
      id: 'legacy', name: 'old one', version: 1, createdAt: new Date().toISOString(),
      palette: null, orientation: 'portrait', time: {}, shapes: { plane: { count: 3 } }
    }]));
    // re-open the panel so it lists the stored preset
    document.querySelector('#presets-section').innerHTML = '';
    return import('../src/ui/PresetsPanel.js').then(({ buildPresetsPanel }) => {
      buildPresetsPanel($('presets-section'));
      const seed = SceneConfig.get().seed;
      click(rows()[0], 'Load preset');
      expect(SceneConfig.get().shapes.plane.count).toBe(3);
      expect(SceneConfig.get().orientation).toBe('portrait');
      expect(SceneConfig.get().seed).not.toBe(seed);
    });
  });
});

describe('Copy link', () => {
  const setClipboard = (impl) => Object.defineProperty(navigator, 'clipboard', { value: impl, configurable: true });

  it('copies a link that restores the current composition, and confirms on the button', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    SceneConfig.update({ seed: 8675309, orientation: 'portrait', shapes: { sphere: { count: 3 } } });

    $('share-btn').click();
    await vi.advanceTimersByTimeAsync(0);

    expect(writeText).toHaveBeenCalledTimes(1);
    const url = writeText.mock.calls[0][0];
    expect(url).toMatch(/#s=[A-Za-z0-9_-]+$/);

    const { decodeShare } = await import('../src/config/share.js');
    const patch = decodeShare(url.slice(url.indexOf('#')));
    expect(patch).toMatchObject({ seed: 8675309, orientation: 'portrait' });
    expect(patch.shapes.sphere.count).toBe(3);

    expect($('share-btn').textContent).toBe('Link copied');
    await vi.advanceTimersByTimeAsync(2000);
    expect($('share-btn').textContent).toBe('Copy link');
    vi.useRealTimers();
    setClipboard(undefined);
  });

  it('says so when copying fails', async () => {
    vi.useFakeTimers();
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    $('share-btn').click();
    await vi.advanceTimersByTimeAsync(0);
    expect($('share-btn').textContent).toBe('Copy failed');
    vi.useRealTimers();
    setClipboard(undefined);
  });
});

describe('boot (main.js)', () => {
  const boot = async () => (await import('../src/main.js')).bootConfig();

  it('applies a share link, removes it from the address bar and keeps its composition across reloads', async () => {
    const { encodeShare } = await import('../src/config/share.js');
    const donor = JSON.parse(JSON.stringify(SceneConfig.get()));
    SceneConfig.update({ seed: 424242, palette: [...$('palette-select').options][1].value });
    const hash = '#s=' + encodeShare(SceneConfig.get());
    const wantPalette = SceneConfig.get().palette;
    SceneConfig.replace(donor); // back to a different state

    window.history.replaceState(null, '', '/' + hash);
    expect(window.location.hash).toBe(hash);
    await boot();

    expect(SceneConfig.get().seed).toBe(424242);
    expect(SceneConfig.get().palette).toBe(wantPalette);
    expect(window.location.hash).toBe('');                       // consumed
    expect(JSON.parse(localStorage.getItem('proun-session')).seed).toBe(424242); // and remembered
  });

  it('autosaves changes to the session (debounced), and a flush on pagehide saves immediately', async () => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', '/');
    await boot();
    SceneConfig.update({ seed: 1357 });
    expect(localStorage.getItem('proun-session')).toBeNull();
    vi.advanceTimersByTime(500);
    expect(JSON.parse(localStorage.getItem('proun-session')).seed).toBe(1357);

    SceneConfig.update({ seed: 2468 });
    window.dispatchEvent(new Event('pagehide'));
    expect(JSON.parse(localStorage.getItem('proun-session')).seed).toBe(2468);
    vi.useRealTimers();
  });

  it('starts the history from the composition it settled on, not from the throwaway default', async () => {
    const { SceneHistory } = await import('../src/config/store.js');
    localStorage.setItem('proun-session', JSON.stringify({ ...SceneConfig.toJSON(), seed: 31415 }));
    window.history.replaceState(null, '', '/');
    await boot();

    expect(SceneConfig.get().seed).toBe(31415);
    expect(SceneHistory.size()).toBe(1);          // just the restored composition
    expect(SceneHistory.canBack()).toBe(false);

    $('advance-btn').click();
    expect(SceneHistory.canBack()).toBe(true);
    SceneHistory.back();
    expect(SceneConfig.get().seed).toBe(31415);   // back goes to where we started, not a random default
  });

  it('restores the previous session on the next boot', async () => {
    localStorage.setItem('proun-session', JSON.stringify({ ...SceneConfig.toJSON(), seed: 97531, orientation: 'square' }));
    window.history.replaceState(null, '', '/');
    await boot();
    expect(SceneConfig.get().seed).toBe(97531);
    expect(SceneConfig.get().orientation).toBe('square');
  });

  it('survives localStorage being unavailable (blocked by privacy settings)', async () => {
    const spy = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('SecurityError'); });
    window.history.replaceState(null, '', '/');
    await expect(boot()).resolves.not.toThrow();
    spy.mockRestore();
  });
});

describe('Space key (main.js)', () => {
  async function wire() {
    const { initInteraction } = await import('../src/main.js');
    initInteraction();
  }
  const press = (target) => {
    const e = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
  };

  it('advances when nothing interactive is focused, and prevents page scroll', async () => {
    await wire();
    const seed = SceneConfig.get().seed;
    const e = press(document.body);
    expect(SceneConfig.get().seed).not.toBe(seed);
    expect(e.defaultPrevented).toBe(true);
  });

  it('is left alone while typing in a field (so a name can contain spaces)', async () => {
    await wire();
    const seed = SceneConfig.get().seed;
    const name = document.querySelector('#presets-section input[type="text"]');
    const e = press(name);
    expect(e.defaultPrevented).toBe(false);
    expect(SceneConfig.get().seed).toBe(seed);
  });

  it.each([['checkbox', () => $('auto-toggle')], ['button', () => $('export-png-btn')], ['select', () => $('palette-select')]])(
    'is left alone on a focused %s', async (_n, getEl) => {
      await wire();
      const seed = SceneConfig.get().seed;
      expect(press(getEl()).defaultPrevented).toBe(false);
      expect(SceneConfig.get().seed).toBe(seed);
    }
  );

  it('clicking the stage advances', async () => {
    await wire();
    const seed = SceneConfig.get().seed;
    $('scene').click();
    expect(SceneConfig.get().seed).not.toBe(seed);
  });
});
