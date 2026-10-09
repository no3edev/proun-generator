// @ts-check
// Shareable links: a composition (seed + palette + orientation + per-shape
// settings) packed into a URL fragment, "#s=<base64url>". Timing
// (duration / interval / auto-advance) is the viewer's own preference and
// is deliberately NOT part of a link.
//
// The link format is versioned separately from the config schema (SHARE_FORMAT
// below) and is meant to stay decodable forever, so it is explicit rather than
// "whatever the config looks like today": per-shape settings are keyed by
// shape type (not position in the registry) as a fixed-order array, and
// nothing is left to defaults that might change. Decoding yields a *patch*
// for SceneConfig.update(), which validates and clamps every value, so a
// hand-edited or corrupt link can't produce an invalid scene.
//
// DOM-free (btoa/atob/TextEncoder exist in browsers and node).

/** @typedef {import('../types.js').SceneConfigState} SceneConfigState */

export const SHARE_FORMAT = 1;
export const SHARE_PARAM = 's';
const MAX_LENGTH = 16384; // refuse to even parse absurdly long fragments (locked shapes make links longer)

/** @param {string} text */
function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** @param {string} b64url */
function fromBase64Url(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

const round5 = (/** @type {number} */ n) => Math.round(n * 1e5) / 1e5;

/**
 * The fragment value for `config` (without the "#s=").
 * Shape settings are [visible(0/1), count, sizeMin, sizeMax, spread].
 * A locked shape type is also listed under `l` — an additive, optional
 * field (absent when nothing is locked, so unlocked links are byte-for-byte
 * what they always were) — as one flat array per instance:
 * [px, py, pz, rx, ry, rz, sx, sy, sz, "#hex"], numbers rounded to 5 places.
 * Types with "snap rotation" on are listed under `r` (also additive and
 * omitted when empty).
 * @param {SceneConfigState} config
 */
export function encodeShare(config) {
  /** @type {Record<string, [number, number, number, number, number]>} */
  const shapes = {};
  /** @type {Record<string, Array<Array<number | string>>>} */
  const locked = {};
  /** @type {string[]} */
  const snapped = [];
  Object.entries(config.shapes).forEach(([type, s]) => {
    shapes[type] = [s.visible ? 1 : 0, s.count, s.sizeMin, s.sizeMax, s.spread];
    if (s.snapRotation) snapped.push(type);
    if (s.locked) {
      locked[type] = s.locked.map((e) => [...[...e.position, ...e.rotation, ...e.scale].map(round5), e.hex]);
    }
  });
  return toBase64Url(JSON.stringify({
    v: SHARE_FORMAT, s: config.seed, p: config.palette, o: config.orientation, h: shapes,
    ...(Object.keys(locked).length ? { l: locked } : {}),
    ...(snapped.length ? { r: snapped } : {})
  }));
}

/**
 * The full URL for `config`, on `baseUrl` (any existing fragment is replaced).
 * @param {SceneConfigState} config
 * @param {string} baseUrl e.g. location.href
 */
export function buildShareUrl(config, baseUrl) {
  return `${baseUrl.split('#')[0]}#${SHARE_PARAM}=${encodeShare(config)}`;
}

/**
 * Does this location.hash carry a share link (valid or not)? Used to know
 * whether to clear the fragment after boot.
 * @param {string} hash
 */
export function hasShareParam(hash) {
  return new URLSearchParams(String(hash || '').replace(/^#/, '')).has(SHARE_PARAM);
}

/**
 * @param {unknown} list the `l[type]` value from a link
 * @returns {import('../types.js').LockedEntry[] | null} null if malformed
 *   (SceneConfig validates the numbers again when the patch is applied)
 */
function decodeLocked(list) {
  if (!Array.isArray(list)) return null;
  /** @type {import('../types.js').LockedEntry[]} */
  const out = [];
  for (const row of list) {
    if (!Array.isArray(row) || row.length !== 10) return null;
    const n = row.slice(0, 9);
    if (!n.every((v) => typeof v === 'number') || typeof row[9] !== 'string') return null;
    out.push({
      position: [n[0], n[1], n[2]], rotation: [n[3], n[4], n[5]], scale: [n[6], n[7], n[8]], hex: row[9]
    });
  }
  return out;
}

/**
 * Decodes a location.hash ("#s=...") — or a bare value — into a patch for
 * SceneConfig.update(), or null if it isn't a usable share link. Never throws.
 * @param {string} input
 * @returns {{ seed: number, palette?: string, orientation?: string,
 *             shapes: Record<string, Record<string, any>> } | null}
 */
export function decodeShare(input) {
  try {
    const text = String(input || '').replace(/^#/, '');
    if (!text || text.length > MAX_LENGTH) return null;
    const value = text.includes('=') ? new URLSearchParams(text).get(SHARE_PARAM) : text;
    if (!value) return null;

    const payload = JSON.parse(fromBase64Url(value));
    if (!payload || typeof payload !== 'object' || payload.v !== SHARE_FORMAT) return null;
    if (typeof payload.s !== 'number' || !Number.isFinite(payload.s)) return null;

    /** @type {Record<string, Record<string, any>>} */
    const shapes = {};
    if (payload.h && typeof payload.h === 'object') {
      Object.entries(payload.h).forEach(([type, arr]) => {
        if (!Array.isArray(arr) || arr.length !== 5) return;
        /** @type {Record<string, any>} */
        const s = {};
        if (arr[0] === 0 || arr[0] === 1) s.visible = arr[0] === 1;
        ['count', 'sizeMin', 'sizeMax', 'spread'].forEach((k, i) => {
          if (typeof arr[i + 1] === 'number') s[k] = arr[i + 1];
        });
        // a link describes the whole composition, so a type it doesn't lock
        // is explicitly unlocked (null) rather than keeping the viewer's own lock
        s.locked = null;
        s.snapRotation = false; // likewise: only the types the link lists under `r` snap
        shapes[type] = s;
      });
    }
    if (Array.isArray(payload.r)) {
      payload.r.forEach((/** @type {unknown} */ type) => {
        if (typeof type === 'string' && shapes[type]) shapes[type].snapRotation = true;
      });
    }
    if (payload.l && typeof payload.l === 'object') {
      Object.entries(payload.l).forEach(([type, list]) => {
        const entries = decodeLocked(list);
        if (entries && shapes[type]) shapes[type].locked = entries;
      });
    }
    return {
      seed: payload.s,
      ...(typeof payload.p === 'string' ? { palette: payload.p } : {}),
      ...(typeof payload.o === 'string' ? { orientation: payload.o } : {}),
      shapes
    };
  } catch (err) {
    return null; // bad base64 / JSON / UTF-8
  }
}
