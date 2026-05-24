# Prompt Para Gemini 3.1 - Rediseño Visual Sección Rendimiento

Copiar y pegar en Gemini 3.1 dentro de Google Antigravity.

Imagen de referencia:

```txt
C:\Users\Juan\OneDrive\Imágenes\Screenshots\Captura de pantalla 2026-05-24 172141.png
```

---

## Prompt

```txt
Actua como Senior Product Designer, Principal Frontend Engineer, UI Systems Architect y especialista en dashboards SaaS enterprise.

Objetivo:
En el proyecto actual, rediseñar visualmente la seccion "Rendimiento" / "Performance" para que adopte una estetica similar a la imagen de referencia adjunta:

C:\Users\Juan\OneDrive\Imágenes\Screenshots\Captura de pantalla 2026-05-24 172141.png

La imagen muestra un dashboard tecnico oscuro, premium y enterprise, con estilo de monitoreo activo, metricas de Core Web Vitals, gauge circular de salud del proyecto, cards translucidas y acentos cyan/teal.

Antes de modificar codigo:
1. Identifica donde esta implementada la seccion "Rendimiento" / "Performance".
2. Revisa los componentes relacionados con dashboard, metricas, cards, badges, gauges, Web Vitals y proyectos recientes.
3. Revisa el sistema visual existente: Tailwind, CSS global, componentes UI, colores, tokens, cards e iconos.
4. No asumas nombres de archivos. Busca primero en el repo.

Archivos/carpetas a revisar primero:
- package.json
- src/app
- src/components
- src/components/ui
- src/app/globals.css
- cualquier componente que contenga textos como:
  - Rendimiento
  - Performance
  - Core Web Vitals
  - LCP
  - CLS
  - INP
  - Project Health
  - Web Vitals
  - Recent Projects

Tarea principal:
Modificar unicamente la seccion "Rendimiento" / "Performance" para transformarla en un dashboard visual similar a la imagen de referencia.

No rediseñes toda la aplicacion.
No cambies la arquitectura global.
No cambies la logica de datos salvo que sea necesario para presentar mejor las metricas.
No agregues dependencias nuevas si puedes resolverlo con React, Tailwind, CSS, SVG y componentes existentes.

Estilo visual objetivo:
- Dashboard oscuro, tecnico y premium.
- Fondo azul profundo / slate / navy.
- Superficies tipo glassmorphism controlado.
- Cards compactas con bordes finos y glow cyan/teal.
- Jerarquia visual clara, similar a una consola de monitoreo.
- Estado "monitor activo" o "live monitoring".
- Metricas grandes y legibles.
- Texto secundario en slate/cyan tenue.
- Separadores sutiles.
- Sombras internas y externas suaves.
- Bordes luminosos al hover.
- Microinteracciones sobrias.
- Estetica enterprise, no gamer, no neon excesivo.

Paleta recomendada:
- Fondo principal: #07111F, #0B1628, #0F172A.
- Paneles: rgba(15, 23, 42, 0.72) o rgba(8, 18, 32, 0.82).
- Borde base: rgba(148, 163, 184, 0.14).
- Borde activo: rgba(34, 211, 238, 0.45).
- Glow cyan: rgba(34, 211, 238, 0.18).
- Teal/success: #22C55E, #14B8A6.
- Cyan: #22D3EE, #06B6D4.
- Amber/warning: #F59E0B.
- Red/critical: #EF4444.
- Texto principal: #F8FAFC.
- Texto secundario: #CBD5E1.
- Texto muted: #94A3B8.

Elementos que debe contener o preservar:
1. Header de la seccion:
   - Titulo: "Rendimiento" o "Performance".
   - Subtitulo breve orientado a monitoreo, salud tecnica o Core Web Vitals.
   - Indicador visual tipo "En vivo", "Monitor activo" o equivalente si aplica.

2. Cards Core Web Vitals:
   - LCP / Largest Contentful Paint o First Contentful Paint si ese es el dato disponible.
   - CLS / Cumulative Layout Shift.
   - INP / Interaction to Next Paint.
   - Performance Score general.

3. Badges de estado:
   - Good / Bueno.
   - Needs Improvement / Necesita mejora.
   - Warning / Advertencia.
   - Critical / Critico.
   - Excellent / Excelente.

4. Gauge circular:
   - Crear un gauge o ring circular para representar salud del proyecto o performance general.
   - Si no existe componente gauge, implementarlo con SVG o CSS.
   - No instalar librerias nuevas solo para el gauge.
   - Debe mostrar score numerico tipo 91.4 o 94/100.

5. Mini visualizaciones:
   - Barras de progreso.
   - Mini sparkline si ya hay datos.
   - Indicadores horizontales.
   - No inventar datos si el componente ya recibe datos reales.
   - Si los datos son mock/demo, mantenerlos claramente como demo si el codigo ya lo hace.

6. Proyectos recientes:
   - Si la seccion actual muestra proyectos, mantenerlos.
   - Presentarlos como cards compactas con score, estado y breve detalle.

7. Responsive:
   - Desktop: layout tipo dashboard con grid.
   - Tablet: 2 columnas cuando haya espacio.
   - Mobile: una columna, sin overflow horizontal.
   - El gauge no debe romper el ancho.
   - Textos largos deben truncarse o envolver correctamente.

Composicion sugerida:

Desktop:
- Contenedor principal oscuro con borde sutil.
- Grid superior:
  - Columna izquierda: Core Web Vitals - Last 30 Days.
  - Columna derecha: Project Health Gauge.
- Dentro de Core Web Vitals:
  - Grid de cards 2x2.
  - LCP, CLS, INP y Overall Score.
- Debajo:
  - Recent Projects en cards horizontales compactas.

Mobile:
- Header.
- Cards vitals apiladas.
- Gauge debajo.
- Proyectos recientes apilados.

Reglas de implementacion:
- Usa Tailwind CSS si el proyecto ya lo utiliza.
- Usa componentes UI existentes si existen.
- Usa `lucide-react` si ya esta instalado.
- Usa `framer-motion` solo si ya esta en el proyecto y se usa en esa zona; no exageres animaciones.
- Usa `next/image` solo si agregas imagenes reales.
- Evita estilos inline extensos si el proyecto ya usa Tailwind.
- Mantener nombres semanticos y componentes legibles.
- No modificar datos backend ni contratos API salvo que sea estrictamente necesario.
- No tocar rutas no relacionadas.
- No cambiar otras secciones.

Accesibilidad:
- Contraste AA minimo.
- Texto legible en mobile.
- Estados no deben depender solo del color; usar etiquetas.
- Si hay graficos SVG, incluir `aria-label` o texto visible con el valor.
- Botones/links deben tener foco visible.

Criterios de aceptacion visual:
- La seccion se parece claramente a la imagen de referencia.
- Se percibe como dashboard SaaS tecnico premium.
- Tiene fondos oscuros, cards translucidas, acentos cyan/teal y metricas grandes.
- El gauge circular se ve profesional.
- Las cards tienen profundidad visual sin saturar.
- No hay textos superpuestos.
- No hay overflow horizontal.
- No hay imagenes rotas.
- No hay cambios visuales indeseados en otras secciones.

Validaciones obligatorias:
Al finalizar, ejecutar:

npm run lint
npm run build

Si el proyecto tiene dev server disponible, levantarlo y revisar visualmente la seccion en:
- Desktop ancho.
- Laptop.
- Mobile.

Si no puedes abrir navegador, al menos deja indicado que la verificacion visual queda pendiente.

Entrega final:
Reporta:
1. Archivos modificados.
2. Componente principal rediseñado.
3. Cambios visuales aplicados.
4. Como se adapto la imagen de referencia.
5. Resultado de `npm run lint`.
6. Resultado de `npm run build`.
7. Riesgos pendientes o mejoras futuras.

Importante:
No hagas un rediseño generico. El objetivo es transformar la seccion "Rendimiento" en una interfaz tipo monitor activo de performance, inspirada directamente en la captura: dashboard oscuro, Core Web Vitals, project health gauge, cards con glow cyan y estilo enterprise.
```

---

## Checklist Rapido Para Revisar La Implementacion

- [ ] La seccion "Rendimiento" mantiene su funcionalidad original.
- [ ] El look visual se parece a la captura.
- [ ] Hay cards de metricas claras.
- [ ] Hay gauge circular o ring de salud/performance.
- [ ] Hay estados visuales con badges.
- [ ] El diseño es responsive.
- [ ] No hay overflow horizontal en mobile.
- [ ] No se agregaron dependencias innecesarias.
- [ ] `npm run lint` pasa.
- [ ] `npm run build` pasa.
