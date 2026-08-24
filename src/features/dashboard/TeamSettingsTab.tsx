"use client";

import React, { useState } from "react";
import { UserPlus, Shield, Trash2, Mail, CheckCircle2 } from "lucide-react";

interface Member {
  id: string;
  email: string;
  fullName?: string;
  role: "owner" | "admin" | "editor" | "viewer" | "guest";
  createdAt: string;
}

interface TeamSettingsTabProps {
  projectId: string;
}

export function TeamSettingsTab({ projectId }: TeamSettingsTabProps) {
  const [members, setMembers] = useState<Member[]>([
    {
      id: "mem_1",
      email: "owner@company.com",
      fullName: "Lead Architect",
      role: "owner",
      createdAt: new Date().toISOString(),
    },
    {
      id: "mem_2",
      email: "secops@company.com",
      fullName: "Security Ops",
      role: "editor",
      createdAt: new Date().toISOString(),
    },
  ]);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Member["role"]>("viewer");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;

    setIsSubmitting(true);
    setSuccessMsg("");

    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();

      if (data.success) {
        setSuccessMsg(`Invitación enviada a ${inviteEmail}`);
        setInviteEmail("");
      }
    } catch {
      // Fallback local update for preview
      setSuccessMsg(`Invitación simulada enviada a ${inviteEmail}`);
      setInviteEmail("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = (id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
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

        <form onSubmit={handleInvite} className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="correo@empresa.com"
              required
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as Member["role"])}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="admin">ADMIN — Control total de equipo y escaneos</option>
            <option value="editor">EDITOR — Ejecuta escaneos y gestiona hallazgos</option>
            <option value="viewer">VIEWER — Solo lectura de reportes y dashboards</option>
            <option value="guest">GUEST — Acceso restringido a reportes PDF</option>
          </select>

          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isSubmitting ? "Enviando..." : "Enviar Invitación"}
          </button>
        </form>

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

                {member.role !== "owner" && (
                  <button
                    onClick={() => handleRemove(member.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                    title="Remover miembro"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
