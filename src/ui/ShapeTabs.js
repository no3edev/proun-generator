import { shapeRegistry } from '../shapes/registry.js';
import { SceneConfig } from '../config/store.js';
import { createTabs } from './tabs.js';
import { shapeIcon, settingsIcon, lockIcon } from './shapeIcons.js';
import { Composition } from '../core/Composition.js';
import { SHAPE_LIMITS } from '../config/defaults.js';

const MIN_COUNT = SHAPE_LIMITS.count.min;
const MAX_COUNT = SHAPE_LIMITS.count.max;

/**
 * Builds one tab per registered shape into `container`: a visibility
 * checkbox plus a settings toggle. The toggle reveals (collapsed by

 * default) an instance count (with -/+ buttons), a size-multiplier
 * min/max range, and a position-spread slider (0 = origin, 2 = double
 * the original edge bounds), plus (for shapes that actually rotate) a
 * checkbox that snaps every rotation to 45-degree steps. A padlock freezes the type exactly as it is on
 * screen (Composition.lock): later advances re-roll everything else around
 * it, and its count/size/spread controls are disabled while it's locked
 * (they're baked into the frozen instances). Nothing here is shape-specific — a new
 * shape module needs no edits to this file, same as everywhere else
 * in the registry-driven parts of the app.
 *
 * Controls only write to the SceneConfig (setShape) and read their
 * initial values from it; the scene reacts to the config, not to this file.
 */

// One entry per built shape panel, so other parts of the UI can collapse
// open shape settings (accordion behaviour). Reset on every rebuild.
let settingsPanels = [];

/**
 * Collapses every open shape-settings block, except the one whose panel
 * contains `exceptEl` (so interacting inside the open shape — its Visible
 * box, gear, count/size/spread — never closes it).
 */
export function collapseShapeSettings(exceptEl = null) {
  settingsPanels.forEach((p) => {
    if (exceptEl && p.panel.contains(exceptEl)) return;
    p.setOpen(false);
  });
}

