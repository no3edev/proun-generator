import { createAccordionItem } from './accordion.js';
import { copyText } from './clipboard.js';
import { Lab } from '../lab/Lab.js';
import { SceneManager } from '../core/SceneManager.js';
import { LAB_SCHEMA, LAB_GROUP_TABS, defaultsSnippet } from '../lab/labSettings.js';

// The material lab's groups, generated from LAB_SCHEMA (lab/labSettings.js)
// and mounted into the panel's Motion and Surface tabs (the `.lab-mount`
// elements in index.html). Every group starts collapsed and is marked "lab":
// session-local, not saved in presets or links — see labSettings.js.

function decimals(step) {
  const s = String(step);
  return s.includes('.') ? s.split('.')[1].length : 0;
}

export function initLabPanel() {
  /** @type {Map<string, HTMLElement>} */
  const mounts = new Map();
  /** @type {HTMLElement[]} */
  const fpsLines = [];
  document.querySelectorAll('.lab-mount').forEach((el) => {
    const tab = /** @type {HTMLElement} */ (el).dataset.labTab || 'surface';
    mounts.set(tab, /** @type {HTMLElement} */ (el));
    const note = document.createElement('p');
    note.className = 'lab-note';
    note.textContent = 'Lab — session-local tuning. Not saved in presets or links.';
    el.appendChild(note);
    // a frame-rate readout, so a heavy setting can be judged on the machine it runs on
    const fps = document.createElement('p');
    fps.className = 'lab-fps';
    el.appendChild(fps);
    fpsLines.push(fps);
  });
  setInterval(() => {
    const ms = SceneManager.getFrameMs();
    const text = `Frame ${ms.toFixed(1)} ms · ${Math.round(1000 / ms)} fps`;
    fpsLines.forEach((el) => { el.textContent = text; });
  }, 500);

  /** @type {Array<(values: Record<string, number | boolean>) => void>} */
  const repaint = [];
  /** @type {Map<string, HTMLElement>} */
  const groups = new Map();

  LAB_SCHEMA.forEach((item) => {
    if (!groups.has(item.group)) {
      const mount = mounts.get(LAB_GROUP_TABS[item.group] || 'surface');
      if (!mount) return;
      const acc = createAccordionItem(item.group, { startOpen: false });
      acc.item.classList.add('lab-group');
      const section = document.createElement('section');
      section.className = 'group';
      section.appendChild(acc.item);
      mount.appendChild(section);
      groups.set(item.group, acc.body);
    }
    const body = groups.get(item.group);
    if (!body) return;
    const field = document.createElement('div');
    const id = `lab-${item.key}`;

    if (item.type === 'toggle') {
      field.className = 'field row';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.id = id;
      const label = document.createElement('label');
      label.htmlFor = id;
      label.textContent = item.label;
      box.addEventListener('change', () => Lab.set(item.key, box.checked));
      field.append(box, label);
      repaint.push((v) => { box.checked = !!v[item.key]; });
    } else {
      field.className = 'field';
      const label = document.createElement('label');
      label.htmlFor = id;
      const name = document.createElement('span');
      name.textContent = item.label;
      const out = document.createElement('i');
      label.append(name, out);
      const input = document.createElement('input');
      input.type = 'range';
      input.id = id;
      input.min = String(item.min);
      input.max = String(item.max);
      input.step = String(item.step);
      input.addEventListener('input', () => Lab.set(item.key, Number(input.value)));
      field.append(label, input);
      const d = decimals(item.step);
      repaint.push((v) => {
        input.value = String(v[item.key]);
        out.textContent = `${Number(v[item.key]).toFixed(d)}${item.unit ? ' ' + item.unit : ''}`;
        // "Step" only means something while the transition is paused
        if (item.key === 'hold') field.style.opacity = v.holdOn ? '1' : '0.4';
      });
    }
    body.appendChild(field);
    if (item.hint) {
      const hint = document.createElement('p');
      hint.className = 'lab-hint';
      hint.textContent = item.hint;
      body.appendChild(hint);
    }
  });

  // Copy defaults / Reset lab, once at the bottom of each tab that has lab groups
  mounts.forEach((mount) => {
    if (!mount.querySelector('.lab-group')) return;
    const actions = document.createElement('div');
    actions.className = 'lab-actions';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'secondary';
    copyBtn.textContent = 'Copy defaults';
    copyBtn.title = 'Copy the changed values as a DYNAMICS fragment';
    copyBtn.addEventListener('click', async () => {
      const ok = await copyText(defaultsSnippet(Lab.values()));
      copyBtn.textContent = ok ? 'Copied' : 'Copy failed';
      setTimeout(() => { copyBtn.textContent = 'Copy defaults'; }, 1400);
    });
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'secondary';
    resetBtn.textContent = 'Reset lab';
    resetBtn.title = 'Back to the defaults (every lab group, both tabs)';
    resetBtn.addEventListener('click', () => Lab.reset());
    actions.append(copyBtn, resetBtn);
    mount.appendChild(actions);
  });

  function paint(values) { repaint.forEach((fn) => fn(values)); }
  paint(Lab.values());
  Lab.subscribe(paint);
}
