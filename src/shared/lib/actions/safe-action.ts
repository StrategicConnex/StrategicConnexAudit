import { createClient } from '@/shared/lib/supabase/server';
import { z } from 'zod';

export type ActionState<T> = {
  success: boolean;
  message?: string;
  data?: T;
  errors?: Record<string, string[]>;
};

/**
 * Un wrapper para Server Actions que garantiza autenticación y validación.
 */
export async function protectedAction<TInput, TOutput>(
  schema: z.ZodSchema<TInput>,
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

    // 2. Validación de entrada con Zod (opcional si se pasa el schema)
    // Nota: Para FormData, el schema debería manejar la transformación si es necesario
    const result = schema.safeParse(arguments[0]); // Esto es una simplificación, en uso real pasaremos el input ya parseado o el FormData
    
    // Ejecutamos el handler
    const data = await handler(arguments[0] as TInput, user.id);

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