export function buildShapeTabs(container) {
  settingsPanels = [];
  const tabs = shapeRegistry.map((shape) => {
    // always read through current() — the config is replaced, never mutated
    const current = () => SceneConfig.get().shapes[shape.type];
    const setShape = (patch) => SceneConfig.update({ shapes: { [shape.type]: patch } });
    const settings = current(); // initial values only
    const panel = document.createElement('div');

    // --- visibility ---
    const visField = document.createElement('div');
    visField.className = 'field row vis-row';
    const visBox = document.createElement('input');
    visBox.type = 'checkbox';
    visBox.id = `vis-${shape.type}`;
    visBox.checked = settings.visible;
    visBox.addEventListener('change', () => setShape({ visible: visBox.checked }));
    const visLabel = document.createElement('label');
    visLabel.htmlFor = visBox.id;
    visLabel.textContent = 'Visible';
    visField.appendChild(visBox);
    visField.appendChild(visLabel);

    // --- lock: freeze this type as it is, while the others re-roll ---
    const lockBtn = document.createElement('button');
    lockBtn.type = 'button';
    lockBtn.className = 'icon-btn lock-toggle';
    lockBtn.addEventListener('click', () => {
      if (current().locked) Composition.unlock(shape.type);
      else Composition.lock(shape.type);
      syncLock();
    });
    visField.appendChild(lockBtn);

    // --- settings toggle: count / size / spread stay hidden until clicked ---
    const settingsBtn = document.createElement('button');
    settingsBtn.type = 'button';
    settingsBtn.className = 'icon-btn settings-toggle';
    settingsBtn.title = `${shape.label} settings`;
    settingsBtn.setAttribute('aria-label', `${shape.label} settings`);
    settingsBtn.setAttribute('aria-expanded', 'false');
    settingsBtn.appendChild(settingsIcon());
    visField.appendChild(settingsBtn);

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
      setShape({ count: newCount });
      countInput.value = String(current().count); // reflects clamping
      syncLock(); // a type with no instances can't be locked
    }
    minusBtn.addEventListener('click', () => pushCount(parseInt(countInput.value, 10) - 1));
    plusBtn.addEventListener('click', () => pushCount(parseInt(countInput.value, 10) + 1));
    countInput.addEventListener('change', () => {
      const v = parseInt(countInput.value, 10);
      pushCount(Number.isNaN(v) ? current().count : v);
    });

    countRow.appendChild(minusBtn);
    countRow.appendChild(countInput);
    countRow.appendChild(plusBtn);
    countField.appendChild(countLabel);
    countField.appendChild(countRow);
    // shown only while a composition strategy is active (see panel.css)
    const countHint = document.createElement('p');
    countHint.className = 'count-hint';
    countHint.textContent = 'The composition strategy sets how many appear. 0 leaves this shape out.';
    countField.appendChild(countHint);

    // --- size range (dual-handle slider) ---
    // Logarithmic mapping so the useful 0.5–2× zone isn't squeezed into
    // the left edge of a 0.05–10 track. Values snap to 0.05 like the
    // old number fields did.
    const SIZE_LO = SHAPE_LIMITS.size.min;
    const SIZE_HI = SHAPE_LIMITS.size.max;
    const SIZE_STEP = SHAPE_LIMITS.size.step;
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
      setShape({ sizeMin: min, sizeMax: max });
      // reflect any clamping back into the UI
      const s = current();
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
    spreadSlider.min = String(SHAPE_LIMITS.spread.min);
    spreadSlider.max = String(SHAPE_LIMITS.spread.max);
    spreadSlider.step = String(SHAPE_LIMITS.spread.step);
    spreadSlider.value = String(settings.spread);
    spreadSlider.addEventListener('input', () => {
      const v = parseFloat(spreadSlider.value);
      setShape({ spread: v });
      spreadValue.textContent = v.toFixed(2);
    });

    spreadField.appendChild(spreadLabel);
    spreadField.appendChild(spreadSlider);

    // --- snap rotation to 45 degree steps (not for shapes that always face
    // the camera: they have no rotation, so the option would do nothing) ---
    /** @type {HTMLInputElement | null} */
    let snapBox = null;
    /** @type {HTMLElement | null} */
    let snapField = null;
    if (!shape.facesCamera) {
      snapField = document.createElement('div');
      snapField.className = 'field row snap-row';
      snapBox = document.createElement('input');
      snapBox.type = 'checkbox';
      snapBox.id = `snap-${shape.type}`;
      snapBox.checked = !!settings.snapRotation;
      snapBox.addEventListener('change', () => setShape({ snapRotation: snapBox.checked }));
      const snapLabel = document.createElement('label');
      snapLabel.htmlFor = snapBox.id;
      snapLabel.textContent = 'Snap rotation to 45°';
      snapLabel.title = 'Every rotation angle becomes a multiple of 45° (applies at the next advance)';
      snapField.appendChild(snapBox);
      snapField.appendChild(snapLabel);
    }

    const props = document.createElement('div');
    props.className = 'shape-props';
    props.hidden = true; // collapsed by default
    props.appendChild(countField);
    props.appendChild(sizeField);
    props.appendChild(spreadField);
    if (snapField) props.appendChild(snapField);

    function setOpen(open) {
      props.hidden = !open;
      settingsBtn.classList.toggle('active', open);
      settingsBtn.setAttribute('aria-expanded', String(open));
    }
    settingsBtn.addEventListener('click', () => setOpen(props.hidden));
    settingsPanels.push({ panel, setOpen });

    // Repaints everything that depends on the lock: the padlock itself, and
    // the controls that are baked into a locked type's frozen instances.
    // Called after anything that can change it; the config enforces it too
    // (a locked type's count is its instances' length), so this is feedback,
    // not the safeguard.
    function syncLock() {
      const locked = !!current().locked;
      const label = locked ? `Unlock ${shape.label}` : `Lock ${shape.label}`;
      lockBtn.classList.toggle('active', locked);
      lockBtn.setAttribute('aria-pressed', String(locked));
      lockBtn.setAttribute('aria-label', label);
      lockBtn.title = locked
        ? `${label} — it will be generated from the seed again at the next advance`
        : `${label} — keep these exactly as they are while the others re-roll`;
      lockBtn.disabled = !locked && current().count < 1;
      lockBtn.replaceChildren(lockIcon(locked));
      props.classList.toggle('locked', locked);
      props.inert = locked; // also blocks keyboard focus, incl. the dual-range handles
      [minusBtn, plusBtn, countInput, spreadSlider, snapBox].forEach((el) => { if (el) el.disabled = locked; });
      if (locked) countInput.value = String(current().count);
    }

    panel.appendChild(visField);
    panel.appendChild(props);
    syncLock();

    return { label: shape.label, panel, icon: shapeIcon(shape.type) };
  });

  const { container: tabsEl } = createTabs(tabs);
  container.appendChild(tabsEl);
}
