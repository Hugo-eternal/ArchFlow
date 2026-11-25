// V3 build: src/ArchFlow.html → dist/ArchFlow.html, one self-contained offline file
// (scripts, styles and assets inlined by vite-plugin-singlefile; no external requests).
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  root: 'src',
  base: './',
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    rollupOptions: { input: 'src/ArchFlow.html' },
  },
  server: { open: '/ArchFlow.html' },
});
