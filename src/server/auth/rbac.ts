export type ProjectRole = "owner" | "admin" | "editor" | "viewer" | "guest";

const ROLE_WEIGHTS: Record<ProjectRole, number> = {
  owner: 100,
  admin: 80,
  editor: 60,
  viewer: 40,
  guest: 20,
};

export function hasRolePermission(userRole: ProjectRole, requiredRole: ProjectRole): boolean {
  const userWeight = ROLE_WEIGHTS[userRole] ?? 0;
  const requiredWeight = ROLE_WEIGHTS[requiredRole] ?? 100;
  return userWeight >= requiredWeight;
}

export type PermissionAction =
  | "project:delete"
  | "project:update"
  | "members:manage"
  | "members:view"
  | "scan:execute"
  | "report:view"
  | "report:export"
  | "apikeys:manage";

const ACTION_PERMISSIONS: Record<PermissionAction, ProjectRole> = {
  "project:delete": "owner",
  "project:update": "admin",
  "members:manage": "admin",
  "members:view": "viewer",
  "scan:execute": "editor",
  "report:view": "guest",
  "report:export": "viewer",
  "apikeys:manage": "admin",
};

export function canPerformAction(userRole: ProjectRole, action: PermissionAction): boolean {
  const requiredRole = ACTION_PERMISSIONS[action];
  if (!requiredRole) return false;
  return hasRolePermission(userRole, requiredRole);
}

export type ProjectResource =
  | "members"
  | "settings"
  | "audits"
  | "reports"
  | "keywords"
  | "billing"
  | "audit-log";

export type Permission = "read" | "write" | "manage" | "export";

export type ResourcePermission = `${ProjectResource}:${Permission}`;

const MIN_ROLE_BY_RESOURCE: Record<ProjectResource, Partial<Record<Permission, ProjectRole>>> = {
  members: { read: "viewer", write: "admin", manage: "admin" },
  settings: { read: "viewer", write: "admin", manage: "admin" },
  audits: { read: "viewer", write: "editor", manage: "admin" },
  reports: { read: "guest", write: "editor", manage: "admin", export: "viewer" },
  keywords: { read: "viewer", write: "editor", manage: "admin" },
  billing: { read: "viewer", write: "owner", manage: "owner" },
  "audit-log": { read: "admin", write: "admin", manage: "owner" },
};

const ALL_ROLES: readonly ProjectRole[] = ["owner", "admin", "editor", "viewer", "guest"];

function buildRolePermissions(): Record<ProjectRole, ReadonlySet<ResourcePermission>> {
  const matrix: Record<ProjectRole, Set<ResourcePermission>> = {
    owner: new Set(),
    admin: new Set(),
    editor: new Set(),
    viewer: new Set(),
    guest: new Set(),
  };
  for (const resource of Object.keys(MIN_ROLE_BY_RESOURCE) as ProjectResource[]) {
    const entries = Object.entries(MIN_ROLE_BY_RESOURCE[resource]) as [
      Permission,
      ProjectRole | undefined,
    ][];
    for (const [permission, minRole] of entries) {
      if (!minRole) continue;
      for (const role of ALL_ROLES) {
        if (hasRolePermission(role, minRole)) {
          matrix[role].add(`${resource}:${permission}`);
        }
      }
    }
  }
  return matrix;
}

export const rolePermissions: Record<ProjectRole, ReadonlySet<ResourcePermission>> =
  buildRolePermissions();

export function checkPermission(
  role: ProjectRole,
  permission: Permission,
  resource: ProjectResource
): boolean {
  const permissions: ReadonlySet<ResourcePermission> | undefined = rolePermissions[role];
  return permissions?.has(`${resource}:${permission}`) ?? false;
}
