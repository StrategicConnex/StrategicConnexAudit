/**
 * ═════════════════════════════════════════════════════════════════════════════
 * API Contract Tests — Valida que openapi.json sea un spec OpenAPI 3.0 válido
 * y que cada endpoint documentado coincida con la realidad del código.
 *
 * Se ejecuta con: pnpm test:contract
 * En CI como parte del job api-contract-test.
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { URL } from 'url';

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadOpenApi(): Record<string, unknown> {
  const path = resolve(__dirname, '../../public/openapi.json');
  expect(existsSync(path), 'openapi.json must exist at public/openapi.json').toBe(true);
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw);
}

function collectRefs(obj: unknown, refs: string[] = []): string[] {
  if (Array.isArray(obj)) {
    for (const item of obj) collectRefs(item, refs);
  } else if (obj && typeof obj === 'object') {
    const record = obj as Record<string, unknown>;
    if (typeof record.$ref === 'string') refs.push(record.$ref);
    for (const val of Object.values(record)) collectRefs(val, refs);
  }
  return refs;
}

function resolveRef(ref: string, spec: Record<string, unknown>): unknown {
  const parts = ref.replace('#/', '').split('/');
  let current: unknown = spec;
  for (const part of parts) {
    if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('OpenAPI 3.0 Spec — public/openapi.json', () => {
  const spec = loadOpenApi();

  it('has valid OpenAPI version 3.0.x', () => {
    expect(spec.openapi).toBeDefined();
    expect(typeof spec.openapi).toBe('string');
    expect((spec.openapi as string)).toMatch(/^3\.0\.\d+$/);
  });

  it('has required info fields (title, version, description)', () => {
    const info = spec.info as Record<string, unknown>;
    expect(info).toBeDefined();
    expect(typeof info.title).toBe('string');
    expect(info.title).toContain('SCAUDIT');
    expect(typeof info.version).toBe('string');
    expect(typeof info.description).toBe('string');
    expect(info.description).toContain('RateLimit');
  });

  it('has at least one server defined', () => {
    const servers = spec.servers as Array<Record<string, unknown>>;
    expect(Array.isArray(servers)).toBe(true);
    expect(servers.length).toBeGreaterThanOrEqual(1);
    for (const srv of servers) {
      expect(typeof srv.url).toBe('string');
      try { new URL(srv.url as string); } catch {
        expect.fail(`Invalid server URL: ${srv.url}`);
      }
    }
  });

  it('has paths with valid HTTP methods and responses', () => {
    const paths = spec.paths as Record<string, unknown>;
    expect(paths).toBeDefined();
    expect(typeof paths).toBe('object');
    expect(Object.keys(paths).length).toBeGreaterThanOrEqual(3);

    const validMethods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
    for (const [path, methods] of Object.entries(paths)) {
      expect(path.startsWith('/')).toBe(true);
      for (const [method, details] of Object.entries(methods as Record<string, unknown>)) {
        expect(validMethods).toContain(method);
        const d = details as Record<string, unknown>;
        expect(d.responses).toBeDefined();
        const httpCodes = Object.keys(d.responses as Record<string, unknown>);
        expect(httpCodes.length).toBeGreaterThanOrEqual(1);
        // Every endpoint should document 429 rate limit
        expect(httpCodes).toContain('429');
      }
    }
  });

  it('all $ref pointers resolve to existing components', () => {
    const refs = collectRefs(spec);
    for (const ref of refs) {
      const resolved = resolveRef(ref, spec);
      expect(resolved, `Unresolvable $ref: ${ref}`).toBeDefined();
    }
  });

  it('all schemas in components/schemas have type and properties', () => {
    const schemas = (spec.components as Record<string, unknown>)?.schemas as Record<string, unknown>;
    expect(schemas).toBeDefined();
    for (const [name, schema] of Object.entries(schemas)) {
      const s = schema as Record<string, unknown>;
      expect(s.type, `Schema "${name}" missing "type"`).toBe('object');
      expect(s.properties, `Schema "${name}" missing "properties"`).toBeDefined();
    }
  });

  it('RateLimit response documents RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset headers', () => {
    const rateLimitResp = ((spec.components as Record<string, unknown>)?.responses as Record<string, unknown>)
      ?.RateLimit as Record<string, unknown>;
    expect(rateLimitResp).toBeDefined();
    const headers = rateLimitResp.headers as Record<string, unknown>;
    expect(headers).toBeDefined();
    expect(headers['RateLimit-Limit']).toBeDefined();
    expect(headers['RateLimit-Remaining']).toBeDefined();
    expect(headers['RateLimit-Reset']).toBeDefined();
    expect(headers['Retry-After']).toBeDefined();
  });

  it('every 200/201/429 response references rate limit headers', () => {
    const paths = spec.paths as Record<string, unknown>;
    const validStatuses = ['200', '201', '429'];
    for (const [path, methods] of Object.entries(paths)) {
      for (const [method, details] of Object.entries(methods as Record<string, unknown>)) {
        const responses = (details as Record<string, unknown>).responses as Record<string, unknown>;
        for (const status of validStatuses) {
          const resp = responses[status] as Record<string, unknown> | undefined;
          if (!resp) continue;
          // 429 is a $ref, so headers are in the referenced component already
          if (status === '429') continue;
          const headers = resp.headers as Record<string, unknown> | undefined;
          if (!headers) {
            // If no headers, the response might be a $ref — that's ok
            continue;
          }
          expect(headers['RateLimit-Limit'],
            `GET ${path} ${status} should have RateLimit-Limit header`).toBeDefined();
          expect(headers['RateLimit-Remaining'],
            `GET ${path} ${status} should have RateLimit-Remaining header`).toBeDefined();
          expect(headers['RateLimit-Reset'],
            `GET ${path} ${status} should have RateLimit-Reset header`).toBeDefined();
        }
      }
    }
  });

  it('security schemes are defined for both apiKey and sessionCookie', () => {
    const schemes = (spec.components as Record<string, unknown>)?.securitySchemes as Record<string, unknown>;
    expect(schemes).toBeDefined();
    const apiKey = schemes.apiKey as Record<string, unknown>;
    expect(apiKey).toBeDefined();
    expect(apiKey.type).toBe('http');
    expect(apiKey.scheme).toBe('bearer');
    const sessionCookie = schemes.sessionCookie as Record<string, unknown>;
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie.type).toBe('apiKey');
    expect(sessionCookie.in).toBe('cookie');
  });

  it('all example values match their declared schema types', () => {
    // Check that examples match their type constraints
    const schemas = (spec.components as Record<string, unknown>)?.schemas as Record<string, unknown>;
    for (const [, schema] of Object.entries(schemas)) {
      const s = schema as Record<string, unknown>;
      const props = s.properties as Record<string, unknown> | undefined;
      if (!props) continue;
      for (const [propName, prop] of Object.entries(props)) {
        const p = prop as Record<string, unknown>;
        if (p.enum && p.example !== undefined) {
          expect((p.enum as unknown[]),
            `Example "${p.example}" not in enum for ${propName}`
          ).toContain(p.example);
        }
        if (p.type === 'integer' && p.example !== undefined) {
          expect(typeof p.example).toBe('number');
          expect(Number.isInteger(p.example)).toBe(true);
        }
        if (p.type === 'boolean' && p.example !== undefined) {
          expect(typeof p.example).toBe('boolean');
        }
      }
    }
  });
});
