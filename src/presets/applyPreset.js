// @ts-check

/**
 * Loads a preset (the Library's or one of the viewer's own, saved or imported) into the config. A preset is a COMPOSITION: the seed,
 * palette, orientation, strategy and shapes it was saved with. The viewer's timing (transition, hold, Auto) stays theirs, so loading
 * a preset on an Exhibition display does not turn it back into Dev timing with Auto off. (Share links already worked this way; the
 * restored session is the viewer's own state and keeps its timing as saved.)
 *
 * @param {{ replace: (raw: unknown, options?: { keepTime?: boolean }) => boolean }} config
 * @param {unknown} preset
 * @returns {boolean} whatever replace() returns
 */
export function applyPreset(config, preset) {
  return config.replace(preset, { keepTime: true });
}
