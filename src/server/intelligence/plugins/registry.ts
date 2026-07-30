/**
 * registry.ts — Plugin Registry (P3.4)
 *
 * CRUD server-side para el catalogo de plugins y las instancias instaladas.
 * Opera sobre las tablas plugin_packages y plugin_instances via Drizzle.
 */

import { db } from "@/shared/db";
import { withRLS } from "@/shared/db/rls";
import { pluginPackages, pluginInstances } from "@/shared/db/schemas";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import type {
  PluginPackage, PluginPackageInsert,
  PluginInstance, PluginInstanceInsert,
} from "@/shared/db/schemas";
import type { PluginManifest, PluginMarketplaceItem, PluginInstallResult } from "./types";

// ─── Catalogo ───────────────────────────────────────────────────────────────

export async function listPluginCatalog(userId: string): Promise<PluginMarketplaceItem[]> {
  const packages = await db.query.pluginPackages.findMany({
    orderBy: [desc(pluginPackages.downloadsCount)],
  });

  const userInstances = await withRLS(userId, async (tx) => {
    return tx.query.pluginInstances.findMany({
      where: eq(pluginInstances.userId, userId),
    });
  });

  const installedMap = new Map(userInstances.map((i) => [i.packageId, i]));

  return packages.map((pkg) => ({
    pkg,
    instance: installedMap.get(pkg.id) || null,
    installed: installedMap.has(pkg.id),
    compatible: true,
  }));
}

export async function getPluginPackage(packageId: string): Promise<PluginPackage | null> {
  const pkg = await db.query.pluginPackages.findFirst({
    where: eq(pluginPackages.id, packageId),
  });
  return pkg || null;
}

export async function registerPluginPackage(data: PluginPackageInsert): Promise<PluginPackage> {
  const [pkg] = await db.insert(pluginPackages).values(data).returning();
  return pkg;
}

export async function importPluginFromManifest(manifest: PluginManifest): Promise<PluginPackage> {
  const insert: PluginPackageInsert = {
    name: manifest.name,
    version: manifest.version,
    author: manifest.author,
    description: manifest.description,
    longDescription: manifest.longDescription || null,
    iconUrl: manifest.iconUrl || null,
    category: manifest.category,
    tags: manifest.tags || [],
    homepage: manifest.homepage || null,
    license: manifest.license || "MIT",
    minAppVersion: manifest.minAppVersion || "1.0.0",
    dependencies: manifest.dependencies || {},
    inputSchema: manifest.inputSchema || {},
    outputSchema: manifest.outputSchema || {},
    permissions: manifest.permissions || [],
    riskLevel: manifest.riskLevel,
    isOfficial: manifest.isOfficial || false,
  };

  const existing = await db.query.pluginPackages.findFirst({
    where: eq(pluginPackages.name, manifest.name),
  });

  if (existing) {
    const [updated] = await db.update(pluginPackages)
      .set({ ...insert, updatedAt: new Date() })
      .where(eq(pluginPackages.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(pluginPackages).values(insert).returning();
  return created;
}

// ─── Instancias ─────────────────────────────────────────────────────────────

export async function installPlugin(
  packageId: string,
  userId: string,
  projectId?: string
): Promise<PluginInstallResult> {
  const pkg = await getPluginPackage(packageId);
  if (!pkg) {
    return { success: false, instance: null, error: "Plugin package not found" };
  }

  const existing = await withRLS(userId, async (tx) => {
    return tx.query.pluginInstances.findFirst({
      where: and(
        eq(pluginInstances.packageId, packageId),
        eq(pluginInstances.userId, userId)
      ),
    });
  });

  if (existing) {
    if (!existing.enabled) {
      const [updated] = await withRLS(userId, async (tx) => {
        return tx.update(pluginInstances)
          .set({ enabled: true })
          .where(eq(pluginInstances.id, existing.id))
          .returning();
      });
      return { success: true, instance: updated };
    }
    return { success: true, instance: existing, error: "Already installed" };
  }

  await db.update(pluginPackages)
    .set({ downloadsCount: sql`${pluginPackages.downloadsCount} + 1` })
    .where(eq(pluginPackages.id, packageId));

  const insert: PluginInstanceInsert = {
    packageId,
    userId,
    projectId: projectId || null,
    enabled: true,
    config: {},
  };

  const instances = await withRLS(userId, async (tx) => {
    return tx.insert(pluginInstances).values(insert).returning();
  });
  return { success: true, instance: instances?.[0] ?? null };
}

export async function uninstallPlugin(instanceId: string, userId: string): Promise<boolean> {
  await withRLS(userId, async (tx) => {
    await tx.delete(pluginInstances).where(eq(pluginInstances.id, instanceId));
  });
  return true;
}

export async function listUserPlugins(userId: string): Promise<(PluginInstance & { pluginPackage: PluginPackage })[]> {
  const instances = await withRLS(userId, async (tx) => {
    return tx.query.pluginInstances.findMany({
      where: eq(pluginInstances.userId, userId),
    });
  });

  if (instances.length === 0) return [];

  const packageIds = instances.map((i) => i.packageId);
  const pkgs = await db.query.pluginPackages.findMany({
    where: inArray(pluginPackages.id, packageIds),
  });

  const pkgMap = new Map(pkgs.map((p) => [p.id, p]));

  return instances.map((inst) => ({
    ...inst,
    pluginPackage: pkgMap.get(inst.packageId)!,
  }));
}

export async function updatePluginConfig(
  instanceId: string,
  userId: string,
  config: Record<string, unknown>
): Promise<PluginInstance | null> {
  const [updated] = await withRLS(userId, async (tx) => {
    return tx.update(pluginInstances)
      .set({ config })
      .where(eq(pluginInstances.id, instanceId))
      .returning();
  });
  return updated || null;
}
