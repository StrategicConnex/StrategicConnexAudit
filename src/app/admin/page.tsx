import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/shared/lib/supabase/server";
import { requireAdmin } from "@/server/auth/admin";
import { directDb } from "@/shared/db";
import { users, userLogs, projects, audits, aiReportJobs } from "@/shared/db/schemas";
import { desc, eq } from "drizzle-orm";
import { AdminDashboardClient, type AdminUserRow, type AdminProjectRow } from "./admin-dashboard.client";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // 1. Sesión
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 2. Gate por rol de plataforma (P1-6): users.role = 'admin'. Sin emails
  // hardcodeados; el middleware ya filtró por lista ADMIN_EMAILS.
  const gate = await requireAdmin();
  if (!gate.ok) {
    return <AccessDenied />;
  }

  // 3. Datos (conexión de servicio: el admin ve TODO, incluidos borrados/ocultos)
  const [userRows, projectRows] = await Promise.all([
    directDb
      .select({
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        createdAt: users.createdAt,
        lastLogin: userLogs.lastLogin,
        ipAddress: userLogs.ipAddress,
        country: userLogs.country,
        accessCount: userLogs.accessCount,
      })
      .from(users)
      .leftJoin(userLogs, eq(userLogs.userId, users.id))
      .orderBy(desc(userLogs.lastLogin)),
    directDb
      .select({
        id: projects.id,
        name: projects.name,
        domain: projects.domain,
        createdAt: projects.createdAt,
        isDeleted: projects.isDeleted,
        isHidden: projects.isHidden,
        deletedAt: projects.deletedAt,
        ownerEmail: users.email,
      })
      .from(projects)
      .leftJoin(users, eq(projects.ownerId, users.id))
      .orderBy(desc(projects.createdAt)),
  ]);

  const usersData: AdminUserRow[] = userRows.map((r) => ({
    email: r.email,
    fullName: r.fullName,
    role: r.role,
    createdAt: r.createdAt?.toISOString() ?? null,
    lastLogin: r.lastLogin?.toISOString() ?? r.createdAt?.toISOString() ?? null,
    ipAddress: r.ipAddress,
    country: r.country,
    accessCount: r.accessCount ?? 0,
  }));

  const projectsData: AdminProjectRow[] = projectRows.map((r) => ({
    id: r.id,
    name: r.name,
    domain: r.domain,
    ownerEmail: r.ownerEmail ?? "—",
    createdAt: r.createdAt?.toISOString() ?? null,
    isDeleted: r.isDeleted || r.deletedAt !== null,
    isHidden: r.isHidden,
  }));

  // B-5: funnel de activación del producto (proyecto → auditoría → informe).
  const [projectsWithAudit, projectsWithReport] = await Promise.all([
    directDb
      .select({ projectId: audits.projectId })
      .from(audits)
      .groupBy(audits.projectId),
    directDb
      .select({ projectId: aiReportJobs.projectId })
      .from(aiReportJobs)
      .where(eq(aiReportJobs.status, "completed"))
      .groupBy(aiReportJobs.projectId),
  ]);
  const funnel = {
    users: userRows.length,
    projects: projectRows.filter((p) => !p.isDeleted && !p.isHidden && p.deletedAt === null).length,
    withAudit: new Set(projectsWithAudit.map((r) => r.projectId)).size,
    withReport: new Set(projectsWithReport.map((r) => r.projectId)).size,
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Usuarios", value: funnel.users },
          { label: "Proyectos activos", value: funnel.projects },
          { label: "Con auditoría", value: funnel.withAudit },
          { label: "Con informe", value: funnel.withReport },
        ].map((s) => (
          <div key={s.label} className="glass-card p-5 text-center">
            <p className="text-3xl font-black">{s.value}</p>
            <p className="text-2xs text-muted-fg uppercase tracking-widest mt-1">{s.label}</p>
          </div>
        ))}
      </div>
      <Suspense fallback={<div className="p-8 text-muted-fg">Cargando panel…</div>}>
        <AdminDashboardClient users={usersData} projects={projectsData} adminEmail={user.email ?? "—"} />
      </Suspense>
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="glass-card rounded-2xl p-8 max-w-md text-center space-y-4">
        <h1 className="text-xl font-bold text-foreground">Acceso restringido</h1>
        <p className="text-sm text-muted-fg leading-relaxed">
          Este panel es exclusivo del administrador de la plataforma.
        </p>
      </div>
    </div>
  );
}
