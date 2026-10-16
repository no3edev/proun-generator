// @ts-check
// Decides what the app starts with. Priority:
//   1. a share link in the URL fragment   (the composition someone sent you)
//   2. the autosaved session              (where you left off)
//   3. the defaults
// A link applies on top of the session, and only its composition: the
// viewer keeps their own timing settings (duration / interval) from the
// session. Called once, before anything subscribes to the config.

import { loadSession } from './session.js';
import { decodeShare, hasShareParam } from './share.js';

/**
 * @param {{ replace(raw: unknown): unknown, update(patch: unknown): unknown, get(): { shapes: Record<string, unknown> } }} config
 * @param {{ storage: import('./session.js').StorageLike | null | undefined, hash: string }} source
 * @returns {{ source: 'link' | 'session' | 'default', hadLink: boolean }}
 *   hadLink: the fragment contained a share link (valid or not) — the caller
 *   should clear it from the address bar so it isn't re-applied on reload.
 */
export function restoreConfig(config, { storage, hash }) {
  /** @type {'link' | 'session' | 'default'} */
  let used = 'default';

  const session = loadSession(storage);
  if (session) {
    config.replace(session);
    used = 'session';
  }

  const hadLink = hasShareParam(hash);
  const link = hadLink ? decodeShare(hash) : null;
  if (link) {
    // a link describes the whole composition: a shape type it doesn't list
    // (one added since the link was made) is off, not whatever the viewer has
    Object.keys(config.get().shapes).forEach((type) => {
      if (!link.shapes[type]) link.shapes[type] = { count: 0, locked: null, snapRotation: false };
    });
    config.update(link);
    used = 'link';
  }
  return { source: used, hadLink };
}
