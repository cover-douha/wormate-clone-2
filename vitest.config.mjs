import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Anclar root al directorio del repo Godot para que vite no busque
  // postcss.config.mjs en directorios padre (p.ej. el dashboard Next.js).
  root: here,
  css: { postcss: { plugins: [] } },
  test: {
    include: ['tests/server/**/*.test.mjs'],
    environment: 'node',
  },
});
