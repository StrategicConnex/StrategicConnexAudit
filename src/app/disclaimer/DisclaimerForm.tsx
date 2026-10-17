"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { acceptDisclaimer } from "./actions";

interface DisclaimerFormProps {
  /** Destino interno ya sanitizado en el servidor. */
  redirectTo: string;
  acceptLabel: string;
  submitLabel: string;
}

/**
 * Formulario de aceptación: el botón permanece deshabilitado hasta marcar el
 * checkbox y sólo navega cuando la server action ya escribió la cookie.
 */
export function DisclaimerForm({
  redirectTo,
  acceptLabel,
  submitLabel,
}: DisclaimerFormProps) {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accepted || pending) return;

    setPending(true);
    try {
      await acceptDisclaimer();
      // La cookie ya viaja en la respuesta de la action; el push la incluye.
      router.push(redirectTo);
      router.refresh();
    } catch {
      // Sin cookie no hay avance: se rehabilita el botón para reintentar.
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-sm sm:flex-row sm:items-center"
    >
      <Checkbox
        id="disclaimer-accept"
        checked={accepted}
        onChange={(event) => setAccepted(event.target.checked)}
        disabled={pending}
      />
      <label
        htmlFor="disclaimer-accept"
        className="flex-1 cursor-pointer text-muted-foreground"
      >
        {acceptLabel}
      </label>
      <Button type="submit" disabled={!accepted || pending} aria-busy={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}
