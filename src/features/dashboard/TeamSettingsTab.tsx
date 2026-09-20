"use client";

import React, { useState } from "react";
import { UserPlus, Shield, Trash2, Mail, CheckCircle2, Clock } from "lucide-react";
import { useProjectTeam } from "@/shared/hooks/use-project-team";

interface Member {
  id: string;
  userId?: string;
  email: string;
  fullName?: string;
  role: "owner" | "admin" | "editor" | "viewer" | "guest";
  createdAt: string | null;
}

interface TeamSettingsTabProps {
  projectId: string;
}

export function TeamSettingsTab({ projectId }: TeamSettingsTabProps) {
  const {
    members,
    invitations,
    myRole,
    isLoading: loading,
    error: queryError,
    inviteMember,
    removeMember: removeMemberMutation,
    refresh,
  } = useProjectTeam(projectId);

  const canManage = myRole === "owner" || myRole === "admin";
  const loadError = queryError ? (queryError as Error).message : "";

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Member["role"]>("viewer");
  const [successMsg, setSuccessMsg] = useState("");

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    setSuccessMsg("");

    inviteMember.mutate(
      { email: inviteEmail, role: inviteRole },
      {
        onSuccess: () => {
          setSuccessMsg(`Invitación enviada a ${inviteEmail}`);
          setInviteEmail("");
        },
        onError: () => {
          setSuccessMsg("");
        },
      },
    );
  };

  const handleRemove = async (userId?: string) => {
    if (!userId || !window.confirm("¿Quitar a este miembro del proyecto?")) return;
    removeMemberMutation.mutate(userId);
  };

  const handleRescind = async (invitationId: string) => {
    // Rescind uses a different endpoint, keep as direct fetch for now
    try {
      const res = await fetch(`/api/projects/${projectId}/members?invitationId=${encodeURIComponent(invitationId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) refresh();
    } catch {
      // Error handled by query invalidation
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-100">Invitar Miembros al Equipo</h3>
            <p className="text-sm text-slate-400">
              Concede acceso colaborativo con permisos RBAC estrictos.
            </p>
          </div>
        </div>

        {canManage && (
        <form onSubmit={handleInvite} className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="correo@empresa.com"
              aria-label="Email del miembro a invitar"
              required
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as Member["role"])}
            aria-label="Rol del miembro a invitar"
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="admin">ADMIN — Control total de equipo y escaneos</option>
            <option value="editor">EDITOR — Ejecuta escaneos y gestiona hallazgos</option>
            <option value="viewer">VIEWER — Solo lectura de reportes y dashboards</option>
            <option value="guest">GUEST — Acceso restringido a reportes PDF</option>
          </select>

          <button
            type="submit"
            disabled={inviteMember.isPending}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {inviteMember.isPending ? "Enviando..." : "Enviar Invitación"}
          </button>
        </form>
        )}

        {successMsg && (
          <div className="mt-3 p-3 bg-chartreuse/10 border border-chartreuse/20 text-chartreuse rounded-lg text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{successMsg}</span>
          </div>
        )}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-400" />
            Miembros Actuales ({members.length})
          </h3>
        </div>

        <div className="divide-y divide-slate-800">
          {loading && members.length === 0 && !loadError && (
            <p className="py-3 text-sm text-slate-400">Cargando equipo…</p>
          )}
          {loadError && members.length === 0 && (
            <p className="py-3 text-sm text-destructive">{loadError}</p>
          )}
          {members.map((member) => (
            <div key={member.id} className="py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-200">
                  {member.fullName || member.email}
                </p>
                <p className="text-xs text-slate-400">{member.email}</p>
              </div>

              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 text-xs font-mono rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 uppercase">
                  {member.role}
                </span>

                {member.role !== "owner" && member.userId && canManage && (
                  <button
                    onClick={() => handleRemove(member.userId)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                    title="Remover miembro"
                    aria-label={`Remover a ${member.email}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            ))}
          </div>
        </div>

      {invitations.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
          <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-indigo-400" />
            Invitaciones pendientes ({invitations.length})
          </h3>
          <div className="divide-y divide-slate-800">
            {invitations.map((inv) => (
              <div key={inv.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-200">{inv.email}</p>
                  <p className="text-xs text-slate-400">
                    Rol {inv.role} · vence {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                {canManage && (
                <button
                  onClick={() => handleRescind(inv.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                  title="Anular invitación"
                  aria-label={`Anular invitación a ${inv.email}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
