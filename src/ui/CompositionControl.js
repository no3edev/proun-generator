import { SceneConfig } from '../config/store.js';
import { STRATEGY_NAMES, STRATEGY_LABELS } from '../generator/strategies/index.js';

// The composition-strategy selector, in the Scene tab beside Orientation and
// Palette. It is part of the scene (saved in presets, links and history): the
// same seed is a different picture under a different strategy.

const HINTS = {
  legacy: 'Every shape is placed on its own, as before.',
  default: 'The strategy composes the whole scene and decides how many of each shape appear. '
    + 'Set a shape\u2019s count to 0 on the Shapes tab to leave it out.'
};

export function initCompositionControl() {
  const select = document.getElementById('composition-strategy');
  const hint = document.getElementById('composition-hint');
  if (!select) return;

  STRATEGY_NAMES.forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = STRATEGY_LABELS[name] || name;
    select.appendChild(opt);
  });

  select.addEventListener('change', () => {
    SceneConfig.update({ composition: { strategy: select.value } });
  });

  function sync() {
    const strategy = SceneConfig.get().composition.strategy;
    select.value = strategy;
    if (hint) hint.textContent = HINTS[strategy] || HINTS.default;
    // lets the shape tabs say that counts are the strategy's (see panel.css)
    document.body.dataset.strategy = strategy;
  }
  sync();
  SceneConfig.subscribe(sync);
}
