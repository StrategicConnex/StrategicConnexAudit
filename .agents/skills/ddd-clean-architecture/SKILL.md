---
name: ddd-clean-architecture
description: "Expert in Domain-Driven Design and Clean Architecture patterns used in SCAUDIT modules. Covers domain entities, value objects, repositories, application services, infrastructure adapters, and presentation layers."
risk: safe
source: strategicaudit-pro-custom
date_added: "2026-08-29"
tags:
  - ddd
  - clean-architecture
  - domain-driven-design
  - modules
  - entities
  - repositories
  - value-objects
---

# DDD & Clean Architecture Expert

Expert in the Domain-Driven Design and Clean Architecture patterns used across SCAUDIT's business modules. Covers the layered architecture: Domain → Application → Infrastructure → Presentation.

## When to Use This Skill

- When creating or modifying modules in `src/modules/`
- When working with domain entities, value objects, or repositories
- When building application services or use cases
- When implementing infrastructure adapters (DB, external APIs)
- When creating presentation components (UI, server actions)
- When refactoring existing modules to follow clean architecture

## Architecture Layers

Each module follows this structure:

```
src/modules/{module-name}/
├── domain/
│   ├── entities/          # Core business objects
│   ├── repositories/      # Repository interfaces (ports)
│   └── value-objects/     # Immutable domain values
├── application/
│   ├── services/          # Use cases / application services
│   └── dto/               # Data Transfer Objects
├── infrastructure/
│   ├── repositories/      # Repository implementations (adapters)
│   ├── external/          # External API adapters
│   └── mappers/           # Data mappers (DB ↔ Entity)
└── presentation/
    ├── components/        # React components
    ├── hooks/             # Custom React hooks
    └── server-actions/    # Next.js server actions
```

## Core Concepts

### Domain Entities

Core business objects with identity (ID).

```typescript
// domain/entities/audit.ts
export interface Audit {
  id: string;                    // Identity
  projectId: string;             // Required reference
  type: AuditType;               // Value object
  status: AuditStatus;           // Value object
  config: AuditConfig;           // Value object
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  createdBy: string | null;
  createdAt: Date;
}
```

**Rules:**
- Entities have identity (`id` field)
- Entities contain business logic methods
- Entities reference other entities by ID, not by embedding
- Never put infrastructure concerns in domain entities
- Domain entities map 1:1 with database tables (via Drizzle schema)

### Value Objects

Immutable domain concepts without identity.

```typescript
// domain/value-objects/audit-type.ts
export type AuditType = "crawl" | "performance" | "technical" | "full";

// domain/value-objects/audit-config.ts
export interface AuditConfig {
  crawlDepth: number;
  userAgent: string;
  respectsRobotsTxt: boolean;
  maxPages: number;
}
```

**Rules:**
- Value objects are immutable
- Value objects are compared by value, not identity
- Value objects can be simple types or complex structures
- Use Zod schemas for validation of value objects

### Repository Interfaces (Ports)

Define data access contracts without implementation details.

```typescript
// domain/repositories/audit-repository.ts
export interface AuditRepository {
  findById(id: string): Promise<Audit | null>;
  findByProjectId(projectId: string): Promise<Audit[]>;
  create(data: CreateAuditInput): Promise<Audit>;
  updateStatus(id: string, status: AuditStatus): Promise<void>;
  delete(id: string): Promise<void>;
}
```

**Rules:**
- Repository interfaces live in `domain/`
- Interfaces define what, not how
- No database-specific types in interfaces
- Methods return domain entities, not raw DB rows
- Use DTOs for complex input parameters

### Application Services (Use Cases)

Orchestrate business logic using domain entities and repositories.

```typescript
// application/services/create-audit.ts
export class CreateAuditService {
  constructor(
    private auditRepo: AuditRepository,
    private projectRepo: ProjectRepository,
  ) {}

  async execute(input: CreateAuditInput): Promise<Audit> {
    // 1. Validate input
    const project = await this.projectRepo.findById(input.projectId);
    if (!project) throw new NotFoundError("Project", input.projectId);

    // 2. Apply business rules
    if (project.isDeleted) throw new BusinessError("Cannot audit deleted project");

    // 3. Create entity
    const audit = await this.auditRepo.create({
      projectId: input.projectId,
      type: input.type,
      config: input.config ?? defaultConfig,
    });

    // 4. Trigger side effects
    await auditTrigger.task(audit);

    return audit;
  }
}
```

**Rules:**
- Services contain business logic, not infrastructure
- Services use repository interfaces, not implementations
- Services throw domain errors, not HTTP errors
- Services are constructor-injected (no global imports)
- One service per use case (single responsibility)

