import { defineConfig } from 'vite';

export default defineConfig({
  // relative base so the build works from any subpath (e.g. GitHub Pages
  // project sites, which are served from /<repo-name>/)
  base: './',
  build: {
    outDir: 'dist'
  }
});
