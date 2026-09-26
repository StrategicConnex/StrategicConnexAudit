import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    testTimeout: 15000,
    // Los route.test.ts importan su route.ts dinámicamente en beforeEach; bajo
    // carga de la suite completa (155 archivos + instrumentación de cobertura)
    // ese import supera los 10s por defecto y truena el hook.
    hookTimeout: 30000,
    // La suite completa con cobertura agota la RAM con los ~7 forks por defecto
    // (159 archivos jsdom, 7.5 GB totales y ~1 GB libres): los workers no
    // respondían y vitest reportaba 4 "Unhandled Errors" → exit 1 con todo en verde.
    maxWorkers: process.env.CI ? 2 : 4,
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
        'src/shared/db/test-rls.ts',
      ],
      thresholds: {
        // Ratchet 2026-09-24: cobertura real 41.05/31.75/36.39/42 — umbrales
        // justo por debajo para impedir regresión; subir 5 pts cada vez que se superen.
        branches: 30,
        functions: 34,
        lines: 41,
        statements: 40,
      },
    },
  },
});
