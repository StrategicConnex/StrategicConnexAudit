/**
 * SCAUDIT SDK — cliente TypeScript de la API pública v1 (Tanda 4 / B13).
 *
 * Cubre los endpoints de LECTURA de `/api/public/v1` con contrato estable.
 * Los tipos replican lo que cada ruta devuelve de verdad (verificado contra
 * `src/app/api/public/v1/*`), no lo que sería bonito que devolviera:
 *  - Un dato ausente en el dominio llega como `null` (nunca 0 ni "").
 *  - Un run de adversario sin veredicto llega como `result: null`, no "missed".
 *
 * La creación de escaneos (POST /api/public/v1/intelligence) queda fuera del
 * SDK v1 a propósito: su respuesta incluye el detalle del planificador, que no
 * es un contrato estable. Se documenta como hueco conocido en el README.
 *
 * Sin dependencias: solo `fetch`. Sirve en Node 18+, Bun, Deno y navegador.
 *   (De ahí que este archivo no importe nada del código de la app: el SDK es
 *   consumible desde fuera del proyecto; por eso vive en `sdk/` y no en `src/`.)
 */

export const SCAUDIT_DEFAULT_BASE_URL = 'https://scaudit.vercel.app';

// ─── Errores ────────────────────────────────────────────────────────────────

/** Error de la API: `status` es el código HTTP real y `body` el payload crudo. */
export class ScAuditApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ScAuditApiError';
    this.status = status;
    this.body = body;
    Object.setPrototypeOf(this, ScAuditApiError.prototype);
  }
}

// ─── Tipos de dominio ───────────────────────────────────────────────────────

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type AdversaryResult = 'detected' | 'missed' | 'error' | null;

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  timestamp: string;
  uptime: number;
  services: {
    dbConfigured: boolean;
    rateLimitStore: 'postgres' | 'memory';
    errorSink: 'app_logs' | 'disabled';
  };
  environment: string;
}

export interface IntelligenceInvestigation {
  id: string;
  projectId: string;
  title: string;
  target: string;
  normalizedTarget: string | null;
  targetType: string;
  status: string;
  createdAt: string | null;
}

export interface AuditSummary {
  id: string;
  type: string;
  status: string;
  createdAt: string | null;
}

export interface Finding {
  id: string;
  severity: FindingSeverity;
  title: string;
  status: string;
  affectedAsset: string | null;
  /** Del triage IA; `null` mientras el hallazgo no se ha clasificado. */
  cvssScore: number | null;
  /** Técnica MITRE del triage IA; `null` si aún no hay triage. */
  mitreId: string | null;
  createdAt: string | null;
}

export interface UptimeCheck {
  isUp: boolean;
  statusCode: number | null;
  responseTimeMs: number | null;
  checkedAt: string | null;
}

export interface UptimeSummary {
  /** `null` si no hay chequeos en la ventana (nunca 0%). */
  uptimePct: number | null;
  avgLatencyMs: number | null;
  checks: UptimeCheck[];
}

export interface ReportPayload {
  id: string;
  report: unknown;
  isFallback: boolean;
  modelUsed: string | null;
  createdAt: string | null;
}

export interface AdversaryRun {
  id: string;
  status: string;
  /** `null` mientras la ejecución no ha terminado. */
  result: AdversaryResult;
  detectedBy: string | null;
  mitreId: string | null;
  scenarioName: string | null;
  completedAt: string | null;
}

export interface AdversaryAssessment {
  id: string;
  status: string;
  target: string;
  riskScore: number | null;
  summary: string | null;
  completedAt: string | null;
}

export interface ListIntelligenceResponse {
  success: true;
  investigations: IntelligenceInvestigation[];
}

export interface ListAuditsResponse {
  success: true;
  audits: AuditSummary[];
}

export interface ListFindingsResponse {
  success: true;
  findings: Finding[];
}

export interface UptimeResponse extends UptimeSummary {
  success: true;
}

export interface ListReportsResponse {
  success: true;
  reports: ReportPayload[];
}

export interface ListAdversaryResponse {
  success: true;
  runs: AdversaryRun[];
  assessments: AdversaryAssessment[];
}

