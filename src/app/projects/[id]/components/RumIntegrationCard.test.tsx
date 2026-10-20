import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RumIntegrationCard, type RumStats } from "./RumIntegrationCard";
import { rotateBeaconSecret } from "@/app/actions/projects";

/**
 * Incidente 2026-10-19 23:00: el owner copió a mano el token ENMASCARADO
 * ("79ed10…b49c") que la card mostraba en pantalla, lo pegó en Vercel como
 * NEXT_PUBLIC_RUM_BEACON_TOKEN y los beacons del self-RUM devolvían 401.
 *
 * Contrato de esta card tras el fix:
 * - El DISPLAY (snippet en el code block + fila del token) muestra SIEMPRE el
 *   valor enmascarado salvo «Ver» explícito (owner/admin).
 * - El valor REAL del token solo viaja por «Copiar snippet» / «Copiar token».
 * - Tras rotar, el nuevo token vuelve a enmascarado (nunca expuesto de sobra).
 */

vi.mock("@/app/actions/projects", () => ({
  rotateBeaconSecret: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const SECRET = "rum_tok_abcdef1234567890abcdef1234567890";
const NEW_SECRET = "rum_tokNuevoFeed0987654321";
const UUID = "95f73451-51fa-46a8-bd68-5aaad54d3c8f";

const STATS: RumStats = { totalEvents: 12, lastEventAt: null, uniqueSessions: 3 };

const stubClipboard = () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  return writeText;
};

describe("RumIntegrationCard", () => {
  let writeText: ReturnType<typeof stubClipboard>;

  beforeEach(() => {
    writeText = stubClipboard();
    vi.mocked(rotateBeaconSecret).mockResolvedValue({ data: { beaconSecret: NEW_SECRET } });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("muestra el token ENMASCARADO en display: ni el code block ni la fila filtran el secreto completo", () => {
    render(
      <RumIntegrationCard
        projectId={UUID}
        appUrl="https://scaudit.vercel.app"
        stats={STATS}
        beaconSecret={SECRET}
      />,
    );

    const masked = `${SECRET.slice(0, 6)}…${SECRET.slice(-4)}`;
    expect(screen.getAllByText(masked).length).toBeGreaterThan(0);
    // El snippet visible NO contiene el secreto íntegro:
    const codeBlock = screen.getByText(/scripts\/vitals\.js/);
    expect(codeBlock.textContent).not.toContain(SECRET);
    expect(codeBlock.textContent).toContain("data-beacon-token");
  });

  it("«Ver token» (owner) revela el secreto real y «Ocultar» vuelve a enmascarado", () => {
    render(
      <RumIntegrationCard
        projectId={UUID}
        appUrl="https://scaudit.vercel.app"
        stats={STATS}
        beaconSecret={SECRET}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ver token" }));
    expect(screen.getByText(SECRET)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ocultar token" }));
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
  });

  it("con canRotate=false, Ver/Copiar token/rotar están DESHABILITADOS (A-3)", () => {
    render(
      <RumIntegrationCard
        projectId={UUID}
        appUrl="https://scaudit.vercel.app"
        stats={STATS}
        beaconSecret={SECRET}
        canRotate={false}
      />,
    );

    expect(screen.getByRole("button", { name: "Ver token" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Copiar token" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rotar token" })).toBeDisabled();
  });

  it("«Copiar snippet» escribe en el portapapeles el snippet con el token REAL (no el enmascarado)", async () => {
    render(
      <RumIntegrationCard
        projectId={UUID}
        appUrl="https://scaudit.vercel.app"
        stats={STATS}
        beaconSecret={SECRET}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copiar snippet" }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain(`data-project-id="${UUID}"`);
    expect(copied).toContain(`data-beacon-token="${SECRET}"`);
    expect(screen.getByText(/Snippet copiado/)).toBeInTheDocument();
  });

  it("«Copiar token» escribe SOLO el token real — el flujo que evita el incidente", async () => {
    render(
      <RumIntegrationCard
        projectId={UUID}
        appUrl="https://scaudit.vercel.app"
        stats={STATS}
        beaconSecret={SECRET}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copiar token" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SECRET));
    expect(screen.getByText(/Token copiado/)).toBeInTheDocument();
  });

  it("sin secreto: no hay Ver/Copiar token y ofrece «Generar token»", () => {
    render(
      <RumIntegrationCard
        projectId={UUID}
        appUrl="https://scaudit.vercel.app"
        stats={STATS}
        beaconSecret={null}
      />,
    );

    expect(screen.queryByRole("button", { name: "Ver token" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copiar token" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar token" })).toBeInTheDocument();
    expect(screen.getByText(/Sin token/)).toBeInTheDocument();
  });

  it("tras rotar: el NUEVO secreto NUNCA queda expuesto (vuelve a enmascarado)", async () => {
    render(
      <RumIntegrationCard
        projectId={UUID}
        appUrl="https://scaudit.vercel.app"
        stats={STATS}
        beaconSecret={SECRET}
      />,
    );

    // Reveal explícito ANTES de rotar…
    fireEvent.click(screen.getByRole("button", { name: "Ver token" }));
    expect(screen.getByText(SECRET)).toBeInTheDocument();

    // …y al rotar el nuevo token NO aparece en claro:
    fireEvent.click(screen.getByRole("button", { name: "Rotar token" }));

    await waitFor(() => expect(rotateBeaconSecret).toHaveBeenCalledWith({ projectId: UUID }));
    const maskedNew = `${NEW_SECRET.slice(0, 6)}…${NEW_SECRET.slice(-4)}`;
    await waitFor(() =>
      expect(screen.queryByText(NEW_SECRET)).not.toBeInTheDocument(),
    );
    expect(screen.getAllByText(maskedNew).length).toBeGreaterThan(0);
    expect(screen.getByText(/¡Token actualizado!/)).toBeInTheDocument();
  });
});
