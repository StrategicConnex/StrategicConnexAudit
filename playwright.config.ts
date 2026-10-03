import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "line",
  // El arranque de Chrome (channel: "chrome") puede tardar ~30 s en local,
  // por encima del timeout por defecto de 30 s: el test fallaba en el setup.
  timeout: 90_000,
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
    // `-p 3000` explícito: `next dev` hereda `PORT` del entorno si existe y,
    // con valores como `PORT=0`, asigna un puerto aleatorio. Entonces el
    // `port: 3000` de abajo nunca queda escuchando, `webServer` agota su
    // timeout de 120 s y TODOS los specs mueren a los 90 s por timeout
    // (síntoma: "Exceeded timeout of 90000ms ... navigating to localhost:3000").
    // Fijar el puerto en el comando hace el contrato explícito e inmune al
    // entorno. CI no exporta PORT, por eso el pipeline nunca lo detectó.
    command: "pnpm dev --port 3000",
    port: 3000,
    // Antes `!process.env.CI`: en local reutilizaba cualquier dev server ya
    // vivo en el 3000, y el bloque `env` de abajo SOLO aplica al servidor que
    // Playwright arranca. Un dev server del desarrollador lee `.env.local` con
    // NEXT_PUBLIC_DEV_BYPASS_AUTH=true, asi que la corrida reutilizadaizaba
    // el bypass de DX y el `env` no lo corregia: los guards de auth se
    // ejecutaban contra un servidor con la sesion falsa puesta y el resultado
    // no significaba nada. `false` hace que Playwright levante siempre su
    // propio servidor; si el puerto esta ocupado, falla con un error claro en
    // vez de dar un verde engañoso.
    reuseExistingServer: false,
    timeout: 120_000,
    // Los specs de auth guards asertan comportamiento SIN sesión
    // (`/` → /login, APIs → 401). El `.env.local` del desarrollador trae
    // `NEXT_PUBLIC_DEV_BYPASS_AUTH=true` para DX, y `next dev` lo lee igual
    // que CI: en local el bypass ganaba y los guards de auth fallaban, mien-
    // tras en GitHub Actions pasaban (el workflow lo fija a 'false').
    // Fijarlo aquí hace la corrida determinista y equivalente a CI.
    env: {
      NEXT_PUBLIC_DEV_BYPASS_AUTH: "false",
    },
  },
});
