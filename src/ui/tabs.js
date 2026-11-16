/**
 * Builds a tab bar + panel switcher. This module only owns which
 * panel is visible and the active-tab styling — the caller supplies
 * fully-built panel elements, same split as accordion.js's
 * createAccordionItem (there: caller owns section content; here:
 * caller owns each tab's panel content).
 *
 * @param {{label: string, panel: HTMLElement, icon?: HTMLElement}[]} tabs
 * @param {{startIndex?: number}} [opts]
 * @returns {{ container: HTMLElement, select(index: number): void, setHidden(index: number, hidden: boolean): void }}
 */
export function createTabs(tabs, opts = {}) {
  const container = document.createElement('div');
  container.className = 'tabs';

  const nav = document.createElement('div');
  nav.className = 'tabs-nav';
  nav.setAttribute('role', 'tablist');

  const panelsWrap = document.createElement('div');
  panelsWrap.className = 'tabs-panels';

  const buttons = tabs.map((t, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab-btn';
    if (t.icon) {
      btn.classList.add('has-icon');
      btn.appendChild(t.icon);
      btn.title = t.label;
      btn.setAttribute('aria-label', t.label);
    } else {
      btn.textContent = t.label;
    }
    btn.setAttribute('role', 'tab');
    btn.addEventListener('click', () => select(i));
    nav.appendChild(btn);

    t.panel.classList.add('tab-panel');
    t.panel.setAttribute('role', 'tabpanel');
    panelsWrap.appendChild(t.panel);

    return btn;
  });

  function select(index) {
    active = index;
    buttons.forEach((b, i) => {
      b.classList.toggle('active', i === index);
      b.setAttribute('aria-selected', String(i === index));
    });
    tabs.forEach((t, i) => { t.panel.hidden = i !== index; });
  }

  let active = opts.startIndex ?? 0;
  select(active);

  /**
   * Hides or shows a tab's button. A hidden tab keeps its panel (and the state in it); if the active tab is hidden,
   * the first tab still shown becomes active instead.
   */
  function setHidden(index, hidden) {
    buttons[index].hidden = hidden;
    if (hidden && index === active) {
      const first = buttons.findIndex((b) => !b.hidden);
      if (first >= 0) select(first);
    }
  }

  container.appendChild(nav);
  container.appendChild(panelsWrap);
  return { container, select, setHidden };
}
