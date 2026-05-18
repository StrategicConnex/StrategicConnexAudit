import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/shared/db";
import { withRLS } from "@/shared/db/rls";
import { developerApiKeys } from "@/shared/db/schemas";
import { eq, and } from "drizzle-orm";
import { createClient } from "@/shared/lib/supabase/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const keyCreateSchema = z.object({
  name: z.string().min(1).max(256),
  expiresDays: z.number().int().min(1).max(365).optional() // 30, 90, 365 days
});

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const keys = await withRLS(user.id, async (tx) => {
      return await tx.query.developerApiKeys.findMany({
        where: eq(developerApiKeys.userId, user.id)
      });
    });

    // Strip sensitive fields (hashed_key) from output
    const strippedKeys = keys.map(({ hashedKey, ...rest }) => rest);

    return NextResponse.json({
      success: true,
      apiKeys: strippedKeys
    });

  } catch (error: any) {
    console.error("GET api keys route failure:", error);
    return NextResponse.json({
      success: false,
      error: `Error interno: ${error.message || error}`
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const parseResult = keyCreateSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ success: false, error: "Argumentos inválidos" }, { status: 400 });
    }

    const { name, expiresDays } = parseResult.data;

    // Generate secure random key
    const rawEntropy = crypto.randomBytes(24).toString("hex"); // 48 chars
    const clearKey = `sa_live_${rawEntropy}`;
    const hashedKey = crypto.createHash("sha256").update(clearKey).digest("hex");
    
    // keyPrefix contains sa_live_ + first 4 chars of the random part
    const keyPrefix = `sa_live_${rawEntropy.slice(0, 4)}...`;

    let expiresAt: Date | null = null;
    if (expiresDays) {
      expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000);
    }

    const result = await withRLS(user.id, async (tx) => {
      const [newKey] = await tx.insert(developerApiKeys).values({
        userId: user.id,
        name,
        keyPrefix,
        hashedKey,
        scope: ["read", "write", "scan"],
        expiresAt
      }).returning();
      return newKey;
    });

    // Strip hashedKey before returning metadata
    const { hashedKey: _, ...rest } = result;

    return NextResponse.json({
      success: true,
      apiKey: rest,
      clearKey // ONLY returned here, once
    });

  } catch (error: any) {
    console.error("POST api keys route failure:", error);
    return NextResponse.json({
      success: false,
      error: `Error interno: ${error.message || error}`
    }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Falta parámetro id" }, { status: 400 });
    }

    await withRLS(user.id, async (tx) => {
      await tx.delete(developerApiKeys).where(
        and(
          eq(developerApiKeys.id, id),
          eq(developerApiKeys.userId, user.id)
        )
      );
    });

    return NextResponse.json({
      success: true
    });

  } catch (error: any) {
    console.error("DELETE api key route failure:", error);
    return NextResponse.json({
      success: false,
      error: `Error interno: ${error.message || error}`
    }, { status: 500 });
  }
}
