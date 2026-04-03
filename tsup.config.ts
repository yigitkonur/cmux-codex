import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { handler: 'src/handler.ts' },
    format: ['cjs'],
    target: 'node20',
    platform: 'node',
    noExternal: [/.*/],
    banner: { js: '#!/usr/bin/env node' },
    clean: true,
  },
  {
    entry: { installer: 'src/installer/index.ts' },
    format: ['esm'],
    target: 'node20',
    platform: 'node',
    noExternal: [/.*/],
  },
]);
