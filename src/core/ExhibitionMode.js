// @ts-check

// Exhibition mode: the interface hidden, the picture filling the screen, the cursor gone when idle, the screen kept awake. It only
// changes how the page LOOKS: playback (the animation clock, Auto, the transitions) is not touched, so hiding the panel cannot
// disturb a running show. A class on <body> does the visual part (panel.css); this module does what CSS cannot: the Fullscreen API,
// the wake lock, the idle cursor. The browser, the document and the timer are injected so the tests drive it with doubles.

const CLASS = 'exhibition';
const IDLE_CLASS = 'exhibition-idle';

/** Whether the page is in exhibition mode right now (read from the document, so every module agrees). */
export function isExhibitionActive(doc = document) {
  return !!(doc.body && doc.body.classList.contains(CLASS));
}

/**
 * @param {{ doc?: Document, win?: Window, onChange?: (active: boolean) => void, idleMs?: number }} [options]
 *   onChange: called after the mode changed, so the stage can be fitted again
 */
export function createExhibitionMode({ doc = document, win = window, onChange = () => {}, idleMs = 2000 } = {}) {
  let active = false;
  let enteredFullscreen = false;
  /** @type {number | null} */
  let idleTimer = null;
  /** @type {any} */
  let wakeLock = null;

  function clearIdle() {
    if (idleTimer !== null) { win.clearTimeout(idleTimer); idleTimer = null; }
  }
  function startIdle() {
    clearIdle();
    doc.body.classList.remove(IDLE_CLASS);
    if (!active) return;
    idleTimer = win.setTimeout(() => { if (active) doc.body.classList.add(IDLE_CLASS); }, idleMs);
  }
  function wake() {
    const nav = /** @type {any} */ (win.navigator);
    if (!active || !nav || !nav.wakeLock || wakeLock) return;
    try {
      Promise.resolve(nav.wakeLock.request('screen')).then((sentinel) => {
        if (!active) { sentinel.release && sentinel.release(); return; }
        wakeLock = sentinel;
        // the browser releases it by itself (a hidden tab, low battery): forget it so the next wake() asks again
        sentinel.addEventListener && sentinel.addEventListener('release', () => { if (wakeLock === sentinel) wakeLock = null; });
      }).catch(() => { /* a refused lock is not an error: the display just may dim */ });
    } catch { /* no wake lock here */ }
  }
  function sleep() {
    const lock = wakeLock;
    wakeLock = null;
    if (lock && lock.release) { try { Promise.resolve(lock.release()).catch(() => {}); } catch { /* already released */ } }
  }

  function onMove() { if (active) startIdle(); }
  function onVisibility() { if (active && doc.visibilityState === 'visible') wake(); }
  function onFullscreenChange() {
    // leaving real fullscreen (Esc) leaves the mode too: the interface comes back
    if (active && enteredFullscreen && !doc.fullscreenElement) exit();
  }
  doc.addEventListener('mousemove', onMove);
  doc.addEventListener('pointerdown', onMove);
  doc.addEventListener('visibilitychange', onVisibility);
  doc.addEventListener('fullscreenchange', onFullscreenChange);

  /** @param {{ fullscreen?: boolean }} [opts] fullscreen: ask the browser for it (only works from a gesture: a click or a key) */
  function enter({ fullscreen = true } = {}) {
    if (active) return;
    active = true;
    doc.body.classList.add(CLASS);
    if (fullscreen && doc.documentElement.requestFullscreen && !doc.fullscreenElement) {
      try {
        enteredFullscreen = true;
        Promise.resolve(doc.documentElement.requestFullscreen()).catch(() => { enteredFullscreen = false; });
      } catch { enteredFullscreen = false; }
    }
    wake();
    startIdle();
    onChange(true);
  }

  function exit() {
    if (!active) return;
    active = false;
    clearIdle();
    doc.body.classList.remove(CLASS, IDLE_CLASS);
    sleep();
    if (enteredFullscreen && doc.fullscreenElement && doc.exitFullscreen) {
      try { Promise.resolve(doc.exitFullscreen()).catch(() => {}); } catch { /* already out */ }
    }
    enteredFullscreen = false;
    onChange(false);
  }

  return {
    isActive: () => active,
    enter,
    exit,
    toggle() { if (active) exit(); else enter(); },
    dispose() {
      exit();
      doc.removeEventListener('mousemove', onMove);
      doc.removeEventListener('pointerdown', onMove);
      doc.removeEventListener('visibilitychange', onVisibility);
      doc.removeEventListener('fullscreenchange', onFullscreenChange);
    }
  };
}
