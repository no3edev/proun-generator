import { Palette } from '../palette/Palette.js';
import { Composition } from '../core/Composition.js';
import { SceneManager } from '../core/SceneManager.js';
import { exportPNG } from '../export/PngExporter.js';
import { buildShapeAccordion } from './ShapeAccordion.js';
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

  // per-shape settings accordion — built directly from the registry,
  // so a new shape module needs no edits here or in index.html
  const container = document.getElementById('shape-checkboxes');
  buildShapeAccordion(container);

  document.getElementById('export-png-btn').addEventListener('click', () => {
    exportPNG(SceneManager);
  });
}
