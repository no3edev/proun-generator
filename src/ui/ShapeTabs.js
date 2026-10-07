import { shapeRegistry } from '../shapes/registry.js';
import { ShapeSettings, MIN_COUNT, MAX_COUNT } from '../settings/ShapeSettings.js';
import { Composition } from '../core/Composition.js';
import { createTabs } from './tabs.js';
import { shapeIcon } from './shapeIcons.js';

/**
 * Builds one tab per registered shape into `container`: a visibility
 * checkbox, an instance count (with -/+ buttons), a size-multiplier
 * min/max range, and a position-spread slider (0 = origin, 2 = double
 * the original edge bounds). Nothing here is shape-specific — a new
 * shape module needs no edits to this file, same as everywhere else
 * in the registry-driven parts of the app.
 */
export function buildShapeTabs(container) {
  const tabs = shapeRegistry.map((shape) => {
    const settings = ShapeSettings.get(shape.type);
    const panel = document.createElement('div');

    // --- visibility ---
    const visField = document.createElement('div');
    visField.className = 'field row';
    const visBox = document.createElement('input');
    visBox.type = 'checkbox';
    visBox.id = `vis-${shape.type}`;
    visBox.checked = settings.visible;
    visBox.addEventListener('change', () => {
      ShapeSettings.setVisible(shape.type, visBox.checked);
      Composition.setVisible(shape.type, visBox.checked);
    });
    const visLabel = document.createElement('label');
    visLabel.htmlFor = visBox.id;
    visLabel.textContent = 'Visible';
    visField.appendChild(visBox);
    visField.appendChild(visLabel);

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

    // --- size range (dual-handle slider) ---
    // Logarithmic mapping so the useful 0.5–2× zone isn't squeezed into
    // the left edge of a 0.05–10 track. Values snap to 0.05 like the
    // old number fields did.
    const SIZE_LO = 0.05;
    const SIZE_HI = 10;
    const SIZE_STEP = 0.05;
    const LOG_SPAN = Math.log(SIZE_HI / SIZE_LO);
    const toT = (v) => Math.log(Math.max(SIZE_LO, v) / SIZE_LO) / LOG_SPAN;
    const fromT = (t) => {
      const raw = SIZE_LO * Math.exp(Math.max(0, Math.min(1, t)) * LOG_SPAN);
      const snapped = Math.round(raw / SIZE_STEP) * SIZE_STEP;
      return Math.max(SIZE_LO, Math.min(SIZE_HI, +snapped.toFixed(2)));
    };

    const sizeField = document.createElement('div');
    sizeField.className = 'field';
    const sizeLabel = document.createElement('label');
    sizeLabel.textContent = 'Size ×';
    const sizeValue = document.createElement('span');
    sizeValue.className = 'spread-value';
    sizeLabel.appendChild(sizeValue);

    const dual = document.createElement('div');
    dual.className = 'dual-range';
    const fill = document.createElement('div');
    fill.className = 'dual-fill';
    const makeThumb = (name) => {
      const t = document.createElement('div');
      t.className = 'dual-thumb';
      t.tabIndex = 0;
      t.setAttribute('role', 'slider');
      t.setAttribute('aria-label', name);
      t.setAttribute('aria-valuemin', String(SIZE_LO));
      t.setAttribute('aria-valuemax', String(SIZE_HI));
      return t;
    };
    const thumbMin = makeThumb('Size minimum');
    const thumbMax = makeThumb('Size maximum');
    dual.appendChild(fill);
    dual.appendChild(thumbMin);
    dual.appendChild(thumbMax);

    let curMin = settings.sizeMin;
    let curMax = settings.sizeMax;

    function paintSize() {
      const a = toT(curMin) * 100;
      const b = toT(curMax) * 100;
      thumbMin.style.left = `${a}%`;
      thumbMax.style.left = `${b}%`;
      fill.style.left = `${a}%`;
      fill.style.width = `${Math.max(0, b - a)}%`;
      thumbMin.setAttribute('aria-valuenow', curMin.toFixed(2));
      thumbMax.setAttribute('aria-valuenow', curMax.toFixed(2));
      sizeValue.textContent = `${curMin.toFixed(2)} – ${curMax.toFixed(2)}`;
    }

    function pushSizeRange(min, max) {
      ShapeSettings.setSizeRange(shape.type, min, max);
      // reflect any clamping back into the UI
      const s = ShapeSettings.get(shape.type);
      curMin = s.sizeMin;
      curMax = s.sizeMax;
      paintSize();
    }

    function setThumb(which, v) {
      if (which === 'min') pushSizeRange(Math.min(v, curMax), curMax);
      else pushSizeRange(curMin, Math.max(v, curMin));
    }

    function tFromEvent(e) {
      const r = dual.getBoundingClientRect();
      return (e.clientX - r.left) / r.width;
    }

    let drag = null; // { which: 'min'|'max'|null, offset, startT }
    dual.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const t = tFromEvent(e);
      const onThumb = e.target === thumbMin || e.target === thumbMax;
      const ta = toT(curMin);
      const tb = toT(curMax);
      let which = null;
      if (e.target === thumbMin && curMin !== curMax) which = 'min';
      else if (e.target === thumbMax && curMin !== curMax) which = 'max';
      else if (curMin !== curMax) which = Math.abs(t - ta) <= Math.abs(t - tb) ? 'min' : 'max';
      // equal thumbs: decide from the first drag direction
      const offset = onThumb && which ? (which === 'min' ? ta : tb) - t : 0;
      drag = { which, offset, startT: t };
      dual.setPointerCapture(e.pointerId);
      if (which && !onThumb) setThumb(which, fromT(t));
      (which === 'max' ? thumbMax : thumbMin).focus({ preventScroll: true });
    });
    dual.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const t = tFromEvent(e);
      if (!drag.which) {
        if (Math.abs(t - drag.startT) < 0.004) return;
        drag.which = t > drag.startT ? 'max' : 'min';
      }
      setThumb(drag.which, fromT(t + drag.offset));
    });
    const endDrag = () => { drag = null; };
    dual.addEventListener('pointerup', endDrag);
    dual.addEventListener('pointercancel', endDrag);

    [['min', thumbMin], ['max', thumbMax]].forEach(([which, el]) => {
      el.addEventListener('keydown', (e) => {
        const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1
          : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        const step = e.shiftKey ? 0.5 : SIZE_STEP;
        const cur = which === 'min' ? curMin : curMax;
        setThumb(which, +(Math.max(SIZE_LO, Math.min(SIZE_HI, cur + dir * step))).toFixed(2));
      });
    });

    paintSize();
    sizeField.appendChild(sizeLabel);
    sizeField.appendChild(dual);

    // --- position spread ---
    const spreadField = document.createElement('div');
    spreadField.className = 'field';
    const spreadLabel = document.createElement('label');
    spreadLabel.textContent = 'Spread';
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

    panel.appendChild(visField);
    panel.appendChild(countField);
    panel.appendChild(sizeField);
    panel.appendChild(spreadField);

    return { label: shape.label, panel, icon: shapeIcon(shape.type) };
  });

  const { container: tabsEl } = createTabs(tabs);
  container.appendChild(tabsEl);
}
