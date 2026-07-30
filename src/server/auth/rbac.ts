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
