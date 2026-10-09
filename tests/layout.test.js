import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// jsdom doesn't lay anything out, so this guards the one thing that has
// already bitten once: CSS that quietly assumes a fixed number of shapes.
const css = readFileSync(resolve(process.cwd(), 'src/ui/panel.css'), 'utf8');
const rule = (selector) => {
  const m = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : '';
};

describe('panel.css', () => {
  it('the shape tab row does not hard-code how many shapes there are', () => {
    const nav = rule('.tabs-nav');
    expect(nav).not.toMatch(/repeat\(\s*\d+/);
    expect(nav).toMatch(/grid-auto-flow:\s*column/);
    expect(nav).toMatch(/grid-auto-columns:\s*1fr/);
  });
});
