'use server';

import { authenticatedAction } from "@/shared/lib/actions";
import { z } from 'zod';
import { projects, users } from '@/shared/db/schemas';
import { eq, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

const CreateProjectSchema = z.object({
  name: z.string().min(3, "El nombre debe tener al menos 3 caracteres"),
  baseUrl: z.string().min(4, "URL inválida"), // Cambiado para coincidir con el campo del formulario
});

export const createProject = authenticatedAction(
  CreateProjectSchema,
  async (data, { user, tx }) => {
    let domain = data.baseUrl;

    // Validacin/Formateo de URL
    if (!/^https?:\/\//i.test(domain)) {
      domain = `https://${domain}`;
    }

    try {
      // 1. Auto-sincronizacin del usuario con Plan por Defecto (Self-Healing)
      // Buscamos el ID del plan gratuito (el primero creado)
      const defaultPlan = await tx.query.subscriptionPlans.findFirst({
        orderBy: (plans, { asc }) => [asc(plans.createdAt)],
      });

      await tx.insert(users)
        .values({
          id: user.id,
          email: user.email || '',
          fullName: user.user_metadata?.full_name || 'Usuario Nuevo',
          planId: defaultPlan?.id, // Asignamos el plan base si es un usuario nuevo
        })
        .onConflictDoUpdate({
          target: users.id,
          set: { 
            email: user.email || '',
            updatedAt: new Date()
          }
        });

      // 2. Creacin del proyecto (Dispara el TRIGGER de cuotas en Postgres)
      await tx.insert(projects).values({
        name: data.name,
        domain: domain,
        ownerId: user.id,
      });

      revalidatePath('/');
      return { success: true, message: "Proyecto creado correctamente" };
    } catch (error) {
      const err = error as { message?: string };
      // Capturamos el error personalizado de Postgres (LIMIT_EXCEEDED)
      if (err.message?.includes('LIMIT_EXCEEDED')) {
        // Extraemos el mensaje amigable que pusimos en el RAISE EXCEPTION
        const cleanMessage = err.message.split('LIMIT_EXCEEDED: ')[1] || "Lmite de proyectos alcanzado.";
        return { 
          error: cleanMessage + " 🚀 Mejora tu plan para seguir creciendo." 
        };
      }

      console.error("Error al crear proyecto:", error);
      throw error; // Dejamos que el logger de authenticatedAction capture el resto
    }
  }
);

const DeactivateSchema = z.object({
  projectId: z.string().uuid(),
});

export const deactivateProject = authenticatedAction(
  DeactivateSchema,
  async ({ projectId }, { user, tx }) => {
    await tx.update(projects)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.ownerId, user.id)
        )
      );
      
    revalidatePath('/');
    return { success: true };
  }
);