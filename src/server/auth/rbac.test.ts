import { describe, it, expect } from "vitest";
import {
  hasRolePermission,
  canPerformAction,
  checkPermission,
  rolePermissions,
  type PermissionAction,
  type Permission,
  type ProjectResource,
  type ProjectRole,
} from "./rbac";

const ROLES: readonly ProjectRole[] = ["owner", "admin", "editor", "viewer", "guest"];

describe("rbac — jerarquía de roles", () => {
  it("rol superior o igual satisface el rol requerido", () => {
    expect(hasRolePermission("owner", "admin")).toBe(true);
    expect(hasRolePermission("admin", "editor")).toBe(true);
    expect(hasRolePermission("viewer", "viewer")).toBe(true);
    expect(hasRolePermission("guest", "guest")).toBe(true);
  });

  it("rol inferior no satisface el rol requerido", () => {
    expect(hasRolePermission("viewer", "editor")).toBe(false);
    expect(hasRolePermission("editor", "admin")).toBe(false);
    expect(hasRolePermission("admin", "owner")).toBe(false);
    expect(hasRolePermission("guest", "viewer")).toBe(false);
  });

  it("rol desconocido nunca alcanza permisos", () => {
    expect(hasRolePermission("root" as ProjectRole, "guest")).toBe(false);
  });
});

describe("rbac — canPerformAction (acciones existentes)", () => {
  it("acciones según rol mínimo", () => {
    expect(canPerformAction("owner", "project:delete")).toBe(true);
    expect(canPerformAction("admin", "project:delete")).toBe(false);
    expect(canPerformAction("admin", "project:update")).toBe(true);
    expect(canPerformAction("editor", "project:update")).toBe(false);
    expect(canPerformAction("admin", "members:manage")).toBe(true);
    expect(canPerformAction("viewer", "members:manage")).toBe(false);
    expect(canPerformAction("viewer", "members:view")).toBe(true);
    expect(canPerformAction("editor", "scan:execute")).toBe(true);
    expect(canPerformAction("viewer", "scan:execute")).toBe(false);
    expect(canPerformAction("guest", "report:view")).toBe(true);
    expect(canPerformAction("viewer", "report:export")).toBe(true);
    expect(canPerformAction("guest", "report:export")).toBe(false);
    expect(canPerformAction("admin", "apikeys:manage")).toBe(true);
  });
});

describe("rbac — matriz rolePermissions (plan 4.4)", () => {
  it("cubre los 5 roles de projectRoleEnum", () => {
    expect(Object.keys(rolePermissions).sort()).toEqual(
      ["admin", "editor", "guest", "owner", "viewer"]
    );
  });

  it("owner tiene todos los permisos; guest solo reports:read", () => {
    const total = Object.values(rolePermissions).reduce(
      (max, set) => Math.max(max, set.size),
      0
    );
    expect(rolePermissions.owner.size).toBe(total);
    expect([...rolePermissions.guest]).toEqual(["reports:read"]);
  });

  it("la jerarquía es monotónica: cada rol contiene los del rol inferior", () => {
    const order: readonly ProjectRole[] = ["guest", "viewer", "editor", "admin", "owner"];
    for (let i = 1; i < order.length; i++) {
      const lower = rolePermissions[order[i - 1]!];
      const higher = rolePermissions[order[i]!];
      for (const permission of lower) {
        expect(higher.has(permission), `${order[i]} debería heredar ${permission}`).toBe(true);
      }
    }
  });

  it("recuentos esperados por rol (22 pares en total)", () => {
    expect(rolePermissions.guest.size).toBe(1);
    expect(rolePermissions.viewer.size).toBe(7);
    expect(rolePermissions.editor.size).toBe(10);
    expect(rolePermissions.admin.size).toBe(19);
    expect(rolePermissions.owner.size).toBe(22);
  });

  it("es consistente con las acciones históricas de canPerformAction", () => {
    const pairs: [PermissionAction, Permission, ProjectResource][] = [
      ["members:view", "read", "members"],
      ["members:manage", "manage", "members"],
      ["project:update", "write", "settings"],
      ["apikeys:manage", "manage", "settings"],
      ["scan:execute", "write", "audits"],
      ["report:view", "read", "reports"],
      ["report:export", "export", "reports"],
    ];
    for (const role of ROLES) {
      for (const [action, permission, resource] of pairs) {
        expect(
          checkPermission(role, permission, resource),
          `${role}: ${action} vs ${resource}:${permission}`
        ).toBe(canPerformAction(role, action));
      }
    }
  });
});

describe("rbac — checkPermission(role, permission, resource)", () => {
  it("audit-log solo owner/admin", () => {
    expect(checkPermission("owner", "read", "audit-log")).toBe(true);
    expect(checkPermission("admin", "read", "audit-log")).toBe(true);
    expect(checkPermission("editor", "read", "audit-log")).toBe(false);
    expect(checkPermission("viewer", "read", "audit-log")).toBe(false);
    expect(checkPermission("owner", "manage", "audit-log")).toBe(true);
    expect(checkPermission("admin", "manage", "audit-log")).toBe(false);
  });

  it("members: lectura desde viewer, gestión desde admin", () => {
    expect(checkPermission("viewer", "read", "members")).toBe(true);
    expect(checkPermission("guest", "read", "members")).toBe(false);
    expect(checkPermission("admin", "manage", "members")).toBe(true);
    expect(checkPermission("editor", "manage", "members")).toBe(false);
  });

  it("keywords: escritura desde editor", () => {
    expect(checkPermission("editor", "write", "keywords")).toBe(true);
    expect(checkPermission("viewer", "write", "keywords")).toBe(false);
    expect(checkPermission("owner", "manage", "keywords")).toBe(true);
  });

  it("reports: guest lee, viewer exporta", () => {
    expect(checkPermission("guest", "read", "reports")).toBe(true);
    expect(checkPermission("viewer", "export", "reports")).toBe(true);
    expect(checkPermission("guest", "export", "reports")).toBe(false);
  });

  it("billing: owner escribe, viewer solo lee", () => {
    expect(checkPermission("viewer", "read", "billing")).toBe(true);
    expect(checkPermission("admin", "write", "billing")).toBe(false);
    expect(checkPermission("owner", "write", "billing")).toBe(true);
    expect(checkPermission("owner", "manage", "billing")).toBe(true);
  });

  it("settings: editor no escribe", () => {
    expect(checkPermission("editor", "read", "settings")).toBe(true);
    expect(checkPermission("editor", "write", "settings")).toBe(false);
    expect(checkPermission("admin", "write", "settings")).toBe(true);
  });
});
