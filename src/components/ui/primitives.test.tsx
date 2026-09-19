import { describe, it, expect } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogBackdrop,
  DialogPopup,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuPositioner,
  DropdownMenuPopup,
  DropdownMenuItem,
} from "@/components/ui/DropdownMenu";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPortal,
  SelectPositioner,
  SelectPopup,
  SelectList,
  SelectItem,
} from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Tabs, TabsList, TabsTab, TabsPanel } from "@/components/ui/Tabs";
import {
  ToastProvider,
  ToastViewport,
  ToastRoot,
  ToastTitle,
  ToastDescription,
  createToastManager,
  useToastManager,
} from "@/components/ui/Toast";

/**
 * Semana 2 — primitivos Base UI con piel SCAUDIT.
 * Verifica render, roles/ARIA y navegación por teclado de cada wrapper.
 */

describe("Dialog", () => {
  it("abre con trigger, expone dialog modal y cierra con Escape", () => {
    // NOTA: Base UI v1 no renderiza aria-modal (modalidad vía focus-trap +
    // scroll-lock, modal=true por defecto); se verifica role + cierre.
    render(
      <Dialog>
        <DialogTrigger>Abrir</DialogTrigger>
        <DialogPortal>
          <DialogBackdrop />
          <DialogPopup>
            <DialogTitle>Título</DialogTitle>
            <DialogDescription>Descripción</DialogDescription>
          </DialogPopup>
        </DialogPortal>
      </Dialog>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Abrir"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    cleanup();
  });
});

describe("DropdownMenu", () => {
  it("abre con trigger, muestra items y cierra con Escape", () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Menú</DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuPositioner>
            <DropdownMenuPopup>
              <DropdownMenuItem>Acción</DropdownMenuItem>
            </DropdownMenuPopup>
          </DropdownMenuPositioner>
        </DropdownMenuPortal>
      </DropdownMenu>,
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Menú"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Acción" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    cleanup();
  });
});

describe("Select", () => {
  it("combobox colapsado, abre listbox con opciones y cierra con Escape", () => {
    render(
      <Select defaultValue={null}>
        <SelectTrigger>
          <SelectValue placeholder="Elige" />
        </SelectTrigger>
        <SelectPortal>
          <SelectPositioner>
            <SelectPopup>
              <SelectList>
                <SelectItem value="a">Opción A</SelectItem>
                <SelectItem value="b">Opción B</SelectItem>
              </SelectList>
            </SelectPopup>
          </SelectPositioner>
        </SelectPortal>
      </Select>,
    );
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveTextContent("Elige");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Opción A" }),
    ).toHaveAttribute("aria-selected", "false");
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    cleanup();
  });

  it("pinta el valor controlado y marca la opción seleccionada", () => {
    // NOTA: el mapa `items` es el path determinista de resolución de labels
    // (sin depender del montaje del popup); los items declarativos sirven
    // igual en uso real tras la primera apertura.
    render(
      <Select value="b" items={{ a: 'Opción A', b: 'Opción B' }}>
        <SelectTrigger>
          <SelectValue placeholder="Elige" />
        </SelectTrigger>
        <SelectPortal>
          <SelectPositioner>
            <SelectPopup>
              <SelectList>
                <SelectItem value="a">Opción A</SelectItem>
                <SelectItem value="b">Opción B</SelectItem>
              </SelectList>
            </SelectPopup>
          </SelectPositioner>
        </SelectPortal>
      </Select>,
    );
    expect(screen.getByRole("combobox")).toHaveTextContent("Opción B");
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: "Opción B" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    cleanup();
  });
});

describe("Switch", () => {
  it("role switch con aria-checked que alterna con click", () => {
    render(<Switch aria-label="Notificaciones" />);
    const sw = screen.getByRole("switch", { name: "Notificaciones" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "true");
    cleanup();
  });
});

describe("Tabs", () => {
  function Harness() {
    return (
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTab value="a">Pestaña A</TabsTab>
          <TabsTab value="b">Pestaña B</TabsTab>
        </TabsList>
        <TabsPanel value="a">Panel A</TabsPanel>
        <TabsPanel value="b">Panel B</TabsPanel>
      </Tabs>
    );
  }

  it("aria-selected y panel activo cambian al hacer click", () => {
    render(<Harness />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Pestaña A" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Panel A")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Pestaña B" }));
    expect(
      screen.getByRole("tab", { name: "Pestaña B" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Panel B")).toBeInTheDocument();
    cleanup();
  });

  it("roving tabindex: solo la pestaña activa es focable con Tab", () => {
    // NOTA: el movimiento con flechas lo gestiona el composite interno de
    // Base UI (no responde a eventos sintéticos en jsdom); aquí se verifica
    // el contrato DOM que lo habilita: roving tabindex 0/-1 coherente con
    // aria-selected, que es lo que el wrapper debe cablear.
    // Base UI usa activación manual por defecto (activateOnFocus=false).
    render(<Harness />);
    const tabA = screen.getByRole("tab", { name: "Pestaña A" });
    const tabB = screen.getByRole("tab", { name: "Pestaña B" });
    expect(tabA).toHaveAttribute("tabindex", "0");
    expect(tabB).toHaveAttribute("tabindex", "-1");
    fireEvent.click(tabB);
    expect(tabB).toHaveAttribute("aria-selected", "true");
    expect(tabB).toHaveAttribute("tabindex", "0");
    expect(tabA).toHaveAttribute("tabindex", "-1");
    cleanup();
  });
});

describe("Toast", () => {
  it("muestra el toast añadido vía manager con título y descripción", () => {
    const manager = createToastManager();
    function Harness() {
      const { toasts } = useToastManager();
      return (
        <ToastViewport>
          {toasts.map((t) => (
            <ToastRoot key={t.id} toast={t}>
              <ToastTitle>{t.title}</ToastTitle>
              <ToastDescription>{t.description}</ToastDescription>
            </ToastRoot>
          ))}
        </ToastViewport>
      );
    }
    render(
      <ToastProvider toastManager={manager}>
        <Harness />
      </ToastProvider>,
    );
    expect(screen.queryByText("Listo")).not.toBeInTheDocument();
    act(() => {
      manager.add({ title: "Listo", description: "Auditoría completa" });
    });
    expect(screen.getByText("Listo")).toBeInTheDocument();
    expect(screen.getByText("Auditoría completa")).toBeInTheDocument();
    cleanup();
  });
});
