import 'server-only';

import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { directDb } from '@/shared/db';
import { developerApiKeys } from '@/shared/db/schemas';

const KEY_PREFIX = 'sa_live_';
const KEY_BYTES = 32;
const KEY_PREFIX_LEN = KEY_PREFIX.length;
const KEY_TOTAL_LEN = KEY_PREFIX_LEN + KEY_BYTES * 2;

// ─── Scopes de API ────────────────────────────────────────────────────────────
// Vocabulario cerrado: la creación rechaza valores fuera de esta lista y los
// endpoints públicos exigen el scope correspondiente. Una key con scope []
// conserva acceso completo por compatibilidad con keys existentes.
export const API_SCOPES = {
  intelligenceRead: 'intelligence:read',
  intelligenceWrite: 'intelligence:write',
} as const;
export type ApiScope = (typeof API_SCOPES)[keyof typeof API_SCOPES];

export function isValidApiScope(value: string): value is ApiScope {
  return (Object.values(API_SCOPES) as string[]).includes(value);
}

/** ¿Puede la key operar con `required`? ([] = sin restricción, back-compat). */
export function apiKeyHasScope(
  key: { scope?: string[] | null } | null | undefined,
  required: ApiScope,
): boolean {
  if (!key) return false;
  const scopes = key.scope ?? [];
  return scopes.length === 0 || scopes.includes(required);
}

export interface ApiKeyRecord {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  scope: string[];
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export interface ApiKeyAuthResult {
  authenticated: boolean;
  userId: string | null;
  error?: string;
  keyRecord?: ApiKeyRecord;
}

export function generateApiKeyPair(): { rawKey: string; hashedKey: string; keyPrefix: string } {
  const randomBytes = crypto.randomBytes(KEY_BYTES);
  const rawKey = KEY_PREFIX + randomBytes.toString('hex');
  const hashedKey = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.substring(0, KEY_PREFIX_LEN + 8);
  return { rawKey, hashedKey, keyPrefix };
}

export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

export function isValidKeyFormat(rawKey: string): boolean {
  if (!rawKey.startsWith(KEY_PREFIX)) return false;
  if (rawKey.length !== KEY_TOTAL_LEN) return false;
  const hexPart = rawKey.substring(KEY_PREFIX_LEN);
  return /^[0-9a-f]{64}$/.test(hexPart);
}

export function extractBearerToken(req: { headers: { get: (name: string) => string | null } }): string | null {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.substring(7).trim();
}

export async function authenticateApiKey(req: {
  headers: { get: (name: string) => string | null };
}): Promise<ApiKeyAuthResult> {
  const rawKey = extractBearerToken(req);
  if (!rawKey) {
    return { authenticated: false, userId: null, error: 'Use: Bearer sa_live_<key>' };
  }
  if (!isValidKeyFormat(rawKey)) {
    return { authenticated: false, userId: null, error: 'Invalid API key format' };
  }
  const hashedKey = hashApiKey(rawKey);
  try {
    const record = await directDb.query.developerApiKeys.findFirst({
      where: eq(developerApiKeys.hashedKey, hashedKey),
    });
    if (!record) {
      return { authenticated: false, userId: null, error: 'API key not found' };
    }
    if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
      return { authenticated: false, userId: null, error: 'API key has expired' };
    }
    directDb.update(developerApiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(developerApiKeys.id, record.id))
      .catch(() => {});
    return {
      authenticated: true,
      userId: record.userId,
      keyRecord: {
        id: record.id, userId: record.userId, name: record.name,
        keyPrefix: record.keyPrefix, scope: record.scope || [],
        expiresAt: record.expiresAt, lastUsedAt: record.lastUsedAt,
        createdAt: record.createdAt!,
      },
    };
  } catch (err) {
    console.error('[api-keys] authenticate error:', err);
    return { authenticated: false, userId: null, error: 'Internal auth error' };
  }
}

export async function createApiKey(
  userId: string, name: string, scope: string[] = [], expiresAt?: Date,
): Promise<{ rawKey: string; record: ApiKeyRecord } | { error: string }> {
  const { rawKey, hashedKey, keyPrefix } = generateApiKeyPair();
  try {
    const [record] = await directDb.insert(developerApiKeys).values({
      userId, name, keyPrefix, hashedKey, scope,
      expiresAt: expiresAt ?? null,
    }).returning();
    return {
      rawKey,
      record: {
        id: record.id, userId: record.userId, name: record.name,
        keyPrefix: record.keyPrefix, scope: record.scope || [],
        expiresAt: record.expiresAt, lastUsedAt: record.lastUsedAt,
        createdAt: record.createdAt!,
      },
    };
  } catch (err) {
    console.error('[api-keys] create error:', err);
    return { error: 'Failed to create API key' };
  }
}

export async function listApiKeys(userId: string): Promise<ApiKeyRecord[]> {
  try {
    const records = await directDb.query.developerApiKeys.findMany({
      where: eq(developerApiKeys.userId, userId),
      orderBy: (fields) => [fields.createdAt],
    });
    return records.map((r) => ({
      id: r.id, userId: r.userId, name: r.name,
      keyPrefix: r.keyPrefix, scope: r.scope || [],
      expiresAt: r.expiresAt, lastUsedAt: r.lastUsedAt,        createdAt: r.createdAt!,
    }));
  } catch { return []; }
}

export async function revokeApiKey(keyId: string, userId: string): Promise<boolean> {
  try {
    await directDb.delete(developerApiKeys).where(
      and(eq(developerApiKeys.id, keyId), eq(developerApiKeys.userId, userId))
    );
    return true;
  } catch { return false; }
}
