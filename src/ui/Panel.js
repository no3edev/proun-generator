import { Palette } from '../palette/Palette.js';
import { SceneConfig, SceneHistory } from '../config/store.js';
import { Composition } from '../core/Composition.js';
import { SceneManager } from '../core/SceneManager.js';
import { exportPNG } from '../export/PngExporter.js';
import { buildShapeTabs, collapseShapeSettings } from './ShapeTabs.js';
import { buildPresetsPanel } from './PresetsPanel.js';
import { wireAccordionToggle } from './accordion.js';
import { copyText } from './clipboard.js';
import { buildShareUrl } from '../config/share.js';
import { TIME, TIMING_PRESETS, clampDuration, clampHold } from '../config/defaults.js';

// The panel is a view of the SceneConfig: controls write to it (update())
// and are repainted from it (syncControls) whenever it changes — including
// when a preset replaces it. Nothing here talks to Composition, the
// renderer or a timer directly (except Advance / Export, which are actions).

export function initPanel() {
  const paletteSelect = document.getElementById('palette-select');
  Palette.names().forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    paletteSelect.appendChild(opt);
  });
  // a palette change re-rolls the composition (one transition, not two)
  paletteSelect.addEventListener('change', () => {
    Composition.advance({ palette: paletteSelect.value });
  });

  const orientationSelect = document.getElementById('orientation-select');
  orientationSelect.addEventListener('change', () => {
    SceneConfig.update({ orientation: orientationSelect.value });
  });

  wireAccordionToggle(
    document.getElementById('time-header'),
    document.getElementById('time-body'),
    document.getElementById('time-chevron')
  );

  // limits come from config/defaults.js (not index.html), and typed values
  // are clamped by the config — HTML min/max aren't enforced on read.
  // The config keeps milliseconds; the fields show seconds.
  function configureSecondsInput(input, range) {
    input.min = String(range.min / 1000);
    input.max = String(range.max / 1000);
    input.step = String(range.step / 1000);
  }
  const durationInput = document.getElementById('duration-input');
  const holdInput = document.getElementById('hold-input');
  const timingSelect = document.getElementById('timing-select');
  const autoToggle = document.getElementById('auto-toggle');
  configureSecondsInput(durationInput, TIME.durationMs);
  configureSecondsInput(holdInput, TIME.holdMs);

  durationInput.addEventListener('change', () => {
    SceneConfig.update({ time: { durationMs: clampDuration(Number(durationInput.value) * 1000) } });
    syncControls(SceneConfig.get()); // reflect clamping even if nothing changed
  });
  holdInput.addEventListener('change', () => {
    SceneConfig.update({ time: { holdMs: clampHold(Number(holdInput.value) * 1000) } });
    syncControls(SceneConfig.get());
  });
  timingSelect.addEventListener('change', () => {
    const preset = TIMING_PRESETS[timingSelect.value];
    if (preset) SceneConfig.update({ time: { durationMs: preset.durationMs, holdMs: preset.holdMs } });
    syncControls(SceneConfig.get());
  });
  autoToggle.addEventListener('change', () => {
    SceneConfig.update({ time: { autoAdvance: autoToggle.checked } });
  });
  const playlistToggle = document.getElementById('playlist-toggle');
  playlistToggle.addEventListener('change', () => {
    SceneConfig.update({ time: { playlist: playlistToggle.checked } });
  });

  document.getElementById('advance-btn').addEventListener('click', () => Composition.advance());

  // step back / forward through compositions already seen (config/History.js)
  const backBtn = document.getElementById('history-back');
  const forwardBtn = document.getElementById('history-forward');
  function syncHistory() {
    backBtn.disabled = !SceneHistory.canBack();
    forwardBtn.disabled = !SceneHistory.canForward();
    backBtn.title = `Previous composition (←) — ${SceneHistory.position()} of ${SceneHistory.size()}`;
  }
  backBtn.addEventListener('click', () => SceneHistory.back());
  forwardBtn.addEventListener('click', () => SceneHistory.forward());
  SceneHistory.subscribe(syncHistory);
  syncHistory();

  function syncControls(config) {
    paletteSelect.value = config.palette;
    orientationSelect.value = config.orientation;
    durationInput.value = String(config.time.durationMs / 1000);
    holdInput.value = String(config.time.holdMs / 1000);
    const named = Object.keys(TIMING_PRESETS).find((k) => TIMING_PRESETS[k].durationMs === config.time.durationMs && TIMING_PRESETS[k].holdMs === config.time.holdMs);
    timingSelect.value = named || 'custom';
    autoToggle.checked = config.time.autoAdvance;
    playlistToggle.checked = config.time.playlist;
  }
  syncControls(SceneConfig.get());

  // per-shape settings — one tab per registered shape, so a new
  // shape module needs no edits here or in index.html
  const shapeContainer = document.getElementById('shape-tabs');
  buildShapeTabs(shapeContainer);

  // presets — save/load/delete the full SceneConfig, plus JSON export/import
  buildPresetsPanel(document.getElementById('presets-section'));

  // anything that changes the config from outside this panel (a preset
  // loading) repaints the controls; a wholesale replace also rebuilds the
  // per-shape controls, which hold their own values
  SceneConfig.subscribe((next, prev, meta) => {
    // Skip pure re-rolls (a new seed, e.g. every auto-advance tick):
    // nothing shown here changed, and repainting would overwrite a number
    // field the user is in the middle of typing into.
    const shown = (c) => [c.palette, c.orientation, c.time.durationMs, c.time.holdMs, c.time.autoAdvance, c.time.playlist].join('|');
    if (meta.replaced || shown(next) !== shown(prev)) syncControls(next);
    if (meta.replaced) {
      shapeContainer.innerHTML = '';
      buildShapeTabs(shapeContainer);
    }
  });

  // accordion behaviour: as soon as the user moves on to another menu item
  // (orientation, palette, Time, Presets, another shape tab…), open shape
  // settings fold away. Advance / Export are exempt so a user can tweak a
  // shape and re-roll the composition repeatedly without losing the controls.
  const panelEl = document.getElementById('panel');
  const onOtherInteraction = (e) => {
    if (e.target.closest('.button-stack')) return;
    collapseShapeSettings(e.target);
  };
  panelEl.addEventListener('pointerdown', onOtherInteraction);
  panelEl.addEventListener('focusin', onOtherInteraction);

  // PNG at 1x / 2x / 4x the on-screen resolution (export/hiRes.js); the
  // button reports what was actually written, since a huge export can be
  // capped to what the GPU can render
  const exportBtn = document.getElementById('export-png-btn');
  const exportScale = document.getElementById('export-scale');
  const exportSizeRow = document.getElementById('export-size-row');
  const exportSize = document.getElementById('export-size');
  exportScale.addEventListener('change', () => { exportSizeRow.hidden = exportScale.value !== 'custom'; });
  const exportLabel = exportBtn.textContent;
  let exportTimer = null;
  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    let text;
    try {
      const custom = exportScale.value === 'custom';
      if (custom) {
        // a big picture is rendered in one go, and the page cannot repaint meanwhile: say so first
        exportBtn.textContent = 'Rendering…';
        await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      }
      const r = await exportPNG(SceneManager, custom
        ? { size: Number(exportSize.value), seed: SceneConfig.get().seed }
        : { scale: Number(exportScale.value), seed: SceneConfig.get().seed });
      text = `Saved ${r.width}×${r.height}${r.tiled ? ' (tiled)' : ''}${r.limited ? ' (capped)' : ''}`;
    } catch (err) {
      text = 'Export failed';
    }
    exportBtn.disabled = false;
    exportBtn.textContent = text;
    if (exportTimer) clearTimeout(exportTimer);
    exportTimer = setTimeout(() => { exportBtn.textContent = exportLabel; }, 2500);
  });

  // a link to the current composition (seed + palette + orientation +
  // per-shape settings; not timing). See config/share.js.
  const shareBtn = document.getElementById('share-btn');
  const shareLabel = shareBtn.textContent;
  let shareTimer = null;
  shareBtn.addEventListener('click', async () => {
    const ok = await copyText(buildShareUrl(SceneConfig.get(), window.location.href));
    shareBtn.textContent = ok ? 'Link copied' : 'Copy failed';
    if (shareTimer) clearTimeout(shareTimer);
    shareTimer = setTimeout(() => { shareBtn.textContent = shareLabel; }, 1800);
  });
}
