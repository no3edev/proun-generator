// @ts-check

// The panel's tab strip. Pages are the `.tab-page` elements in index.html;
// the strip is built from them (id + data-tab-label), so adding a page is
// markup only. Which tab was last open is remembered in this browser (its own
// small key, not the scene config and not the lab).

export const TAB_STORAGE_KEY = 'proun.ui.v1';

/**
 * The remembered tab if it still exists, else the first.
 * @param {{ getItem(k: string): string | null } | null | undefined} storage
 * @param {string[]} ids
 * @returns {string}
 */
export function readTab(storage, ids) {
  try {
    const raw = storage && storage.getItem(TAB_STORAGE_KEY);
    if (raw) {
      const tab = JSON.parse(raw).tab;
      if (typeof tab === 'string' && ids.includes(tab)) return tab;
    }
  } catch (err) {
    // unreadable storage or bad JSON: fall through
  }
  return ids[0];
}

/**
 * @param {{ setItem(k: string, v: string): void } | null | undefined} storage
 * @param {string} tab
 */
export function writeTab(storage, tab) {
  try {
    if (storage) storage.setItem(TAB_STORAGE_KEY, JSON.stringify({ tab }));
  } catch (err) {
    // not fatal
  }
}

function safeStorage() {
  try { return window.localStorage; } catch (err) { return null; }
}

export function initTabs() {
  const nav = /** @type {HTMLElement} */ (document.getElementById('panel-tabs'));
  const pages = /** @type {HTMLElement[]} */ (Array.from(document.querySelectorAll('#panel-body > .tab-page')));
  const ids = pages.map((p) => p.id.replace(/^tab-/, ''));
  const storage = safeStorage();

  /** @type {Map<string, HTMLButtonElement>} */
  const buttons = new Map();
  pages.forEach((page, i) => {
    const id = ids[i];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'panel-tab';
    btn.id = `tabbtn-${id}`;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-controls', page.id);
    btn.textContent = page.dataset.tabLabel || id;
    btn.addEventListener('click', () => show(id));
    btn.addEventListener('keydown', (e) => {
      const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      const next = ids[(ids.indexOf(id) + dir + ids.length) % ids.length];
      show(next);
      buttons.get(next)?.focus();
    });
    nav.appendChild(btn);
    buttons.set(id, btn);
    page.setAttribute('role', 'tabpanel');
    page.setAttribute('aria-labelledby', btn.id);
  });

  /** @param {string} id */
  function show(id) {
    pages.forEach((page, i) => { page.hidden = ids[i] !== id; });
    buttons.forEach((btn, key) => {
      const on = key === id;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', String(on));
      btn.tabIndex = on ? 0 : -1;
    });
    writeTab(storage, id);
    const body = document.getElementById('panel-body');
    if (body) body.scrollTop = 0;
  }

  show(readTab(storage, ids));
}
