"""Muta la Fase 2 de C1 en OverviewTab y comprueba que el test correspondiente cae.

Hermano de `probar-mutacion-livebar.py`: mismo procedimiento, otro componente. Un
test que sigue en verde con el defecto introducido no detecta ese defecto, así que
cada mutación se aplica sobre el fichero real, se lanza SOLO el test dirigido y se
restaura el original pase lo que pase (verificado por hash, no solo por texto).

Uso: python scripts/probar-mutacion-overview-realtime.py
"""
import hashlib
import shutil
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
OBJETIVO = RAIZ / "src" / "features" / "dashboard" / "tabs" / "OverviewTab.tsx"
TEST = "src/features/dashboard/tabs/OverviewTab.test.tsx"
COPIA = OBJETIVO.with_suffix(".tsx.orig")
texto_original = OBJETIVO.read_text(encoding="utf-8")
hash_original = hashlib.md5(OBJETIVO.read_bytes()).hexdigest()

ANCLA_SUSCRIPCION = (
    '        { event: "INSERT", schema: "public", table: "intelligence_run_events" },'
)

MUTACIONES = [
    (
        "filtro por project_id (columna que la tabla no tiene)",
        ANCLA_SUSCRIPCION,
        '        { event: "INSERT", schema: "public", table: "intelligence_run_events", filter: `project_id=eq.${projectId}` },',
        "no filtra por project_id",
    ),
    (
        "se suscribe a otra tabla",
        ANCLA_SUSCRIPCION,
        '        { event: "INSERT", schema: "public", table: "audit_events" },',
        "se suscribe a intelligence_run_events",
    ),
    (
        "el callback del evento no refresca el snapshot",
        "        () => refrescarPronto()",
        "        () => {}",
        "un evento nuevo dispara un refresco",
    ),
    (
        # El defecto real es refrescar en cada evento; quitar solo la guarda dejaria
        # temporizadores encadenados, que es un defecto distinto y mas benigno.
        "sin ventana de agrupacion (cada evento pide su snapshot)",
        "      if (coalesceId) return;",
        "      refrescar();",
        "agrupa la ráfaga",
    ),
    (
        "el flag apagado no deja sondeo de respaldo",
        '    if (!isFlagEnabled("realtimeLive")) {\n      intervalId = setInterval(refrescar, FALLBACK_MS);',
        '    if (!isFlagEnabled("realtimeLive")) {\n      if (false) intervalId = setInterval(refrescar, FALLBACK_MS);',
        "con el flag apagado",
    ),
    (
        "sin degradacion cuando el canal reporta error",
        "          aSondeo();\n        }",
        "          /* mutacion: sin degradacion */\n        }",
        "degrada a sondeo cuando el canal reporta",
    ),
    (
        "sin red de seguridad para el canal en silencio",
        "    }, SUBSCRIBE_GRACE_MS);",
        "    }, 86_400_000);",
        "degrada por silencio",
    ),
    (
        "el canal confirmado no marca el transporte como realtime",
        '        if (status === "SUBSCRIBED") {\n          marcar("realtime");',
        '        if (status === "SUBSCRIBED") {\n          marcar("polling");',
        "muestra la fuente realtime",
    ),
    (
        "el reloj de gracia degrada aunque el canal ya este suscrito",
        '      if (transportRef.current !== "realtime") aSondeo();',
        "      if (true) aSondeo();",
        "en la ruta feliz no hay refresco",
    ),
    (
        "el canal no se libera al desmontar",
        "      void supabase.removeChannel(channel);",
        "      /* mutacion: canal sin liberar */",
        "cierra el canal y detiene el refresco al desmontar",
    ),
    (
        "el sondeo sigue vivo tras desmontar",
        "      if (intervalId) clearInterval(intervalId);\n      void supabase.removeChannel(channel);",
        "      void supabase.removeChannel(channel);",
        "no deja un sondeo vivo",
    ),
]

fallos = []
try:
    shutil.copy2(OBJETIVO, COPIA)
    for nombre, viejo, nuevo, test in MUTACIONES:
        if viejo not in texto_original:
            print(f"  ANCLA NO ENCONTRADA: {nombre}")
            fallos.append(nombre)
            continue
        with open(OBJETIVO, "w", encoding="utf-8", newline="") as fh:
            fh.write(texto_original.replace(viejo, nuevo, 1))
        proc = subprocess.run(
            # shell=True: en Windows pnpm es un .cmd y CreateProcess no lo resuelve.
            f'pnpm exec vitest run "{TEST}" -t "{test}"',
            cwd=RAIZ, shell=True,
            capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
        if proc.returncode == 0:
            print(f"  NO DETECTADA  {nombre}")
            fallos.append(nombre)
        else:
            print(f"  detectada     {nombre}")
finally:
    shutil.copy2(COPIA, OBJETIVO)
    COPIA.unlink(missing_ok=True)

hash_final = hashlib.md5(OBJETIVO.read_bytes()).hexdigest()
print(f"\n  original restaurado byte a byte: {hash_final == hash_original}")
print(f"  mutaciones no detectadas: {len(fallos)}")
sys.exit(1 if fallos or hash_final != hash_original else 0)