// ─── Cliente ────────────────────────────────────────────────────────────────

export interface ScAuditClientOptions {
  /** API key `sa_live_…` del panel (Settings → API keys). */
  apiKey: string;
  /** Por defecto `https://scaudit.vercel.app`. */
  baseUrl?: string;
  /** Inyectable para tests o para runtimes con su propio fetch. */
  fetchImpl?: typeof fetch;
  /** Timeout por request en ms (por defecto 20 s). */
  timeoutMs?: number;
}

type QueryParams = Record<string, string | number | undefined>;

interface RequestOptions {
  params?: QueryParams;
  noAuth?: boolean;
  /** Códigos que NO deben lanzar (p. ej. el 503 de /health). */
  allowStatuses?: number[];
}

export class ScAuditClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ScAuditClientOptions) {
    if (!options || !options.apiKey) {
      throw new Error('ScAuditClient: se requiere apiKey (sa_live_…)');
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? SCAUDIT_DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 20_000;
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.params ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    // `AbortSignal.timeout` no existe en todos los runtimes (jsdom, navegadores
    // antiguos): si falta, la request sale sin timeout en vez de romper.
    const signal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(this.timeoutMs)
        : undefined;

    const response = await this.fetchImpl(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.noAuth ? {} : { Authorization: `Bearer ${this.apiKey}` }),
      },
      ...(signal ? { signal } : {}),
    });

    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 500) };
    }

    const allowed = options.allowStatuses ?? [];
    if (!response.ok && !allowed.includes(response.status)) {
      const message =
        (body as { error?: string } | null)?.error ??
        `SCAUDIT API respondió ${response.status} ${response.statusText}`;
      throw new ScAuditApiError(message, response.status, body);
    }

    return body as T;
  }

  /**
   * Estado de la plataforma. No requiere API key.
   * Un 503 (plataforma degradada) NO lanza: es una respuesta válida de /health.
   */
  getHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/api/public/v1/health', {
      noAuth: true,
      allowStatuses: [503],
    });
  }

  /** Investigaciones del proyecto (más reciente primero, límite del servidor 50). */
  listIntelligence(projectId: string): Promise<ListIntelligenceResponse> {
    return this.request<ListIntelligenceResponse>('/api/public/v1/intelligence', {
      params: { projectId },
    });
  }

  listAudits(projectId: string, options: { limit?: number } = {}): Promise<ListAuditsResponse> {
    return this.request<ListAuditsResponse>('/api/public/v1/audits', {
      params: { projectId, limit: options.limit },
    });
  }

  listFindings(
    projectId: string,
    options: { limit?: number; severity?: FindingSeverity } = {},
  ): Promise<ListFindingsResponse> {
    return this.request<ListFindingsResponse>('/api/public/v1/findings', {
      params: { projectId, limit: options.limit, severity: options.severity },
    });
  }

  getUptime(projectId: string, options: { days?: number } = {}): Promise<UptimeResponse> {
    return this.request<UptimeResponse>('/api/public/v1/uptime', {
      params: { projectId, days: options.days },
    });
  }

  listReports(projectId: string): Promise<ListReportsResponse> {
    return this.request<ListReportsResponse>('/api/public/v1/reports', { params: { projectId } });
  }

  listAdversary(
    projectId: string,
    options: { limit?: number } = {},
  ): Promise<ListAdversaryResponse> {
    return this.request<ListAdversaryResponse>('/api/public/v1/adversary', {
      params: { projectId, limit: options.limit },
    });
  }
}

/**
 * Resultados de adversario con veredicto conocido (excluye lo no evaluable),
 * mismo criterio que el score purple interno: un run sin veredicto o con error
 * no cuenta como acierto ni como fallo.
 */
export function detectionRate(runs: AdversaryRun[]): number | null {
  const evaluated = runs.filter((r) => r.result === 'detected' || r.result === 'missed');
  if (evaluated.length === 0) return null;
  const detected = evaluated.filter((r) => r.result === 'detected').length;
  return Math.round((detected / evaluated.length) * 1000) / 10;
}
