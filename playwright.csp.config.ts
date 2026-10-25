import { defineConfig, devices } from "@playwright/test";

/**
 * Config dedicada al gate de CSP.
 *
 * El CSP con nonce solo existe en producción (`src/proxy.ts` devuelve una
 * política permisiva en desarrollo), así que este spec necesita un build real
 * servido con `next start`. Se mantiene fuera de `playwright.config.ts` para no
 * obligar a compilar en cada corrida de los specs funcionales.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /csp\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "line",
  timeout: 120_000,
  use: {
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
      },
    },
  ],
  webServer: {
    // Reutiliza el servidor local si ya está levantado (útil durante el
    // desarrollo del propio gate); en CI siempre construye y arranca limpio.
    command: "pnpm build && pnpm start --port 3100",
    port: 3100,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      NEXT_PUBLIC_DEV_BYPASS_AUTH: "false",
    },
  },
});
