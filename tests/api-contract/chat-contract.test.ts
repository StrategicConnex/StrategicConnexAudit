/**
 * Contrato estructural de chat — Sprint 2 (C5/C6/C7).
 *
 * Verifica que public/openapi.json y docs/chat/CHAT-CONTRACT.md documenten
 * el transporte SSE, las referencias verificadas, la sugerencia server-side
 * y la deuda TD-24 sin código de runtime.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

type JsonRecord = Record<string, unknown>;

function loadJson(path: string): JsonRecord {
  expect(existsSync(path), `${path} must exist`).toBe(true);
  return JSON.parse(readFileSync(path, 'utf-8')) as JsonRecord;
}

function get(value: unknown, ...keys: string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as JsonRecord)[key];
  }
  return current;
}

function resolveRef(spec: JsonRecord, schema: unknown): unknown {
  const ref = get(schema, '$ref');
  if (typeof ref !== 'string') return schema;
  return get(spec, ...ref.replace('#/', '').split('/'));
}

function expectRateLimitHeaders(operation: unknown): void {
  expect(get(operation, 'headers', 'RateLimit-Limit', '$ref')).toBe(
    '#/components/headers/RateLimit-Limit',
  );
  expect(get(operation, 'headers', 'RateLimit-Remaining', '$ref')).toBe(
    '#/components/headers/RateLimit-Remaining',
  );
  expect(get(operation, 'headers', 'RateLimit-Reset', '$ref')).toBe(
    '#/components/headers/RateLimit-Reset',
  );
}

describe('Chat contract — OpenAPI', () => {
  const spec = loadJson(resolve(__dirname, '../../public/openapi.json'));

  it('documenta POST /api/ai/copilot con sesión, historia y stream opcional', () => {
    const post = get(spec, 'paths', '/api/ai/copilot', 'post');
    expect(post).toBeDefined();
    expect(get(post, 'security', '0', 'sessionCookie')).toEqual([]);

    const requestSchema = resolveRef(
      spec,
      get(post, 'requestBody', 'content', 'application/json', 'schema'),
    );
    expect(get(requestSchema, 'required')).toEqual(expect.arrayContaining(['messages']));
    expect(get(requestSchema, 'properties', 'stream', 'type')).toBe('boolean');
    expect(get(requestSchema, 'properties', 'stream', 'default')).toBe(false);
    expect(get(requestSchema, 'properties', 'messages', 'items', '$ref')).toBe(
      '#/components/schemas/ChatTurn',
    );
    expect(get(requestSchema, 'properties', 'intelligenceContext', 'additionalProperties')).toBe(
      false,
    );
  });

  it('documenta stream opcional en el plan de remediación', () => {
    const post = get(spec, 'paths', '/api/intelligence/copilot', 'post');
    expect(post).toBeDefined();

    const requestSchema = get(
      post,
      'requestBody',
      'content',
      'application/json',
      'schema',
    );
    expect(get(requestSchema, 'required')).toEqual(expect.arrayContaining(['investigationId']));
    expect(get(requestSchema, 'properties', 'stream', 'type')).toBe('boolean');
    expect(get(requestSchema, 'properties', 'stream', 'default')).toBe(false);
  });

  it('publica JSON y SSE en ambas respuestas 200 sin perder RateLimit', () => {
    for (const path of ['/api/ai/copilot', '/api/intelligence/copilot']) {
      const ok = get(spec, 'paths', path, 'post', 'responses', '200');
      const content = get(ok, 'content') as JsonRecord;
      expect(Object.keys(content), path).toEqual(
        expect.arrayContaining(['application/json', 'text/event-stream']),
      );
      expect(get(content, 'text/event-stream', 'schema', 'type')).toBe('string');
      expect(String(get(content, 'text/event-stream', 'description'))).toMatch(/SSE/);
      expectRateLimitHeaders(ok);
    }
  });

  it('define ChatStreamEvent, ChatReference y ChatSuggestion coherentes', () => {
    const event = get(spec, 'components', 'schemas', 'ChatStreamEvent');
    expect(get(event, 'type')).toBe('object');
    expect(get(event, 'properties', 'type', 'enum')).toEqual(['chunk', 'done', 'error']);
    expect(get(event, 'properties', 'references', 'items', '$ref')).toBe(
      '#/components/schemas/ChatReference',
    );
    expect(get(event, 'properties', 'suggestion', 'nullable')).toBe(true);

    const reference = get(spec, 'components', 'schemas', 'ChatReference');
    expect(get(reference, 'required')).toEqual(expect.arrayContaining(['id', 'title']));
    expect(get(reference, 'properties', 'id', 'format')).toBe('uuid');

    const suggestion = get(spec, 'components', 'schemas', 'ChatSuggestion');
    expect(get(suggestion, 'required')).toEqual(
      expect.arrayContaining(['fingerprint', 'findingIds', 'investigationId', 'text', 'ctaLabel']),
    );
    expect(get(suggestion, 'properties', 'investigationId', 'nullable')).toBe(true);

    const response = get(spec, 'components', 'schemas', 'ChatResponse');
    expect(get(response, 'properties', 'references', 'items', '$ref')).toBe(
      '#/components/schemas/ChatReference',
    );
    expect(get(response, 'properties', 'unverifiedCount', 'type')).toBe('integer');
  });
});

describe('Chat contract — documento normativo', () => {
  const contract = readFileSync(
    resolve(__dirname, '../../docs/chat/CHAT-CONTRACT.md'),
    'utf-8',
  );
  const debt = readFileSync(
    resolve(__dirname, '../../docs/technical-debt/TECH-DEBT-REGISTER.md'),
    'utf-8',
  );

  it('describe endpoints, SSE, citas y sugerencias', () => {
    expect(contract).toContain('version: 2.0');
    expect(contract).toContain('POST /api/ai/copilot');
    expect(contract).toContain('POST /api/intelligence/copilot');
    expect(contract).toContain('text/event-stream');
    expect(contract).toContain('"type":"chunk"');
    expect(contract).toContain('"type":"done"');
    expect(contract).toContain('"type":"error"');
    expect(contract).toContain('references');
    expect(contract).toContain('suggestion');
    expect(contract).toContain('unverifiedCount');
    expect(contract).toContain('stream: true');
  });

  it('registra TD-24 para el contexto cliente del Copilot flotante', () => {
    expect(debt).toMatch(/\| TD-24 \|/);
    expect(debt).toContain('dashboardData');
    expect(debt).toContain('TD-24');
    expect(debt).toContain('24 deudas registradas');
    expect(contract).toContain('TD-24');
  });
});
