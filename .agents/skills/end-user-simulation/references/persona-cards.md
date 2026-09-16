# Tarjetas de persona

## 1. Dueña pyme, 50 años, solo español, móvil Android

**Perfil:** Dueña de una tienda pequeña. Nunca ha leído documentación técnica. No sabe qué es un DNS, un LCP, o un sitemap. Usa su teléfono Android como dispositivo principal. Toca la pantalla, nunca escribe URLs a mano si existe un botón.

**Comportamiento típico:**
- Toca el botón más grande y visible. Skimmea títulos.
- Si algo requiere escribir una URL, busca un botón de "Agregar" o "+" primero.
- Si hay un error, asume que el sitio está roto. No lee mensajes técnicos.
- Se frustra si tiene que esperar más de 3 segundos a que algo cargue.
- No sale de la página: se queda atascada.

**Preguntas que se hace:**
- "¿Qué hace esto?" — necesita entender el producto en una frase.
- "¿Mi sitio está bien?" — necesita un veredicto, no un número.
- "¿Qué hago ahora?" — necesita un siguiente paso claro.

**Detección en el código:**
- Buscar headings sin subtítulos explicativos.
- Buscar CTAs ambiguos.
- Buscar placeholders sin `…`.
- Buscar números sin contexto ("99.9%" → ¿es bueno o malo?).

---

## 2. Community manager, desktop, prisa

**Perfil:** Quiere sacar un informe para su jefe. Entiende algo de tecnología pero no es desarrollador. Skimmea headings y hace clic en el botón más prominente. No lee documentación.

**Comportamiento típico:**
- Navega por headings (H1, H2). Si no encuentra lo que busca, se va.
- Hace clic en el botón más grande/colorido.
- Si el informe se genera pero tiene siglas sin explicar, lo descarta.
- No tolera esperar más de 10 segundos para un informe.
- Prefiere "todo en uno" sobre múltiples pasos.

**Preguntas que se hace:**
- "¿Dónde está el informe?" — busca la pestaña más visible.
- "¿Esto es para mi jefe?" — necesita que el resultado se vea profesional.
- "¿Esto tarda mucho?" — necesita feedback de progreso.

**Detección en el código:**
- Buscar pestañas de informes accesibles desde el dashboard.
- Buscar tiempos de carga sin feedback visual.
- Buscar resultados con jargon técnico sin explicación.

---

## 3. Cliente escéptico

**Perfil:** Busca activamente motivos para NO confiar en el producto. Lee los mensajes de error literalmente. Si ve algo raro, se va. No da el beneficio de la duda.

**Comportamiento típico:**
- Lee cada mensaje de error palabra por palabra.
- Si ve `Failed query`, piensa que es inseguro.
- Si ve datos de ejemplo sin etiquetar, piensa que son reales y se siente engañado.
- Busca inconsistencias (inglés mezclado con español, fechas raras).
- Si hay algo que parece "demasiado bueno para ser verdad", no confía.

**Preguntas que se hace:**
- "¿Estos datos son reales?" — necesitan estar etiquetados como demo.
- "¿Por qué dice 'Failed query' en vez de explicar qué pasó?" — necesita un mensaje amigable.
- "¿Esto dice 'Secure' pero no dice cómo" — necesita evidencia, no solo palabras.

**Detección en el código:**
- Buscar mensajes de error crudos en código/UI.
- Buscar datos de ejemplo sin badge "Demo".
- Buscar promesas sin evidencia ("Secure", "99.98%").
- Buscar inglés mezclado con español sin razón técnica.
