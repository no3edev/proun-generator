import { Palette } from '../palette/Palette.js';
import { Composition } from '../core/Composition.js';
import { SceneManager } from '../core/SceneManager.js';
import { exportPNG } from '../export/PngExporter.js';
import { buildShapeTabs } from './ShapeTabs.js';
import { buildPresetsPanel } from './PresetsPanel.js';
import { wireAccordionToggle } from './accordion.js';

export function initPanel() {
  const paletteSelect = document.getElementById('palette-select');
  Palette.names().forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    paletteSelect.appendChild(opt);
  });
  paletteSelect.value = Palette.activeName();
  paletteSelect.addEventListener('change', () => {
    Palette.setActive(paletteSelect.value);
    SceneManager.updateBackground();
    Composition.advance();
  });

  const orientationSelect = document.getElementById('orientation-select');
  orientationSelect.addEventListener('change', () => {
    SceneManager.applyOrientation(orientationSelect.value);
  });

  wireAccordionToggle(
    document.getElementById('time-header'),
    document.getElementById('time-body'),
    document.getElementById('time-chevron')
  );

  const durationInput = document.getElementById('duration-input');
  durationInput.addEventListener('change', () => {
    Composition.setDuration(parseInt(durationInput.value, 10) || 1100);
  });
  Composition.setDuration(parseInt(durationInput.value, 10));

  document.getElementById('advance-btn').addEventListener('click', () => Composition.advance());

  const autoToggle = document.getElementById('auto-toggle');
  const intervalInput = document.getElementById('interval-input');
  let autoTimer = null;
  function restartAuto() {
    if (autoTimer) clearInterval(autoTimer);
    if (autoToggle.checked) {
      autoTimer = setInterval(() => Composition.advance(), parseInt(intervalInput.value, 10) || 4000);
    }
  }
  autoToggle.addEventListener('change', restartAuto);
  intervalInput.addEventListener('change', restartAuto);

  // per-shape settings — one tab per registered shape, so a new
  // shape module needs no edits here or in index.html
  const shapeContainer = document.getElementById('shape-tabs');
  buildShapeTabs(shapeContainer);

  // presets — save/load/delete the full scene config (palette,
  // orientation, time, per-shape settings), plus JSON export/import.
  // See presets/PresetStore.js and presets/SceneSnapshot.js.
  buildPresetsPanel(document.getElementById('presets-section'), {
    getIntervalMs: () => parseInt(intervalInput.value, 10) || 4000,
    getAutoAdvance: () => autoToggle.checked,
    applyTimeControls: (time) => {
      durationInput.value = String(time.durationMs);
      intervalInput.value = String(time.intervalMs);
      autoToggle.checked = time.autoAdvance;
      restartAuto();
    },
    syncTopControls: (palette, orientation) => {
      paletteSelect.value = palette;
      orientationSelect.value = orientation;
    },
    refreshShapeSettings: () => {
      shapeContainer.innerHTML = '';
      buildShapeTabs(shapeContainer);
    }
  });

  document.getElementById('export-png-btn').addEventListener('click', () => {
    exportPNG(SceneManager);
  });
}
