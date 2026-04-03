import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { handler: 'src/handler.ts' },
    outDir: 'dist',
    format: ['cjs'],
    target: 'node20',
    platform: 'node',
    noExternal: [/.*/],
    banner: { js: '#!/usr/bin/env node' },
    clean: true,
    minify: false,
    sourcemap: false,
  },
  {
    entry: { installer: 'src/installer/index.ts' },
    outDir: 'dist',
    format: ['esm'],
    target: 'node20',
    platform: 'node',
    noExternal: [/.*/],
    outExtension: () => ({ js: '.mjs' }),
    clean: false,
    minify: false,
    sourcemap: false,
  },
]);
