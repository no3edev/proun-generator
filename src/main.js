import { SceneManager } from './core/SceneManager.js';
import { Composition } from './core/Composition.js';
import { initAutoAdvance } from './core/AutoAdvance.js';
import { createExhibitionMode, isExhibitionActive } from './core/ExhibitionMode.js';
import { parseExhibitionParams } from './core/exhibitionParams.js';
import { createWatchdog, parseReloadHours, WATCHDOG } from './core/watchdog.js';
import { Tween } from './core/Tween.js';
import { Rhythm } from './core/Rhythm.js';
import { TIMING_PRESETS } from './config/defaults.js';
import { initPanel } from './ui/Panel.js';
import { initLab } from './lab/Lab.js';
import { initLabPanel } from './ui/LabPanel.js';
import { initCompositionControl } from './ui/CompositionControl.js';
import { initDiagnosticsPanel } from './ui/DiagnosticsPanel.js';
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

export function initInteraction(exhibition) {
  // on a public display a stray click or touch must not change the picture; Space and the arrows (a keyboard is a maintainer's) do
  document.getElementById('scene').addEventListener('click', () => { if (!isExhibitionActive()) Composition.advance(); });
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return;
    if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      exhibition.toggle();
    } else if (e.code === 'Escape' && exhibition.isActive()) {
      e.preventDefault();
      exhibition.exit();
    } else if (e.code === 'Space') {
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

/** The session autosave (config/session.js), kept so the watchdog can save at once before it reloads the page. */
let sessionAutosave = null;

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
  sessionAutosave = autosave;
  window.addEventListener('pagehide', autosave.flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') autosave.flush();
  });
}

window.addEventListener('load', () => {
  // a page the watchdog reloaded starts black and fades in (it faded out before reloading)
  let fadeIn = false;
  try { fadeIn = window.sessionStorage.getItem('proun-fade-in') === '1'; window.sessionStorage.removeItem('proun-fade-in'); } catch { /* no session storage */ }
  if (fadeIn) document.body.classList.add('reload-start');
  bootConfig();
  SceneManager.init();
  initPanel();
  initCompositionControl();
  initDiagnosticsPanel();
  initLab();
  // dev: the renderer, for resource checks from the console
  if (window.__proun) { window.__proun.getRenderer = () => SceneManager.getRenderer(); window.__proun.contextStats = () => SceneManager.contextStats(); }
  initLabPanel();
  initTabs();
  initAutoAdvance();
  // exhibition mode: the interface hidden, the picture filling the window (core/ExhibitionMode.js); the stage is fitted again
  // whenever it changes
  const exhibition = createExhibitionMode({ onChange: () => SceneManager.refit() });
  document.getElementById('exhibition-btn').addEventListener('click', () => exhibition.enter());
  initInteraction(exhibition);
  // ?exhibition starts a kiosk straight in the mode (no gesture, so no real fullscreen: the kiosk browser brings its own);
  // ?exhibition&auto also runs Exhibition timing with Auto on
  const flags = parseExhibitionParams(window.location.search);
  if (flags.auto) {
    const t = TIMING_PRESETS.exhibition;
    SceneConfig.update({ time: { durationMs: t.durationMs, holdMs: t.holdMs, autoAdvance: true } });
  }
  if (flags.playlist) SceneConfig.update({ time: { playlist: true } });
  if (flags.active) exhibition.enter({ fullscreen: false });
  window.__proun && (window.__proun.exhibition = exhibition);
  // unattended recovery (core/watchdog.js): a storm of uncaught errors, and the optional ?reload=<hours> refresh, reload the page
  // (the session is saved first) when it is in exhibition mode
  const watchdog = createWatchdog({
    win: window,
    storage: safeStorage(),
    isEnabled: () => isExhibitionActive(),
    isIdle: () => Tween.activeMeshes().length === 0 && !Rhythm.active && Rhythm.hold === null,   // nothing is moving
    flushSession: () => { if (sessionAutosave) sessionAutosave.flush(); },
    reload: () => {
      document.body.classList.add('reloading');                      // fade out, then reload, then fade in
      try { window.sessionStorage.setItem('proun-fade-in', '1'); } catch { /* no session storage: it just comes back without the fade */ }
      window.setTimeout(() => window.location.reload(), WATCHDOG.fadeMs);
    },
    scheduledHours: parseReloadHours(window.location.search)
  });
  window.__proun && (window.__proun.watchdog = watchdog);
  SceneManager.loop();
  if (fadeIn) window.setTimeout(() => document.body.classList.remove('reload-start'), 600);
});
