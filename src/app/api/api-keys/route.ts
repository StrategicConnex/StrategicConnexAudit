import { NextRequest, NextResponse } from 'next/server';
import { logger } from "@/lib/logger";
import { createClient } from '@/shared/lib/supabase/server';
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  isValidApiScope,
  API_SCOPES,
} from '@/shared/lib/api-keys';

export const dynamic = 'force-dynamic';

/**
 * GET /api/api-keys
 * List all API keys for the authenticated user (without secret keys).
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }

    const keys = await listApiKeys(user.id);

    return NextResponse.json({
      success: true,
      keys,
    });
  } catch (error: unknown) {
    logger.error('GET /api/api-keys failure', { error });
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
  }
}

/**
 * POST /api/api-keys
 * Create a new API key for the authenticated user.
 * The raw key is returned ONLY once in the response.
 *
 * Body: { name: string, scope?: string[], expiresAt?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const { name, scope, expiresAt } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });
    }

    // Vocabulario cerrado de scopes: rechazar valores desconocidos (antes se
    // persistía cualquier string y nunca se verificaba al usar la key).
    const scopes: string[] = Array.isArray(scope) ? scope : [];
    if (scopes.some((s) => typeof s !== 'string' || !isValidApiScope(s))) {
      return NextResponse.json(
        { success: false, error: `Invalid scope. Valid values: ${Object.values(API_SCOPES).join(', ')}` },
        { status: 400 },
      );
    }

    const result = await createApiKey(
      user.id,
      name.trim(),
      scopes,
      expiresAt ? new Date(expiresAt) : undefined,
    );

    if ('error' in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      key: result.record,
      rawKey: result.rawKey,
      message: 'Save this key now — it will not be shown again.',
    });
  } catch (error: unknown) {
    logger.error('POST /api/api-keys failure', { error });
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
  }
}

/**
 * DELETE /api/api-keys?id=<keyId>
 * Revoke (delete) an API key by ID.
 */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const keyId = searchParams.get('id');

    if (!keyId) {
      return NextResponse.json({ success: false, error: 'Key ID is required' }, { status: 400 });
    }

    const ok = await revokeApiKey(keyId, user.id);

    if (!ok) {
      return NextResponse.json({ success: false, error: 'Key not found or could not be revoked' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'API key revoked' });
  } catch (error: unknown) {
    logger.error('DELETE /api/api-keys failure', { error });
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
  }
}
