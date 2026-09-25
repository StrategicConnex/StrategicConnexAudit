import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, createChildLogger } from './logger';

type ConsoleSpy = {
  log: ReturnType<typeof vi.spyOn>;
  warn: ReturnType<typeof vi.spyOn>;
  error: ReturnType<typeof vi.spyOn>;
};

function lastJson(spy: ConsoleSpy['log']): Record<string, unknown> {
  const calls = spy.mock.calls;
  const last = calls[calls.length - 1]?.[0];
  return JSON.parse(String(last)) as Record<string, unknown>;
}

describe('logger (src/lib/logger)', () => {
  let spies: ConsoleSpy;

  beforeEach(() => {
    vi.unstubAllEnvs();
    spies = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('info escribe JSON en console.log con timestamp ISO y sin bloque context', () => {
    logger.info('Project created');
    expect(spies.log).toHaveBeenCalledTimes(1);
    const entry = lastJson(spies.log);
    expect(entry.level).toBe('info');
    expect(entry.message).toBe('Project created');
    expect(new Date(String(entry.timestamp)).toISOString()).toBe(entry.timestamp);
    expect(entry).not.toHaveProperty('context');
  });

  it('incluye context cuando se pasa un objeto', () => {
    logger.info('Project created', { projectId: 'p1' });
    expect(lastJson(spies.log).context).toEqual({ projectId: 'p1' });
  });

  it('normaliza context primitivo a { value }', () => {
    logger.info('plain', 'just a string');
    expect(lastJson(spies.log).context).toEqual({ value: 'just a string' });

    logger.info('number', 42);
    expect(lastJson(spies.log).context).toEqual({ value: 42 });
  });

  it('normaliza arrays a { value } (no son LogContext)', () => {
    logger.info('list', [1, 2, 3]);
    expect(lastJson(spies.log).context).toEqual({ value: [1, 2, 3] });
  });

  it('omite context cuando es null o undefined', () => {
    logger.info('nada', null);
    expect(lastJson(spies.log)).not.toHaveProperty('context');

    logger.info('nada 2');
    expect(lastJson(spies.log)).not.toHaveProperty('context');
  });

  it('omite context cuando el objeto está vacío', () => {
    logger.info('empty', {});
    expect(lastJson(spies.log)).not.toHaveProperty('context');
  });

  it('warn usa console.warn y error usa console.error', () => {
    logger.warn('careful', { a: 1 });
    expect(lastJson(spies.warn as ConsoleSpy['log']).level).toBe('warn');

    logger.error('broken');
    expect(lastJson(spies.error as ConsoleSpy['log']).level).toBe('error');
    expect(spies.log).not.toHaveBeenCalled();
  });

  it('debug solo imprime en NODE_ENV=development', () => {
    logger.debug('quiet in test env');
    expect(spies.log).not.toHaveBeenCalled();

    vi.stubEnv('NODE_ENV', 'development');
    logger.debug('visible in dev', { step: 1 });
    expect(spies.log).toHaveBeenCalledTimes(1);
    const entry = lastJson(spies.log);
    expect(entry.level).toBe('debug');
    expect(entry.context).toEqual({ step: 1 });
  });

  it('createChildLogger fusiona el contexto fijo con el de cada llamada', () => {
    const child = createChildLogger({ module: 'audit' });

    child.info('starting');
    expect(lastJson(spies.log).context).toEqual({ module: 'audit' });

    child.info('with details', { auditId: 'a1' });
    expect(lastJson(spies.log).context).toEqual({ module: 'audit', auditId: 'a1' });

    child.warn('override', { module: 'other' });
    expect(lastJson(spies.warn as ConsoleSpy['log']).context).toEqual({ module: 'other' });

    child.error('failed');
    expect(lastJson(spies.error as ConsoleSpy['log']).context).toEqual({ module: 'audit' });

    child.debug('dev only');
    expect(spies.log).toHaveBeenCalledTimes(2);
  });
});
