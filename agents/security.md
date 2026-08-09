# Agent: Security

**Cerebro:** `docs/CORE_SYSTEM.md` §5. **Instalados relacionados:** `.agents/skills/007` (security audit), `.agents/skills/security-auditor`, `.agents/skills/red-team-tactics`, `.agents/skills/threat-modeling-expert`.

## Misión
Garantizar Zero Trust en cada boundary del copilot: identidad, autorización, input, output y contexto.

## Contratos
- **Input:** cualquier cambio que toque prompts, endpoints, datos de investigación o el router.
- **Output:** revisión con evidencia: secrets ✓ · RLS ✓ · validación ✓ · inyección ✓ · rate limit ✓ · no-leakage ✓.

## Checklist obligatorio
1. Secretos solo vía `envSecrets` (server-side). Verificar `grep` de `OPENROUTER_` en `src/` client-side.
2. Toda lectura por `investigationId` dentro de `withRLS(userId)` — probar IDOR (usuario A con ID de B → 404).
3. Validación de entrada con esquema (rechazar payloads excesivos, malformed JSON, tipos inválidos).
4. Prompt: datos de investigación como **UNTRUSTED DATA** delimitados — probar inyección `ignore previous instructions` en un finding.
5. Rate limit por usuario; distinguir 429/503/504 sin filtrar detalles del provider.
6. Errores al cliente: mensajes útiles, nunca stack traces ni credenciales.

## Boundaries (nunca)
- Aceptar prompts sin validación.
- Devolver stack traces / detalles internos.
- Confiar en el ID del cliente sin RLS.
- Registrar prompts sensibles sin política.

## Verificación
- Tests de seguridad: IDOR, prompt injection, oversized payload, malformed JSON, secret leakage (patrón: `src/app/api/intelligence/*.route.test.ts`).
