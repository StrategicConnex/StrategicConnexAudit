import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";

/**
 * Regresión de la race condition del cambio de tema.
 *
 * El bug: NeuralNetworkBackground releía los tokens CSS (getComputedStyle)
 * SÍNCRONAMENTE en su useEffect([theme]). React ejecuta los effects de los
 * hijos ANTES que los del padre, así que el componente leía el token del
 * `data-theme` ANTERIOR — el ThemeProvider (padre) aplica `data-theme` en su
 * propio effect, que corre después. El fix mueve la relectura a un
 * requestAnimationFrame, que corre tras el commit completo.
 *
 * Estos tests montan el escenario real: el anti-FOUC dejó `data-theme="dark"`
 * en <html>, pero el usuario tiene preferencia "light" en localStorage. Sin el
 * fix, el canvas dibujaría el token dark (#C4B5FD); con el fix dibuja el
 * token light (#1D4ED8).
 *
 * Aislamiento: theme-provider cachea la preferencia a nivel de módulo
 * (`cached`), así que cada test usa `vi.resetModules()` + imports dinámicos
 * para partir de estado fresco.
 */

/* ─── Tokens CSS simulados (mismos valores que globals.css) ──────────── */
const TOKENS_CSS = `
  :root, [data-theme="dark"] {
    --neural-node: #C4B5FD;
    --neural-line: rgba(196, 181, 253, 0.5);
  }
  [data-theme="light"] {
    --neural-node: #1D4ED8;
    --neural-line: rgba(37, 99, 235, 0.45);
  }
`;

/* ─── Stub de Canvas 2D que captura los colores dibujados ────────────── */
interface CtxStub {
  fillStyle: string;
  strokeStyle: string;
  nodes: string[];
  lines: string[];
  [key: string]: unknown;
}

function createCtxStub(): CtxStub {
  const stub: CtxStub = {
    fillStyle: "",
    strokeStyle: "",
    nodes: [],
    lines: [],
  };
  stub.setTransform = () => {};
  stub.clearRect = () => {};
  stub.beginPath = () => {};
  stub.moveTo = () => {};
  stub.lineTo = () => {};
  stub.stroke = () => { stub.lines.push(stub.strokeStyle); };
  stub.arc = () => {};
  stub.fill = () => { stub.nodes.push(stub.fillStyle); };
  return stub;
}

let ctxStub: CtxStub;
let storage: Record<string, string>;

function mockMatchMedia() {
  vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
    // system = light (prefers-color-scheme: dark → false)
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
}

/* localStorage stub — Node 22 no expone el global en jsdom sin flag. */
function mockLocalStorage() {
  storage = {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage[k] ?? null,
    setItem: (k: string, v: string) => { storage[k] = String(v); },
    removeItem: (k: string) => { delete storage[k]; },
    clear: () => { storage = {}; },
    key: (i: number) => Object.keys(storage)[i] ?? null,
    get length() { return Object.keys(storage).length; },
  });
}

/* Carga fresca de los módulos (resetea el cache module-level del provider). */
async function loadFresh() {
  vi.resetModules();
  const themeMod = await import("@/shared/design-system/theme/theme-provider");
  const bgMod = await import("./NeuralNetworkBackground");
  const keyMod = await import("@/shared/design-system/theme/theme-script");
  return {
    ThemeProvider: themeMod.ThemeProvider,
    useTheme: themeMod.useTheme,
    NeuralNetworkBackground: bgMod.NeuralNetworkBackground,
    THEME_STORAGE_KEY: keyMod.THEME_STORAGE_KEY,
  };
}

describe("NeuralNetworkBackground — relectura de tokens tras el provider (race condition)", () => {
  beforeEach(() => {
    mockMatchMedia();
    mockLocalStorage();
    ctxStub = createCtxStub();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctxStub as unknown as CanvasRenderingContext2D);
    // Anti-FOUC simulada: el DOM arranca en dark aunque la preferencia sea light
    document.documentElement.setAttribute("data-theme", "dark");
    const style = document.createElement("style");
    style.textContent = TOKENS_CSS;
    document.head.appendChild(style);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.head.querySelectorAll("style").forEach((s) => s.remove());
  });

  it("monta con preferencia light: el canvas dibuja el token light, NO el dark previo del DOM", async () => {
    const { ThemeProvider, NeuralNetworkBackground, THEME_STORAGE_KEY } = await loadFresh();
    storage[THEME_STORAGE_KEY] = "light";

    render(
      <ThemeProvider>
        <NeuralNetworkBackground />
      </ThemeProvider>
    );

    // El ThemeProvider (padre) aplica data-theme="light" en su effect
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    // Dejar correr el rAF del fix (la relectura debe ocurrir tras el commit)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Sin el fix, el effect del hijo habría leído getComputedStyle cuando el
    // DOM aún tenía data-theme="dark" → dibujaría #C4B5FD (lavanda).
    expect(ctxStub.nodes).toContain("#1D4ED8");
    expect(ctxStub.nodes).not.toContain("#C4B5FD");
    // jsdom normaliza rgba sin espacios: rgba(37,99,235,0.45)
    expect(ctxStub.lines).toContain("rgba(37,99,235,0.45)");
  });

  it("al cambiar a dark en vivo, la relectura usa el token dark (tras el provider)", async () => {
    const { ThemeProvider, useTheme, NeuralNetworkBackground, THEME_STORAGE_KEY } = await loadFresh();
    storage[THEME_STORAGE_KEY] = "light";

    function Toggle({ target }: { target: "light" | "dark" }) {
      const { setTheme } = useTheme();
      return (
        <button type="button" onClick={() => setTheme(target)}>
          set-{target}
        </button>
      );
    }

    render(
      <ThemeProvider>
        <Toggle target="dark" />
        <NeuralNetworkBackground />
      </ThemeProvider>
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Primer paint en light
    expect(ctxStub.nodes).toContain("#1D4ED8");
    ctxStub.nodes = [];
    ctxStub.lines = [];

    // Cambio de tema en vivo (como el ThemeSwitcher real)
    act(() => {
      document.querySelector("button")?.click();
    });

    // El provider aplica data-theme="dark" antes de que el rAF del hijo relea
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    // Espera en act: el rAF del fix relee los tokens y el loop de dibujo los
    // usa. (vi.waitFor NO funciona aquí — no deja avanzar el rAF de jsdom.)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });

    // Tras la relectura, los NUEVOS frames del loop deben ser dark. (Hay
    // frames light entre el click y la relectura del rAF — se limpian aquí.)
    ctxStub.nodes = [];
    ctxStub.lines = [];
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    expect(ctxStub.nodes.length).toBeGreaterThan(0);
    expect(ctxStub.nodes).toContain("#C4B5FD");
    expect(ctxStub.nodes).not.toContain("#1D4ED8");
    expect(ctxStub.lines).toContain("rgba(196,181,253,0.5)");
  });

  it("sin preferencia guardada el resolved del provider es el que manda (no el default del hijo)", async () => {
    const { ThemeProvider, NeuralNetworkBackground } = await loadFresh();
    // storage vacío → theme = "system" → resolved = system = light (mock)

    render(
      <ThemeProvider>
        <NeuralNetworkBackground />
      </ThemeProvider>
    );

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(ctxStub.nodes).toContain("#1D4ED8");
    expect(ctxStub.nodes).not.toContain("#C4B5FD");
  });
});
