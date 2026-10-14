/**
 * vitest.integration.config.ts — Configuración de Vitest para tests de integración
 *
 * Estos tests corren contra Postgres real (en CI o local).
 * Se excluyen de la suite unitaria porque sin BD fallan con ECONNREFUSED.
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  root: __dirname,
  test: {
    name: 'Integration (Postgres real)',
    // Ejecutar solo los files matching tests/integration/**
    include: ['tests/integration/**/*.test.ts', 'tests/integration/**/*.spec.ts'],
    // Excluir e2e y demás suites que no necesitan BD
    exclude: [
      'node_modules',
      'e2e',
      '.next',
      'tests/integration/setup.ts',
    ],
    environment: 'node',
    reporters: ['default'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});