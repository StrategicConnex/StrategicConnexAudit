/** Extrae un mensaje legible de un valor unknown capturado en catch. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === "string") {
    return error.message;
  }
  if (typeof error === "string") return error;
  return "Error desconocido";
}
