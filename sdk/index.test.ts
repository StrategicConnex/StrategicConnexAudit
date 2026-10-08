/* ═══════════════════════════════════════════════════════════════════════════
   SDK SCAUDIT — Tests (Tanda 4 / B13)

   Sin red: el `fetch` se inyecta. Se verifica el contrato del cliente
   (URL, params, Authorization, mapeo de errores) y la regla de honestidad de
   `detectionRate` (lo no evaluado no entra en el denominador).
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi } from 'vitest';
import {
  ScAuditClient,
  ScAuditApiError,
  detectionRate,
  SCAUDIT_DEFAULT_BASE_URL,
  type AdversaryRun,
} from './index';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeClient(fetchImpl: typeof fetch) {
  return new ScAuditClient({ apiKey: 'sa_live_test', fetchImpl });
}

describe('ScAuditClient — construcción', () => {
  it('exige apiKey', () => {
    expect(() => new ScAuditClient({ apiKey: '' })).toThrow(/apiKey/);
  });

  it('usa el base URL de producción por defecto', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: true, investigations: [] }));
    await makeClient(fetchImpl as unknown as typeof fetch).listIntelligence('p1');
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe(
      `${SCAUDIT_DEFAULT_BASE_URL}/api/public/v1/intelligence?projectId=p1`,
    );
  });

  it('permite baseUrl propio y normaliza la barra final', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: true, investigations: [] }));
    const client = new ScAuditClient({
      apiKey: 'k',
      baseUrl: 'http://localhost:3000/',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.listIntelligence('p1');
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe(
      'http://localhost:3000/api/public/v1/intelligence?projectId=p1',
    );
  });
});

describe('ScAuditClient — requests', () => {
  it('envía el Bearer y los parámetros, omitiendo los undefined', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: true, findings: [] }));
    await makeClient(fetchImpl as unknown as typeof fetch).listFindings('p1', {
      severity: 'critical',
    });

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      `${SCAUDIT_DEFAULT_BASE_URL}/api/public/v1/findings?projectId=p1&severity=critical`,
    );
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sa_live_test');
  });

  it('getHealth no envía Authorization', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ status: 'ok', version: '1.0.0', timestamp: '', uptime: 1, services: {}, environment: 'test' }),
    );
    const health = await makeClient(fetchImpl as unknown as typeof fetch).getHealth();

    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(health.status).toBe('ok');
  });

  it('un 503 de /health NO lanza (plataforma degradada)', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ status: 'down', version: '1.0.0', timestamp: '', uptime: 0, services: {}, environment: 'test' }, 503),
    );
    const health = await makeClient(fetchImpl as unknown as typeof fetch).getHealth();
    expect(health.status).toBe('down');
  });

  it('401/403/404/429 → ScAuditApiError con status y mensaje de la API', async () => {
    for (const status of [401, 403, 404, 429]) {
      const fetchImpl = vi.fn(async () => jsonResponse({ success: false, error: `err-${status}` }, status));
      const client = makeClient(fetchImpl as unknown as typeof fetch);
      await expect(client.listFindings('p1')).rejects.toBeInstanceOf(ScAuditApiError);
      await client.listFindings('p1').catch((error: ScAuditApiError) => {
        expect(error.status).toBe(status);
        expect(error.message).toBe(`err-${status}`);
      });
    }
  });

  it('respuesta no-JSON → error con status pero sin romper el parseo', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>502</html>', { status: 502 }));
    const client = makeClient(fetchImpl as unknown as typeof fetch);
    await expect(client.listAudits('p1')).rejects.toMatchObject({ status: 502 });
  });

  it('fallo de red se propaga tal cual', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    });
    await expect(makeClient(fetchImpl as unknown as typeof fetch).listAudits('p1')).rejects.toThrow(
      /ENOTFOUND/,
    );
  });
});

describe('startScan — POST /api/public/v1/intelligence', () => {
  it('hace POST con JSON, Content-Type y Bearer', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        success: true,
        investigation: { id: 'inv-1', status: 'running', target: 'acme.com' },
        message: 'Scan started',
      }),
    );
    const res = await makeClient(fetchImpl as unknown as typeof fetch).startScan({
      projectId: 'p1',
      target: 'acme.com',
    });

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    // Sin query string: los datos van en el cuerpo, no en la URL.
    expect(url).toBe(`${SCAUDIT_DEFAULT_BASE_URL}/api/public/v1/intelligence`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sa_live_test');
    expect(JSON.parse(init.body as string)).toEqual({ projectId: 'p1', target: 'acme.com' });
    expect(res.success).toBe(true);
    expect(res.investigation.status).toBe('running');
  });

  it('los GET siguen sin Content-Type ni body', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: true, findings: [] }));
    await makeClient(fetchImpl as unknown as typeof fetch).listFindings('p1');

    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  it('403 por scope faltante → ScAuditApiError(403)', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        { success: false, error: 'API key does not include required scope: intelligence:write' },
        403,
      ),
    );
    await expect(
      makeClient(fetchImpl as unknown as typeof fetch).startScan({ projectId: 'p1', target: 'a.com' }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('429 por cuota de escaneos → ScAuditApiError(429)', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ success: false, error: 'Scan rate limit exceeded. Try again later.' }, 429),
    );
    await expect(
      makeClient(fetchImpl as unknown as typeof fetch).startScan({ projectId: 'p1', target: 'a.com' }),
    ).rejects.toBeInstanceOf(ScAuditApiError);
  });
});

describe('detectionRate', () => {
  const run = (result: AdversaryRun['result']): AdversaryRun => ({
    id: `r-${result ?? 'null'}`,
    status: 'completed',
    result,
    detectedBy: null,
    mitreId: null,
    scenarioName: null,
    completedAt: null,
  });

  it('solo cuenta runs con veredicto', () => {
    expect(detectionRate([run('detected'), run('missed')])).toBe(50);
    expect(detectionRate([run('detected'), run('detected'), run('missed')])).toBeCloseTo(66.7, 1);
  });

  it('excluye pendientes y errores del denominador', () => {
    // 1 detectado de 1 evaluable → 100%, no 33%
    expect(detectionRate([run('detected'), run(null), run('error')])).toBe(100);
  });

  it('sin nada evaluable → null (no 0)', () => {
    expect(detectionRate([run(null), run('error')])).toBeNull();
    expect(detectionRate([])).toBeNull();
  });
});
