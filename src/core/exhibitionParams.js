// @ts-check

/**
 * The page's start flags for an unattended display (a kiosk browser has no gesture to enter fullscreen with):
 *   ?exhibition        start with the interface hidden and the picture filling the window
 *   ?exhibition&auto   and also run Exhibition timing with Auto on (otherwise the viewer's saved timing is used)
 *   ?exhibition&playlist   and also turn the curated sequence on (with Auto: the Library's presets instead of random seeds)
 * A flag set to 0 or false is off.
 * @param {string} search window.location.search
 * @returns {{ active: boolean, auto: boolean, playlist: boolean }}
 */
export function parseExhibitionParams(search) {
  const q = new URLSearchParams(String(search || ''));
  /** @param {string} name */
  const on = (name) => q.has(name) && !['0', 'false', 'off', 'no'].includes(String(q.get(name)).toLowerCase());
  const active = on('exhibition');
  return { active, auto: active && on('auto'), playlist: active && on('playlist') };
}
