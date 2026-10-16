// @ts-check
// Developer switches read from the page URL — for evaluating the visual
// dynamics prototype, not user settings (nothing here is saved, shared or
// part of a preset).
//
//   ?dyn=0     turn the dynamic material response off (compare against rest)
//   ?hold=0.35 freeze the event clock at 0.35 transition durations after the
//              event (0.35 is the energy peak with the default envelope);
//              starts held at load so a still can be inspected
//   ?amp=1.5   scale the strength of the response (default 1)
//   ?dev       expose window.__proun for inspection

/**
 * @param {string} search  e.g. window.location.search
 * @returns {{ dynamics: boolean, hold: number | null, amp: number, dev: boolean }}
 */
export function parseDevFlags(search) {
  const q = new URLSearchParams(search || '');
  /** @param {string} key @param {number} lo @param {number} hi */
  const num = (key, lo, hi) => {
    const raw = q.get(key);
    if (raw === null || raw.trim() === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null;
  };
  const amp = num('amp', 0, 3);
  return {
    dynamics: q.get('dyn') !== '0',
    hold: num('hold', 0, 6),
    amp: amp === null ? 1 : amp,
    dev: ['dyn', 'hold', 'amp', 'dev'].some((k) => q.has(k))
  };
}

export const DEV_FLAGS = parseDevFlags(typeof window !== 'undefined' ? window.location.search : '');
