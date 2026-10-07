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
  plane: `<svg viewBox="0 0 24 24" ${S}><path d="M3 15.5 8.5 7H21l-5.5 8.5Z" fill="currentColor" fill-opacity=".18"/></svg>`
};

export function shapeIcon(type) {
  const wrap = document.createElement('span');
  wrap.className = 'shape-icon';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = ICONS[type] || ICONS.circle;
  return wrap;
}
