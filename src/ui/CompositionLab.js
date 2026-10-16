import { createAccordionItem } from './accordion.js';
import { SceneConfig } from '../config/store.js';
import { STRATEGY_NAMES, STRATEGY_LABELS } from '../generator/strategies/index.js';

// The composition-strategy selector, on the Shapes tab. Experimental: it
// lives here (not in the main Scene controls) until the strategies settle
// (roadmap step 2.4). Unlike the lab groups it IS part of the scene: saved in
// presets, links and history, because the same seed is a different picture
// under a different strategy.

export function initCompositionLab() {
  const container = document.getElementById('composition-lab');
  if (!container) return;

  const { item, body } = createAccordionItem('Composition · experimental', { startOpen: false });

  const field = document.createElement('div');
  field.className = 'field';
  const label = document.createElement('label');
  label.textContent = 'Strategy';
  label.htmlFor = 'composition-strategy';
  const select = document.createElement('select');
  select.id = 'composition-strategy';
  STRATEGY_NAMES.forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = STRATEGY_LABELS[name] || name;
    select.appendChild(opt);
  });
  field.appendChild(label);
  field.appendChild(select);
  body.appendChild(field);

  const hint = document.createElement('p');
  hint.className = 'lab-hint';
  hint.textContent = 'A strategy composes the whole scene around a structure and decides how many of each shape appear. '
    + 'Set a shape\u2019s count to 0 to leave it out. Legacy places every shape independently, as before.';
  body.appendChild(hint);

  select.addEventListener('change', () => {
    SceneConfig.update({ composition: { strategy: select.value } });
  });

  function sync() {
    const strategy = SceneConfig.get().composition.strategy;
    select.value = strategy;
    // lets the shape tabs say that counts are the strategy's (see panel.css)
    document.body.dataset.strategy = strategy;
  }
  sync();
  SceneConfig.subscribe(sync);

  container.appendChild(item);
}
