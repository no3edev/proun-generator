/**
 * Copies `text` to the clipboard. Uses the async Clipboard API where it's
 * available (secure contexts), else the legacy textarea + execCommand
 * route. Resolves to whether it worked; never throws.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    // fall through to the legacy path (permission denied, insecure context…)
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (err) {
    return false;
  }
}
