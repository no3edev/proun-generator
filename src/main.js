import { SceneManager } from './core/SceneManager.js';
import { Composition } from './core/Composition.js';
import { initPanel } from './ui/Panel.js';

function initInteraction() {
  document.getElementById('scene').addEventListener('click', () => Composition.advance());
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      Composition.advance();
    }
  });
}

window.addEventListener('load', () => {
  SceneManager.init();
  initPanel();
  initInteraction();
  SceneManager.loop();
});
