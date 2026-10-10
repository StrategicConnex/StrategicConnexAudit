"""Muta el componente en 4 puntos y comprueba que la prueba correspondiente cae.

Un test que sigue en verde con el defecto introducido no detecta ese defecto.
Cada mutacion se aplica sobre una copia del fichero, se lanza SOLO el test dirigido
y se restaura el original pase lo que pase.
"""
import shutil
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
OBJETIVO = RAIZ / "src" / "features" / "dashboard" / "LiveMetricsBar.tsx"
TEST = "src/features/dashboard/LiveMetricsBar.test.tsx"
COPIA = OBJETIVO.with_suffix(".tsx.orig")
texto_original = OBJETIVO.read_text(encoding="utf-8")

MUTACIONES = [
    (
        "filtro por project_id (columna que la tabla no tiene)",
        "filter: `investigation_id=eq.${investigationId}`",
        "filter: `project_id=eq.${projectId}`",
        "se suscribe a intelligence_run_events filtrando por investigation_id",
    ),
    (
        "sin comprobacion de investigation_id en el callback",
        "if (row.investigation_id !== investigationId) return;",
        "// mutacion: sin guarda multi-tenant",
        "AISLAMIENTO",
    ),
    (
        "el snapshot sobrescribe el contador en vez del maximo",
        "eventsCount: Math.max(p.eventsCount, snapshotEvents),",
        "eventsCount: snapshotEvents,",
        "el snapshot no hace retroceder un contador que ya iba por delante",
    ),
    (
        "el contador se queda en el maximo y nunca sube con el snapshot",
        "eventsCount: Math.max(p.eventsCount, snapshotEvents),",
        "eventsCount: Math.max(p.eventsCount, snapshotEvents, 0) === 0 ? 0 : p.eventsCount,",
        "Math.max no es un tope",
    ),
    (
        "masReciente devuelve el último en llegar en vez del más nuevo",
        "return tb > ta ? b : a;",
        "return b;",
        "masReciente",
    ),
    (
        "masReciente aborta si una fecha es ilegible",
        "if (Number.isNaN(ta)) return b;",
        "if (false) return b;",
        "masReciente",
    ),
    (
        "sin sondeo de respaldo al degradar",
        "if (!intervalRef.current) intervalRef.current = setInterval(poll, FALLBACK_MS);\n    };\n\n    const channel",
        "/* mutacion: sin sondeo */\n    };\n\n    const channel",
        "degrada a sondeo cuando el canal reporta",
    ),
]

fallos = []
try:
    shutil.copy2(OBJETIVO, COPIA)
    for nombre, viejo, nuevo, test in MUTACIONES:
        if viejo not in texto_original:
            print(f"  ANCHOR NO ENCONTRADO: {nombre}")
            fallos.append(nombre)
            continue
        OBJETIVO.write_text(texto_original.replace(viejo, nuevo, 1), encoding="utf-8")
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

restaurado = OBJETIVO.read_text(encoding="utf-8")
print(f"\n  original restaurado byte a byte: {restaurado == texto_original}")
print(f"  mutaciones no detectadas: {len(fallos)}")
sys.exit(1 if fallos else 0)
