import { SceneManager } from './core/SceneManager.js';
import { Composition } from './core/Composition.js';
import { initAutoAdvance } from './core/AutoAdvance.js';
import { initPanel } from './ui/Panel.js';
import { initLab } from './lab/Lab.js';
import { initLabPanel } from './ui/LabPanel.js';
import { initCompositionLab } from './ui/CompositionLab.js';
import { initTabs } from './ui/PanelTabs.js';
import { SceneConfig, SceneHistory } from './config/store.js';
import { restoreConfig } from './config/boot.js';
import { saveSession, startSessionAutosave } from './config/session.js';

// Space advances the composition, ← / → step back and forward through the
// ones already seen — but not while the user is operating a
// control. Without this guard, Space was swallowed everywhere: typing a
// space in the preset name field was blocked, and checkboxes, buttons
// and the slider thumbs couldn't be used from the keyboard.
const INTERACTIVE = 'input, select, textarea, button, [role="slider"], [contenteditable="true"]';

export function initInteraction() {
  document.getElementById('scene').addEventListener('click', () => Composition.advance());
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return;
    if (e.code === 'Space') {
      e.preventDefault();
      Composition.advance();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      SceneHistory.back();
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      SceneHistory.forward();
    }
  });
}

// Even *reading* window.localStorage can throw (some privacy modes).
function safeStorage() {
  try {
    return window.localStorage;
  } catch (err) {
    return null;
  }
}

// What we start with: a share link in the URL, else the autosaved session,
// else defaults (config/boot.js). Runs before anything subscribes to the
// config, so the first layout already reflects it.
export function bootConfig() {
  const storage = safeStorage();
  const { source, hadLink } = restoreConfig(SceneConfig, { storage, hash: window.location.hash });

  if (hadLink) {
    // the link is consumed once: drop it from the address bar so a reload
    // doesn't re-apply it over later changes (and keep what it gave us)
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    if (source === 'link') saveSession(storage, SceneConfig.get());
  }

  // history starts from whatever we just settled on, not the throwaway default
  SceneHistory.start();

  const autosave = startSessionAutosave(SceneConfig, { storage });
  window.addEventListener('pagehide', autosave.flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') autosave.flush();
  });
}

window.addEventListener('load', () => {
  bootConfig();
  SceneManager.init();
  initPanel();
  initCompositionLab();
  initLab();
  // dev: the renderer, for resource checks from the console
  if (window.__proun) window.__proun.getRenderer = () => SceneManager.getRenderer();
  initLabPanel();
  initTabs();
  initAutoAdvance();
  initInteraction();
  SceneManager.loop();
});
