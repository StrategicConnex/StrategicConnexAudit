"use client";

import { useState, useTransition } from "react";
import { Globe, EyeOff, Eye, Trash2, RotateCcw, Users, FolderKanban, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { softDeleteProject, restoreProject, setProjectHidden } from "./actions";

/* ═══════════════════════════════════════════════════════════════════════
   Admin Dashboard — usuarios (telemetría) + proyectos + soft delete
   ═══════════════════════════════════════════════════════════════════════ */

export interface AdminUserRow {
  email: string;
  fullName: string | null;
  role: string;
  createdAt: string | null;
  lastLogin: string | null;
  ipAddress: string | null;
  country: string | null;
  accessCount: number;
}

export interface AdminProjectRow {
  id: string;
  name: string;
  domain: string;
  ownerEmail: string;
  createdAt: string | null;
  isDeleted: boolean;
  isHidden: boolean;
}

type Tab = "users" | "projects" | "removed";

export function AdminDashboardClient({
  users,
  projects,
  adminEmail,
}: {
  users: AdminUserRow[];
  projects: AdminProjectRow[];
  adminEmail: string;
}) {
  const [tab, setTab] = useState<Tab>("users");
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState("");

  const removed = projects.filter((p) => p.isDeleted || p.isHidden);
  const active = projects.filter((p) => !p.isDeleted && !p.isHidden);

  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" }) : "—";

  const matches = (...fields: (string | null)[]) =>
    fields.some((f) => f?.toLowerCase().includes(filter.toLowerCase()));

  const filteredUsers = users.filter((u) => matches(u.email, u.fullName, u.ipAddress, u.country));
  const filteredProjects = (tab === "removed" ? removed : active).filter((p) =>
    matches(p.name, p.domain, p.ownerEmail),
  );

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
    });

  const tabs: Array<{ id: Tab; label: string; count: number; icon: React.ReactNode }> = [
    { id: "users", label: "Usuarios", count: users.length, icon: <Users className="size-4" /> },
    { id: "projects", label: "Proyectos activos", count: active.length, icon: <FolderKanban className="size-4" /> },
    { id: "removed", label: "Eliminados / Ocultos", count: removed.length, icon: <ShieldAlert className="size-4" /> },
  ];

  return (
    <div className="max-w-7xl mx-auto p-6 sm:p-8 space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-foreground tracking-tight">Panel de Administración</h1>
          <p className="text-sm text-muted-fg mt-0.5">
            Sesión: <span className="font-mono text-2xs text-primary">{adminEmail}</span>
          </p>
        </div>
        <Badge variant="live">ADMIN</Badge>
      </header>

      {/* Tabs */}
      <nav className="flex gap-2 flex-wrap" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold border transition-colors ${
              tab === t.id
                ? "bg-primary/10 text-primary border-primary/25"
                : "text-muted-fg border-border hover:text-foreground hover:border-primary/20"
            }`}
          >
            {t.icon}
            {t.label}
            <span className="text-2xs opacity-70">({t.count})</span>
          </button>
        ))}
      </nav>

      {/* Filtro */}
      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filtrar por email, dominio, IP o país…"
        className="w-full max-w-md px-4 py-2.5 bg-input/50 border border-border rounded-xl text-sm text-foreground
                   placeholder:text-muted-fg/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50"
      />

      {/* Contenido */}
      {tab === "users" ? (
        <UserTable rows={filteredUsers} fmtDate={fmtDate} />
      ) : (
        <ProjectTable
          rows={filteredProjects}
          fmtDate={fmtDate}
          showRemoved={tab === "removed"}
          pending={pending}
          run={run}
        />
      )}
    </div>
  );
}

function UserTable({ rows, fmtDate }: { rows: AdminUserRow[]; fmtDate: (iso: string | null) => string }) {
  if (rows.length === 0) {
    return <EmptyState icon={<Users />} title="Sin usuarios que coincidan" description="Ajusta el filtro de búsqueda." />;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-2xs uppercase tracking-widest text-muted-fg">
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Rol</th>
            <th className="px-4 py-3">IP</th>
            <th className="px-4 py-3">País</th>
            <th className="px-4 py-3">Última conexión</th>
            <th className="px-4 py-3 text-right">Accesos</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.email} className="border-b border-border/50 last:border-0 hover:bg-surface-muted/50">
              <td className="px-4 py-3">
                <div className="font-medium text-foreground">{u.email}</div>
                {u.fullName && <div className="text-2xs text-muted-fg">{u.fullName}</div>}
              </td>
              <td className="px-4 py-3">
                <Badge variant={u.role === "admin" ? "live" : "neutral"}>{u.role}</Badge>
              </td>
              <td className="px-4 py-3 font-mono text-2xs text-muted-fg">{u.ipAddress ?? "—"}</td>
              <td className="px-4 py-3">{u.country ?? "—"}</td>
              <td className="px-4 py-3 text-muted-fg">{fmtDate(u.lastLogin)}</td>
              <td className="px-4 py-3 text-right font-mono text-muted-fg">{u.accessCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectTable({
  rows,
  fmtDate,
  showRemoved,
  pending,
  run,
}: {
  rows: AdminProjectRow[];
  fmtDate: (iso: string | null) => string;
  showRemoved: boolean;
  pending: boolean;
  run: (fn: () => Promise<unknown>) => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<FolderKanban />}
        title={showRemoved ? "No hay proyectos eliminados ni ocultos" : "No hay proyectos activos"}
        description={showRemoved ? "Los proyectos con soft delete u ocultos aparecerán aquí para auditoría." : undefined}
      />
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {rows.map((p) => (
        <div
          key={p.id}
          className={`rounded-2xl p-5 border bg-surface-elevated shadow-[var(--shadow-card)] space-y-3 ${
            p.isDeleted ? "border-destructive/25" : p.isHidden ? "border-chart-warning/25" : "border-border"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-foreground truncate">{p.name}</p>
              <p className="font-mono text-2xs text-muted-fg truncate">{p.domain}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              {p.isDeleted && <Badge variant="alert">eliminado</Badge>}
              {!p.isDeleted && p.isHidden && <Badge variant="neutral">oculto</Badge>}
            </div>
          </div>

          <div className="text-2xs text-muted-fg space-y-0.5">
            <p>Propietario: <span className="font-mono">{p.ownerEmail}</span></p>
            <p>Creado: {fmtDate(p.createdAt)}</p>
          </div>

          <div className="flex gap-2 pt-1">
            {p.isDeleted || p.isHidden ? (
              <ActionButton
                disabled={pending}
                onClick={() => run(() => restoreProject(p.id))}
                icon={<RotateCcw className="size-3.5" />}
                label="Restaurar"
              />
            ) : (
              <>
                <ActionButton
                  disabled={pending}
                  onClick={() => run(() => setProjectHidden(p.id, true))}
                  icon={<EyeOff className="size-3.5" />}
                  label="Ocultar"
                />
                <ActionButton
                  disabled={pending}
                  onClick={() => run(() => softDeleteProject(p.id))}
                  icon={<Trash2 className="size-3.5" />}
                  label="Eliminar"
                  danger
                />
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActionButton({
  onClick,
  icon,
  label,
  disabled,
  danger,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-2xs font-bold border transition-colors disabled:opacity-40 ${
        danger
          ? "text-destructive border-destructive/25 hover:bg-destructive/10"
          : "text-muted-fg border-border hover:text-foreground hover:border-primary/25"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
