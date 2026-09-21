'use server';

import { randomUUID } from "node:crypto";
import { logger } from "@/lib/logger";
import { authenticatedAction } from "@/shared/lib/actions";
import { z } from 'zod';
import { projects, users } from '@/shared/db/schemas';
import { eq, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { requireProjectPermission } from "@/server/lib/project-access";
import { validateSafeUrl } from "@/server/intelligence/security/egress-guard";
import { appUrl } from "@/shared/lib/app-url";

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

    // Egress-guard SSRF: el domain alimenta fetches server-side (uptime cron,
    // audit trigger, discovery). Bloquear IPs privadas/loopback en el input
    // evita que un proyecto apunte a la red interna (defensa en profundidad).
    try {
      await validateSafeUrl(domain);
    } catch (egressErr) {
      const egressMessage = egressErr instanceof Error ? egressErr.message : String(egressErr);
      return { error: `Dominio bloqueado por EgressGuard: ${egressMessage}` };
    }

    try {
      // 1. Auto-sincronizacin del usuario con Plan por Defecto (Self-Healing)
      // Solo intentamos sincronizar si hay subscriptionPlans disponibles
      try {
        const defaultPlan = await tx.query.subscriptionPlans.findFirst({
          orderBy: (plans, { asc }) => [asc(plans.createdAt)],
        });

        await tx.insert(users)
          .values({
            id: user.id,
            email: user.email || '',
            fullName: user.user_metadata?.full_name || 'Usuario Nuevo',
            planId: defaultPlan?.id,
          })
          .onConflictDoUpdate({
            target: users.id,
            set: { 
              email: user.email || '',
              updatedAt: new Date()
            }
          });
      } catch (userSyncError) {
        // Fallo en sincronizacin de usuario (ej: tabla subscriptionPlans no existe en dev)
        // Plan B: inserción mínima para que el FK owner_id -> users.id se cumpla
        // y crear proyecto no falle en demo/desarrollo.
        logger.warn("User sync fall (aplico plan B mínimo)", { error: userSyncError });
        try {
          await tx.insert(users)
            .values({
              id: user.id,
              email: user.email || '',
              fullName: user.user_metadata?.full_name || 'Usuario Nuevo',
            })
            .onConflictDoNothing({ target: users.id });
        } catch (bareSyncError) {
          logger.warn("User sync mnimo fall (no bloquea)", { error: bareSyncError });
        }
      }

      // 2. Creacin del proyecto (Dispara el TRIGGER de cuotas en Postgres)
      // beaconSecret: todo proyecto nuevo nace con secreto RUM propio (P0-3).
      await tx.insert(projects).values({
        name: data.name,
        domain: domain,
        ownerId: user.id,
        beaconSecret: randomUUID(),
      });

      revalidatePath('/');
      return { success: true, message: "Proyecto creado correctamente" };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      // Capturamos el error personalizado de Postgres (LIMIT_EXCEEDED)
      if (errMsg?.includes('LIMIT_EXCEEDED')) {
        // Extraemos el mensaje amigable que pusimos en el RAISE EXCEPTION
        const cleanMessage = errMsg.split('LIMIT_EXCEEDED: ')[1] || "Límite de proyectos alcanzado.";
        return { 
          error: cleanMessage + " 🚀 Mejora tu plan para seguir creciendo." 
        };
      }

      logger.error("Error al crear proyecto", { error });
      // Nunca exponer el error crudo (SQL, esquema, params) al usuario final:
      // el modal muestra este mensaje tal cual.
      return { error: "No se pudo crear el proyecto. Intenta de nuevo en unos segundos." };
    }
  }
);

const DeactivateSchema = z.object({
  projectId: z.string().uuid(),
});

