import { createClient } from '@/shared/lib/supabase/server';
import { z } from 'zod';

export type ActionState<T> = {
  success: boolean;
  message?: string;
  data?: T;
  errors?: Record<string, string[]>;
};

/**
 * Un wrapper para Server Actions que garantiza autenticación y validación de esquema Zod.
 *
 * Uso:
 *   const result = await protectedAction(MySchema, formData, async (input, userId) => {
 *     // input ya está validado y tipado como z.infer<typeof MySchema>
 *   });
 */
export async function protectedAction<TInput, TOutput>(
  schema: z.ZodSchema<TInput>,
  input: unknown,
  handler: (input: TInput, userId: string) => Promise<TOutput>
): Promise<ActionState<TOutput>> {
  try {
    // 1. Verificación de sesión centralizada
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (!user || authError) {
      return {
        success: false,
        message: "Sesión no válida o expirada. Por favor, ingresa de nuevo.",
      };
    }

    // 2. Validación de entrada con Zod
    const result = schema.safeParse(input);
    if (!result.success) {
      return {
        success: false,
        errors: result.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    // 3. Ejecutar el handler con el input validado y tipado
    const data = await handler(result.data, user.id);

    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error("[Action Error]:", error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        errors: error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    return {
      success: false,
      message: error instanceof Error ? error.message : "Error interno del servidor",
    };
  }
}

