import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    exclude: ['**/node_modules/**', '**/e2e/**', '**/.next/**', '**/test-results/**'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      // El guard server-only lanza en el runtime default (node/jsdom); en
      // tests los módulos marcados deben resolverse a un stub inerte.
      'server-only': path.resolve(__dirname, './scripts/stubs/server-only.ts'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/*.d.ts',
        'src/shared/db/schemas/**',
        'src/shared/db/seed.ts',
        'src/shared/db/run-migration.ts',
        'src/shared/db/test-rls.ts',
      ],
      thresholds: {
        // Ratchet 2026-09: cobertura real ~28/21/24/28 — umbrales justo por
        // encima para impedir regresión; subir 5 pts cada vez que se superen.
        branches: 20,
        functions: 22,
        lines: 28,
        statements: 28,
      },
    },
  },
});
