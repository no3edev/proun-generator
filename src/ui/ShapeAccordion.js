import { shapeRegistry } from '../shapes/registry.js';
import { ShapeSettings, MIN_COUNT, MAX_COUNT } from '../settings/ShapeSettings.js';
import { Composition } from '../core/Composition.js';
import { createAccordionItem } from './accordion.js';

/**
 * Builds one collapsible section per registered shape into `container`.
 * Each section has: a visibility checkbox, an instance count (with
 * -/+ buttons), a size-multiplier min/max range, and a position-spread
 * slider (0 = origin, 2 = double the original edge bounds). Nothing
 * here is shape-specific — a new shape module needs no edits to this
 * file, same as everywhere else in the registry-driven parts of the app.
 */
export function buildShapeAccordion(container) {
  shapeRegistry.forEach((shape) => {
    const settings = ShapeSettings.get(shape.type);

    const visBox = document.createElement('input');
    visBox.type = 'checkbox';
    visBox.checked = settings.visible;
    visBox.addEventListener('change', () => {
      ShapeSettings.setVisible(shape.type, visBox.checked);
      Composition.setVisible(shape.type, visBox.checked);
    });

    const { item, body } = createAccordionItem(shape.label, { leadingEl: visBox });

    // --- instance count ---
    const countField = document.createElement('div');
    countField.className = 'field';
    const countLabel = document.createElement('label');
    countLabel.textContent = 'Count';
    const countRow = document.createElement('div');
    countRow.className = 'row count-row';

    const minusBtn = document.createElement('button');
    minusBtn.type = 'button';
    minusBtn.className = 'stepper-btn';
    minusBtn.textContent = '–';

    const countInput = document.createElement('input');
    countInput.type = 'number';
    countInput.min = String(MIN_COUNT);
    countInput.max = String(MAX_COUNT);
    countInput.step = '1';
    countInput.value = String(settings.count);

    const plusBtn = document.createElement('button');
    plusBtn.type = 'button';
    plusBtn.className = 'stepper-btn';
    plusBtn.textContent = '+';

    function pushCount(newCount) {
      ShapeSettings.setCount(shape.type, newCount);
      Composition.setCount(shape.type, ShapeSettings.get(shape.type).count);
      countInput.value = String(ShapeSettings.get(shape.type).count);
    }
    minusBtn.addEventListener('click', () => pushCount(parseInt(countInput.value, 10) - 1));
    plusBtn.addEventListener('click', () => pushCount(parseInt(countInput.value, 10) + 1));
    countInput.addEventListener('change', () => {
      const v = parseInt(countInput.value, 10);
      pushCount(Number.isNaN(v) ? settings.count : v);
    });

    countRow.appendChild(minusBtn);
    countRow.appendChild(countInput);
    countRow.appendChild(plusBtn);
    countField.appendChild(countLabel);
    countField.appendChild(countRow);

    // --- size range ---
    const sizeField = document.createElement('div');
    sizeField.className = 'field';
    const sizeLabel = document.createElement('label');
    sizeLabel.textContent = 'Size range (× multiplier)';
    const sizeRow = document.createElement('div');
    sizeRow.className = 'row size-range-row';

    const sizeMin = document.createElement('input');
    sizeMin.type = 'number';
    sizeMin.min = '0.05';
    sizeMin.max = '10';
    sizeMin.step = '0.05';
    sizeMin.value = settings.sizeMin.toFixed(2);

    const dash = document.createElement('span');
    dash.textContent = '–';

    const sizeMax = document.createElement('input');
    sizeMax.type = 'number';
    sizeMax.min = '0.05';
    sizeMax.max = '10';
    sizeMax.step = '0.05';
    sizeMax.value = settings.sizeMax.toFixed(2);

    function pushSizeRange() {
      const min = parseFloat(sizeMin.value);
      const max = parseFloat(sizeMax.value);
      if (Number.isNaN(min) || Number.isNaN(max)) return;
      ShapeSettings.setSizeRange(shape.type, min, max);
      // reflect any clamping (e.g. min > max got swapped) back into the fields
      const s = ShapeSettings.get(shape.type);
      sizeMin.value = s.sizeMin.toFixed(2);
      sizeMax.value = s.sizeMax.toFixed(2);
    }
    sizeMin.addEventListener('change', pushSizeRange);
    sizeMax.addEventListener('change', pushSizeRange);

    sizeRow.appendChild(sizeMin);
    sizeRow.appendChild(dash);
    sizeRow.appendChild(sizeMax);
    sizeField.appendChild(sizeLabel);
    sizeField.appendChild(sizeRow);

    // --- position spread ---
    const spreadField = document.createElement('div');
    spreadField.className = 'field';
    const spreadLabel = document.createElement('label');
    spreadLabel.textContent = 'Position spread';
    const spreadValue = document.createElement('span');
    spreadValue.className = 'spread-value';
    spreadValue.textContent = settings.spread.toFixed(2);
    spreadLabel.appendChild(spreadValue);

    const spreadSlider = document.createElement('input');
    spreadSlider.type = 'range';
    spreadSlider.min = '0';
    spreadSlider.max = '2';
    spreadSlider.step = '0.01';
    spreadSlider.value = String(settings.spread);
    spreadSlider.addEventListener('input', () => {
      const v = parseFloat(spreadSlider.value);
      ShapeSettings.setSpread(shape.type, v);
      spreadValue.textContent = v.toFixed(2);
    });

    spreadField.appendChild(spreadLabel);
    spreadField.appendChild(spreadSlider);

    body.appendChild(countField);
    body.appendChild(sizeField);
    body.appendChild(spreadField);
    container.appendChild(item);
  });
}
