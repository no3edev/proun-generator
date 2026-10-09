// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { copyText } from '../src/ui/clipboard.js';

const setClipboard = (impl) => Object.defineProperty(navigator, 'clipboard', { value: impl, configurable: true });
afterEach(() => {
  setClipboard(undefined);
  delete document.execCommand;
  vi.restoreAllMocks();
});

describe('copyText', () => {
  it('uses the async Clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    expect(await copyText('hello')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to execCommand when the API is missing', async () => {
    document.execCommand = vi.fn().mockReturnValue(true);
    expect(await copyText('hello')).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull(); // temp element cleaned up
  });

  it('falls back to execCommand when the API rejects (permission denied)', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    document.execCommand = vi.fn().mockReturnValue(true);
    expect(await copyText('x')).toBe(true);
  });

  it('resolves false (never throws) when nothing works', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    document.execCommand = vi.fn().mockReturnValue(false);
    expect(await copyText('x')).toBe(false);
    delete document.execCommand;
    expect(await copyText('x')).toBe(false);
  });
});
