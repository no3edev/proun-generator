/**
 * Minimal geometric glyphs for the shape tabs, keyed by shape `type`.
 * Purely presentational: 24x24 viewBox, currentColor strokes/fills,
 * so the active/hover colour is controlled from CSS.
 */
const S = 'fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="miter"';
const ICONS = {
  // fixed cube: isometric solid
  'cube-fixed': `<svg viewBox="0 0 24 24" ${S}><path d="M12 3 20 7.5v9L12 21 4 16.5v-9Z"/><path d="M12 12v9M12 12 4 7.5M12 12l8-4.5" /><path d="M12 12 4 7.5 12 3l8 4.5Z" fill="currentColor" stroke="none" opacity=".35"/></svg>`,
  // variable cube: open wireframe box, unequal proportions
  'cube-variable': `<svg viewBox="0 0 24 24" ${S}><rect x="3.5" y="9" width="12" height="11.5"/><path d="M3.5 9 8 4.5h12.5V16l-5 4.5M15.5 9 20.5 4.5"/></svg>`,
  circle: `<svg viewBox="0 0 24 24" ${S}><circle cx="12" cy="12" r="8"/></svg>`,
  sphere: `<svg viewBox="0 0 24 24" ${S}><circle cx="12" cy="12" r="8"/><ellipse cx="12" cy="12" rx="8" ry="3" /><path d="M12 4v16"/></svg>`,
  triangle: `<svg viewBox="0 0 24 24" ${S}><path d="M5 19V5l14 14Z"/></svg>`,
  // beam: a long rectangular bar seen obliquely: front, top and end faces
  beam: `<svg viewBox="0 0 24 24" ${S}><path d="M2.5 11.5h15.5v5H2.5Z"/><path d="M2.5 11.5l3-3h15.5l-3 3M21 8.5v5l-3 3"/></svg>`,
  // segment: an arc over its chord
  segment: `<svg viewBox="0 0 24 24" ${S}><path d="M3 17.5h18C21 11 17 6.5 12 6.5S3 11 3 17.5Z" fill="currentColor" fill-opacity=".18"/></svg>`,
  // crescent: a disc with a bite taken out, horns to the right
  crescent: `<svg viewBox="0 0 24 24" ${S}><path d="M15.5 4.6A8.2 8.2 0 1 0 15.5 19.4 6.6 6.6 0 0 1 15.5 4.6Z" fill="currentColor" fill-opacity=".18"/></svg>`,
  // frame: an open rectangle
  frame: `<svg viewBox="0 0 24 24" ${S}><rect x="3" y="7" width="18" height="10"/><rect x="5.2" y="9.2" width="13.6" height="5.6" opacity=".45"/></svg>`,
  // ring: a partial ring, opening toward the upper right
  ring: `<svg viewBox="0 0 24 24" ${S}><path d="M20 12a8 8 0 1 1-8-8"/></svg>`,
  rod: `<svg viewBox="0 0 24 24" ${S}><path d="M4.5 19.5 19.5 4.5" stroke-width="2.6" stroke-linecap="square"/></svg>`,
  plane: `<svg viewBox="0 0 24 24" ${S}><path d="M3 15.5 8.5 7H21l-5.5 8.5Z" fill="currentColor" fill-opacity=".18"/></svg>`
};

export function shapeIcon(type) {
  const wrap = document.createElement('span');
  wrap.className = 'shape-icon';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = ICONS[type] || ICONS.circle;
  return wrap;
}

/** Small gear glyph for the per-shape settings toggle. */
export function settingsIcon() {
  const wrap = document.createElement('span');
  wrap.className = 'shape-icon settings-icon';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = `<svg viewBox="0 0 24 24" ${S}><circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>`;
  return wrap;
}

/**
 * Padlock glyph for the per-shape lock toggle: shackle closed when locked,
 * lifted when not.
 * @param {boolean} locked
 */
export function lockIcon(locked) {
  const wrap = document.createElement('span');
  wrap.className = 'shape-icon lock-icon';
  wrap.setAttribute('aria-hidden', 'true');
  const shackle = locked ? 'M8 10.5V8a4 4 0 0 1 8 0v2.5' : 'M8 10.5V8a4 4 0 0 1 7.6-1.8';
  wrap.innerHTML = `<svg viewBox="0 0 24 24" ${S}><rect x="5.5" y="10.5" width="13" height="9.5"${locked ? ' fill="currentColor" fill-opacity=".25"' : ''}/><path d="${shackle}"/></svg>`;
  return wrap;
}
