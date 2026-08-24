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
        branches: 20,
        functions: 20,
        lines: 25,
        statements: 25,
      },
    },
  },
});
