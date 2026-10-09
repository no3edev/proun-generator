import { defineConfig } from 'vitest/config';

// Tests cover the pure, DOM-free modules (collision, config, settings,
// persistence). Anything that needs a canvas/WebGL context is
// intentionally out of scope.
export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.js'] }
});