### Infrastructure Adapters

Implement repository interfaces and external integrations.

```typescript
// infrastructure/repositories/drizzle-audit-repository.ts
export class DrizzleAuditRepository implements AuditRepository {
  constructor(private db: DrizzleDB) {}

  async findById(id: string): Promise<Audit | null> {
    const row = await this.db.query.audits.findFirst({
      where: eq(audits.id, id),
    });
    return row ? AuditMapper.toDomain(row) : null;
  }

  async create(data: CreateAuditInput): Promise<Audit> {
    const [row] = await this.db.insert(audits)
      .values(AuditMapper.toPersistence(data))
      .returning();
    return AuditMapper.toDomain(row);
  }
}
```

**Rules:**
- Adapters implement domain interfaces
- Adapters handle all infrastructure concerns (DB, API, cache)
- Mappers convert between DB rows and domain entities
- Adapters are the only layer that imports Drizzle/external libs

### Mappers

Convert between persistence format and domain format.

```typescript
// infrastructure/mappers/audit-mapper.ts
export class AuditMapper {
  static toDomain(row: typeof audits.$inferSelect): Audit {
    return {
      id: row.id,
      projectId: row.projectId,
      type: row.type,
      status: row.status,
      config: row.config as AuditConfig,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      errorMessage: row.errorMessage,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
    };
  }

  static toPersistence(entity: CreateAuditInput) {
    return {
      projectId: entity.projectId,
      type: entity.type,
      config: entity.config,
    };
  }
}
```

### Presentation Layer

React components and server actions that consume application services.

```typescript
// presentation/server-actions/create-audit-action.ts
"use server";

export async function createAuditAction(projectId: string, type: AuditType) {
  const user = await requireAuth();
  const service = new CreateAuditService(auditRepo, projectRepo);
  
  try {
    const audit = await service.execute({ projectId, type });
    revalidatePath(`/projects/${projectId}`);
    return { success: true, audit };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

## Dependency Rule

Dependencies point inward: Presentation → Application → Domain

```
Domain ← Application ← Infrastructure
  ↑           ↑              ↑
  │           │              │
  └───── No dependencies outward ─────┘
```

**Rules:**
- Domain has ZERO external dependencies
- Application depends only on Domain
- Infrastructure implements Domain interfaces
- Presentation calls Application services

## Module Naming Conventions

| Module | Purpose | Key Tables |
|--------|---------|------------|
| `audit` | Audit execution and results | audits, crawlResults, performanceResults |
| `keywords` | Keyword tracking and rank history | keywordTargets, rankHistory |
| `schema` | Schema validation (JSON-LD) | schemaValidations |
| `integrations` | External platform connections | integrations, integrationData* |

## Creating a New Module

1. **Create the directory structure** under `src/modules/`
2. **Define domain entities** with TypeScript interfaces
3. **Define repository interfaces** (ports)
4. **Implement application services** with business logic
5. **Implement infrastructure adapters** (Drizzle repositories)
6. **Create mappers** for DB ↔ Entity conversion
7. **Build presentation components** consuming services
8. **Write tests** at each layer
9. **Register module** in the barrel exports

## Sharp Edges

### Anemic domain model
**Problem:** Entities are just data bags with no behavior.
**Fix:** Move business logic INTO entity methods. If `audit.canStart()` is a rule, it belongs on the `Audit` entity.

### God service
**Problem:** Application service does too much (validation + business + infra).
**Fix:** Split into smaller services. Each service handles one use case.

### Leaky abstraction
**Problem:** Domain layer imports Drizzle or HTTP libraries.
**Fix:** Domain must have zero infrastructure dependencies. Use dependency injection.

### Circular dependency
**Problem:** Module A imports Module B which imports Module A.
**Fix:** Extract shared concepts into a third module or use dependency injection.

## Validation Checklist

Before modifying a module:

- [ ] Domain entities have no infrastructure imports
- [ ] Repository interfaces are in `domain/`
- [ ] Application services use dependency injection
- [ ] Infrastructure adapters implement domain interfaces
- [ ] Mappers handle null/undefined correctly
- [ ] Presentation layer calls application services, not repositories directly
- [ ] Tests exist at each layer
- [ ] No circular dependencies between modules

## Related Skills
- `drizzle-orm-expert` (ORM patterns)
- `drizzle-migrations` (schema evolution)
- `zod-validation-expert` (input validation)
- `nextjs-best-practices` (App Router patterns)

## When to Use
- User mentions modules, entities, repositories, or clean architecture
- User needs to create a new business module
- User asks about DDD patterns or domain modeling
- User needs to refactor code into proper layers

## Limitations
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
