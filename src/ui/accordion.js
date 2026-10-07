/**
 * Wires click-to-toggle behavior onto an existing header/body/chevron
 * triplet. Used both for accordion items built dynamically (see
 * createAccordionItem below) and for the static "Time" section
 * markup in index.html.
 */
export function wireAccordionToggle(header, body, chevron) {
  header.addEventListener('click', () => {
    body.hidden = !body.hidden;
    chevron.textContent = body.hidden ? '+' : '−';
  });
}

/**
 * Builds one collapsible `.accordion-item` (header + body), already
 * wired to toggle on click. `leadingEl`, if given, is placed before
 * the title in the header (e.g. a shape's visibility checkbox) and
 * has click-propagation stopped so clicking it doesn't also toggle
 * the section.
 *
 * @param {string} titleText
 * @param {{leadingEl?: HTMLElement, startOpen?: boolean}} [opts]
 * @returns {{item: HTMLElement, header: HTMLElement, body: HTMLElement, chevron: HTMLElement}}
 */
export function createAccordionItem(titleText, opts = {}) {
  const { leadingEl = null, startOpen = false } = opts;

  const item = document.createElement('div');
  item.className = 'accordion-item';

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'accordion-header';

  if (leadingEl) {
    leadingEl.addEventListener('click', (e) => e.stopPropagation());
    header.appendChild(leadingEl);
  }

  const title = document.createElement('span');
  title.className = 'accordion-title';
  title.textContent = titleText;
  header.appendChild(title);

  const chevron = document.createElement('span');
  chevron.className = 'accordion-chevron';
  chevron.textContent = startOpen ? '−' : '+';
  header.appendChild(chevron);

  const body = document.createElement('div');
  body.className = 'accordion-panel';
  body.hidden = !startOpen;

  wireAccordionToggle(header, body, chevron);

  item.appendChild(header);
  item.appendChild(body);

  return { item, header, body, chevron };
}
