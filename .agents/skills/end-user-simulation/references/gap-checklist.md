# Checklist de baches para usuario final sin conocimientos

## Antes de cada journey
- [ ] ¿El servidor está arriba? `pnpm dev -p 3000` — **fuerza el puerto**: Next 16 elige uno
      libre al azar si el 3000 está ocupado y rompe `NEXT_PUBLIC_APP_URL` + los scripts.
- [ ] Arrancar en background **con `nohup … &` + `disown`**. Con `(cmd &)` el proceso muere
      al cerrarse el shell; con `setsid` falla ("command not found") en Windows Git Bash.
- [ ] ¿Hay credenciales de prueba definidas? Si no, documentar muro auth como B0/B1
- [ ] ¿El screenshot dir se ha creado? `C:\Users\Juan\AppData\Local\Temp\opencode\`
- [ ] ¿La BD está limpia? Verificar sin filas `PRUEBA-E2E-*` antes de empezar

## Antes de dictaminar — comprobaciones mecánicas (las que aciertan)

Estos cinco finds no se ven "a ojo" y seescapan en cualquier revisión manual:

- [ ] **Tokens de tema sin variante oscura.** Busca el bloque `:root, [data-theme="dark"],
      [data-theme="light"] { … }` en `src/styles/*.css`: si un mismo selector declara
      valores **idénticos** para light y dark, esa paleta es *light-only* y cualquier
      componente que la use se rompe en modo oscuro. Ejemplo real:
      `--corporate-surface-elevated: #FFFFFF` → tarjetas blancas con texto claro, ilegibles.
- [ ] **Literales fuera de i18n.** `node .agents/skills/end-user-simulation/scripts/i18n-hardcoded.mjs`.
      El guard de paridad de claves no los ve. Ejemplo real: el CTA principal
      "Nuevo Proyecto" hardcodeado mientras `projects.createProject` existe traducida.
- [ ] **Textos truncados.** Mide con `scrollWidth > clientWidth + 1` sobre los nodos de texto.
      Ejemplo real: 4 etiquetas de stat a 43px que necesitan 42–79px → "PRO…", "AUD…", "24H …".
- [ ] **Solapamientos de elementos flotantes.** Compara el `getBoundingClientRect()` de un
      FAB/botón fijo contra el de las tarjetas de contenido. Ejemplo real: el FAB del copilot
      tapaba la tarjeta de alertas en 390px.
- [ ] **Errores de SSR/hidratación en consola.** `preview_logs` + el log del dev server.
      Ejemplo real: `Missing getServerSnapshot` en `useSyncExternalStore` → la página entera
      cae a render en cliente (y aparece el badge "1 Issue" de Next Dev Tools).

## Durante cada journey — Fricciones comunes

### B0 Bloqueador (no puede completar la tarea)
- [ ] ¿Puede navegar al dashboard sin login? → Si no, ¿hay bypass claro?
- [ ] ¿Los formularios tienen un camino de éxito visible?
- [ ] ¿Los errores tienen un "qué hacer" (no solo "algo salió mal")?
- [ ] ¿Las rutas malas tienen un enlace de regreso?
- [ ] ¿El botón principal no es ambiguo?

### B1 Confusión (jerga, inglés, CTA ambiguo)
- [ ] ¿Hay acrónimos sin explicación? (LCP, GSC, MITRE, SIEM, RUM, SEO, TTFB)
- [ ] ¿Cada número tiene veredicto? (¿99.9% es bueno o malo?)
- [ ] ¿Los CTAs dicen qué pasa después? ("Guardar clave" vs "Guardar y continuar")
- [ ] ¿El inglés está mezclado con español sin razón técnica?
- [ ] ¿Los placeholders terminan en `…` para indicar que hay más?

### B2 Confianza (datos raros, errores crudos)
- [ ] ¿Los datos de ejemplo están etiquetados como demo?
- [ ] ¿Los errores son crudos (`Failed query`, `401`) o amigables?
- [ ] ¿Las promesas tienen evidencia? ("Secure" → ¿dónde está la documentación?)
- [ ] ¿Hay números sin contexto? (sin semáforo o texto explicativo)
- [ ] **¿Algún indicador de estado está hardcodeado en el JSX?** Un badge "ACTIVE" /
      "Secure" / "Live" que no consulta nada es una afirmación falsa. Búscalo con
      `grep -rn "active\|Safe\|Seguro" src` y contrástalo con la respuesta real de la API.
- [ ] **¿La UI afirma seguridad con 0 datos?** Mostrar "Estado: Seguro" sin ningún escaneo
      realizado es peor que mostrar "—": induce a confianza falsa.

### B3 Pulido (menor, pero acumulativo)
- [ ] ¿Hay inconsistencias de color/tipoografía?
- [ ] ¿El texto es demasiado largo o repetitivo?
- [ ] ¿Hay placeholders sin `…`?
- [ ] ¿Los iconos tienen tooltips o son auto-explicativos?

## Después de cada journey
- [ ] Borrar todos los datos `PRUEBA-E2E-*`
- [ ] Matar servidores huérfanos del puerto 3000
- [ ] Verificar BD limpia (sin filas de prueba)
- [ ] Revisar capturas antes de dictaminar
- [ ] **Restablecer el locale**: `document.cookie = 'NEXT_LOCALE=es; path=/'` — si cambiaste
      a inglés para el chequeo i18n, la cookie persiste y falsea sesiones siguientes.

## Post-campaña
- [ ] Clasificar todos los hallazgos por severidad
- [ ] Priorizar Top 3 que más reducen abandono
- [ ] Asignar cada propuesta a archivo:línea si aplica
- [ ] Estimar esfuerzo S/M/L para cada fix
