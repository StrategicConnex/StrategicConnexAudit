# Checklist de baches para usuario final sin conocimientos

## Antes de cada journey
- [ ] ¿El servidor está arriba? `pnpm dev` en puerto 3000
- [ ] ¿Hay credenciales de prueba definidas? Si no, documentar muro auth como B0/B1
- [ ] ¿El screenshot dir se ha creado? `C:\Users\Juan\AppData\Local\Temp\opencode\`
- [ ] ¿La BD está limpia? Verificar sin filas `PRUEBA-E2E-*` antes de empezar

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

## Post-campaña
- [ ] Clasificar todos los hallazgos por severidad
- [ ] Priorizar Top 3 que más reducen abandono
- [ ] Asignar cada propuesta a archivo:línea si aplica
- [ ] Estimar esfuerzo S/M/L para cada fix
