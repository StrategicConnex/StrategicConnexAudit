/* ═══════════════════════════════════════════════════════════════════
   SCAUDIT — Admin Setup Script
   
   Crea un usuario en Supabase Auth, lo promueve a Super Admin
   en public.users, y opcionalmente genera un link directo de acceso
   (para desarrollo, cuando SMTP no está configurado).
   
   Uso:
     pnpm setup-admin <email>
   
   Ejemplo:
     pnpm setup-admin palacios_juan@hotmail.com
   
   Requisitos:
     - Archivo .env.local con:
       NEXT_PUBLIC_SUPABASE_URL
       SUPABASE_SERVICE_ROLE_KEY
   ═══════════════════════════════════════════════════════════════════ */

import { createClient } from "@supabase/supabase-js";

// Las env vars las carga --env-file=.env.local desde el script de package.json
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Faltan variables de entorno:");
  if (!supabaseUrl) console.error("   - NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) console.error("   - SUPABASE_SERVICE_ROLE_KEY");
  console.error("\nAsegurate de tener un archivo .env.local en la raíz del proyecto con esas variables.");
  process.exit(1);
}

const email = process.argv[2] ?? "";
if (!email || !email.includes("@")) {
  console.error("❌ Uso: pnpm setup-admin <email>");
  console.error("   Ejemplo: pnpm setup-admin palacios_juan@hotmail.com");
  process.exit(1);
}

async function main() {
  console.log(`\n🔧 Configurando Super Admin: ${email}\n`);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 1. Buscar si el usuario ya existe en auth.users ────────────
  console.log("🔍 Buscando usuario en Supabase Auth...");
  const { data: users, error: listError } = await supabase.auth.admin.listUsers();

  if (listError) {
    console.error("❌ Error al listar usuarios:", listError.message);
    console.error("\n   ¿El service_role key tiene permisos de admin?");
    console.error("   Verificá en Supabase Dashboard → Authentication → Settings → Service Role Key");
    process.exit(1);
  }

  const foundUser = users?.users?.find((u) => u.email === email) ?? null;
  let userId: string;

  if (foundUser) {
    console.log(`✅ Usuario encontrado en Auth (ID: ${foundUser.id})`);
    userId = foundUser.id;
  } else {
    // ── 2. Crear usuario sin enviar email (útil cuando SMTP no funciona) ──
    console.log("📝 Creando usuario en Supabase Auth...");
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: "Super Admin" },
    });

    if (createError) {
      console.error("❌ Error al crear usuario:", createError.message);
      process.exit(1);
    }

    if (!newUser?.user?.id) {
      console.error("❌ No se pudo crear el usuario (respuesta vacía).");
      process.exit(1);
    }

    userId = newUser.user.id;
    console.log(`✅ Usuario creado en Auth (ID: ${userId})`);
  }

  // ── 3. Crear o actualizar public.users con role admin ──────────
  console.log("\n👑 Asignando rol SUPER ADMIN en public.users...");

  const { error: upsertError } = await supabase
    .from("users")
    .upsert(
      {
        id: userId,
        email,
        role: "admin",
        full_name: "Super Admin",
        confirmed_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

  if (upsertError) {
    console.error("❌ Error al upsert en public.users:", upsertError.message);
    console.error("\n   Posibles causas:");
    console.error("   - La tabla public.users no existe (correr migraciones primero)");
    console.error("   - El service_role no tiene permisos de insert en public.users");
    process.exit(1);
  }

  console.log("✅ Rol admin asignado correctamente.");

  // ── 4. Generar link directo de acceso (bypassea el email) ──────
  console.log("\n🔗 Generando link directo de acceso...");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${siteUrl}/auth/callback` },
  });

  if (linkError) {
    console.log("⚠️  No se pudo generar el link directo:", linkError.message);
    console.log("   (Los Magic Links siguen funcionando si el SMTP está configurado)");
  } else {
    const magicLink = linkData?.properties?.action_link;
    if (magicLink) {
      console.log("\n" + "═".repeat(50));
      console.log("🔐  LINK DIRECTO DE ACCESO (válido por 10 minutos)");
      console.log("═".repeat(50));
      console.log(`\n${magicLink}\n`);
      console.log("Hacé clic en ese link o copialo en el navegador para iniciar sesión.");
      console.log("No necesita email — funciona aunque el SMTP no esté configurado.\n");
    }
  }

  console.log("═".repeat(50));
  console.log("✅  Super Admin configurado exitosamente");
  console.log(`   Email: ${email}`);
  console.log(`   ID:    ${userId}`);
  console.log(`   Rol:   admin`);
  console.log("═".repeat(50));

  // ── 5. Instrucciones SMTP ──────────────────────────────────────
  console.log("\n─── Para que los Magic Links normales funcionen ──────────");
  console.log("Hotmail/Outlook suele BLOQUEAR los emails del default sender");
  console.log("de Supabase porque no tienen SPF/DKIM configurados.");
  console.log("Para solucionarlo:");
  console.log("  1. Andá a Supabase Dashboard → Authentication → Settings");
  console.log("  2. Configurá un SMTP custom (Resend, SendGrid, Mailgun)");
  console.log("  3. Configurá SPF + DKIM + DMARC en tu dominio");
  console.log("\n   Alternativa gratuita rápida: https://resend.com (100 emails/día gratis)\n");
}

main().catch(console.error);