const BrandingSchema = z.object({
  projectId: z.string().uuid(),
  brandName: z.string().trim().min(1).max(60).optional(),
  logoUrl: z.string().trim().url().max(2048).optional().or(z.literal("")),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color hex inválido (ej: #D4A843)")
    .optional()
    .or(z.literal("")),
});

/**
 * B-4: marca blanca por proyecto (nombre, logo, color). Se guarda en
 * projects.settings.branding y la consume el portal cliente /p/[token].
 */
export const updateProjectBranding = authenticatedAction(
  BrandingSchema,
  async ({ projectId, brandName, logoUrl, primaryColor }, { user, tx }) => {
    const denied = await requireProjectPermission(user.id, projectId, "project:update");
    if (denied) return { error: denied };

    const [project] = await tx
      .select({ settings: projects.settings })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) return { error: "Proyecto no encontrado" };

    const current = (project.settings ?? {}) as Record<string, unknown>;
    const branding = {
      ...((current.branding ?? {}) as Record<string, unknown>),
      ...(brandName !== undefined ? { brandName } : {}),
      ...(logoUrl !== undefined ? { logoUrl: logoUrl || null } : {}),
      ...(primaryColor !== undefined ? { primaryColor: primaryColor || null } : {}),
    };

    await tx
      .update(projects)
      .set({ settings: { ...current, branding }, updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    revalidatePath(`/projects/${projectId}`);
    return { success: true as const, branding };
  }
);

const NotificationsSchema = z.object({
  projectId: z.string().uuid(),
  telegramChatId: z.string().trim().max(64).optional().or(z.literal("")),
});

/**
 * B-5: chat de Telegram para el digest semanal (projects.settings).
 */
export const updateProjectNotifications = authenticatedAction(
  NotificationsSchema,
  async ({ projectId, telegramChatId }, { user, tx }) => {
    const denied = await requireProjectPermission(user.id, projectId, "project:update");
    if (denied) return { error: denied };

    const [project] = await tx
      .select({ settings: projects.settings })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) return { error: "Proyecto no encontrado" };

    const current = (project.settings ?? {}) as Record<string, unknown>;
    await tx
      .update(projects)
      .set({
        settings: { ...current, telegramChatId: telegramChatId || null },
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    revalidatePath(`/projects/${projectId}`);
    return { success: true as const };
  }
);

/**
 * B-4: genera un link firmado de portal cliente (90 días). Solo admin+.
 */
export const createPortalLink = authenticatedAction(
  DeactivateSchema,
  async ({ projectId }, { user }) => {
    const denied = await requireProjectPermission(user.id, projectId, "project:update");
    if (denied) return { error: denied };    const { signPortalToken } = await import("@/server/lib/portal-tokens");
    // appUrl() prefiere el dominio estable de producción: VERCEL_URL puede
    // tener Vercel Authentication (SSO) y mostraría login al cliente.
    const url = `${appUrl()}/p/${signPortalToken(projectId)}`;
    return { success: true as const, url };
  }
);

/**
 * Rota el secreto del beacon RUM (P0-3). Solo el owner. Retorna el nuevo
 * secreto para mostrarlo UNA vez en la tarjeta de integración.
 */
export const rotateBeaconSecret = authenticatedAction(
  DeactivateSchema,
  async ({ projectId }, { user, tx }) => {
    // A-3: apikeys:manage (admin+) en vez de solo owner.
    const denied = await requireProjectPermission(user.id, projectId, "apikeys:manage");
    if (denied) return { error: denied };
    const [updated] = await tx.update(projects)
      .set({ beaconSecret: randomUUID(), updatedAt: new Date() })
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.ownerId, user.id)
        )
      )
      .returning({ beaconSecret: projects.beaconSecret });

    if (!updated?.beaconSecret) {
      return { error: "Proyecto no encontrado" };
    }

    revalidatePath(`/projects/${projectId}`);
    return { success: true, beaconSecret: updated.beaconSecret };
  }
);

export const deactivateProject = authenticatedAction(
  DeactivateSchema,
  async ({ projectId }, { user, tx }) => {
    // A-3: project:delete (owner). El where ownerId queda como red.
    const denied = await requireProjectPermission(user.id, projectId, "project:delete");
    if (denied) return { error: denied };
    await tx.update(projects)
      .set({ deletedAt: new Date(), isDeleted: true })
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