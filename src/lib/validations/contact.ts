import { z } from "zod";

export const contactSchema = z.object({
  name: z.string()
    .min(3, "El nombre debe tener al menos 3 caracteres")
    .max(100, "El nombre es demasiado largo")
    .trim(),
  company: z.string()
    .min(2, "La organización debe tener al menos 2 caracteres")
    .max(100, "El nombre de la organización es demasiado largo")
    .trim(),
  email: z.string()
    .email("Correo corporativo inválido")
    .trim(),
  message: z.string()
    .min(10, "El mensaje debe tener al menos 10 caracteres")
    .max(2000, "El mensaje es demasiado largo")
    .trim(),
});

export type ContactFormData = z.infer<typeof contactSchema>;
