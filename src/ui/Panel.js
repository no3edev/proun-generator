import { Palette } from '../palette/Palette.js';
import { Composition } from '../core/Composition.js';
import { SceneManager } from '../core/SceneManager.js';
import { shapeRegistry } from '../shapes/registry.js';
import { exportPNG } from '../export/PngExporter.js';

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

  // shape visibility checkboxes — built directly from the registry,
  // so a new shape module needs no edits here or in index.html
  const container = document.getElementById('shape-checkboxes');
  shapeRegistry.forEach((shape) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.style.marginBottom = '6px';

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.id = `type-${shape.type}`;
    box.checked = true;
    box.addEventListener('change', () => Composition.setVisible(shape.type, box.checked));

    const label = document.createElement('label');
    label.htmlFor = box.id;
    label.textContent = shape.label;

    row.appendChild(box);
    row.appendChild(label);
    container.appendChild(row);
  });

  document.getElementById('shape-count').textContent =
    `shapes: one of each of ${shapeRegistry.length} types, all at once`;

  document.getElementById('export-png-btn').addEventListener('click', () => {
    exportPNG(SceneManager);
  });
}
