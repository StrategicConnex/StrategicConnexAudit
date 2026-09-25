import { describe, it, expect, vi } from 'vitest';
import { Result } from './result';
import { Result as AliasResult, type AsyncResult, type Result as ResultType } from '@/lib/result';

describe('Result utility', () => {
  describe('Result.try (async)', () => {
    it('returns ok with data on success', async () => {
      const result = await Result.try(async () => 42);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data).toBe(42);
    });

    it('returns error on failure', async () => {
      const result = await Result.try(async () => {
        throw new Error('boom');
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toBe('boom');
    });

    it('uses custom error handler', async () => {
      const result = await Result.try(
        async () => { throw new Error('boom'); },
        (err) => `Custom: ${(err as Error).message}`,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('Custom: boom');
    });
  });

  describe('Result.trySync', () => {
    it('returns ok with data on success', () => {
      const result = Result.trySync(() => 42);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data).toBe(42);
    });

    it('returns error on failure', () => {
      const result = Result.trySync(() => { throw new Error('sync boom'); });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toBe('sync boom');
    });
  });

  describe('Result.ok / Result.error', () => {
    it('creates success result', () => {
      const r = Result.ok('hello');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.data).toBe('hello');
    });

    it('creates error result', () => {
      const r = Result.error('fail');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('fail');
    });
  });

  describe('Result.unwrap', () => {
    it('returns data for ok', () => {
      expect(Result.unwrap(Result.ok(42))).toBe(42);
    });

    it('throws for error', () => {
      expect(() => Result.unwrap(Result.error('fail'))).toThrow('fail');
    });
  });

  describe('Result.unwrapOr', () => {
    it('returns data for ok', () => {
      expect(Result.unwrapOr(Result.ok(42), 0)).toBe(42);
    });

    it('returns default for error', () => {
      expect(Result.unwrapOr(Result.error('fail') as Result<number, string>, 0)).toBe(0);
    });
  });

  describe('Result.map', () => {
    it('transforms ok value', () => {
      const r = Result.map(Result.ok(21), (x) => x * 2);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.data).toBe(42);
    });

    it('propagates error', () => {
      const r = Result.map(Result.error('fail') as Result<number, string>, (x) => x * 2);
      expect(r.ok).toBe(false);
    });
  });

  describe('Result.flatMap', () => {
    it('chains successful operations', () => {
      const r = Result.flatMap(Result.ok(21), (x) => Result.ok(x * 2));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.data).toBe(42);
    });

    it('propagates error from inner operation', () => {
      const r = Result.flatMap(Result.ok(21), () => Result.error('inner fail'));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('inner fail');
    });

    it('propagates error from outer result', () => {
      const r = Result.flatMap(Result.error('outer') as Result<number, string>, (x) => Result.ok(x * 2));
      expect(r.ok).toBe(false);
    });
  });
});

describe('Result utility (importado desde @/lib/result)', () => {
  it('resuelve al mismo módulo que ./result', () => {
    expect(AliasResult).toBe(Result);
  });

  describe('Result.try (async)', () => {
    it('returns ok with data on success', async () => {
      const result = await AliasResult.try(async () => 'payload');
      expect(result).toEqual({ ok: true, data: 'payload' });
    });

    it('returns error when the operation throws without a handler', async () => {
      const boom = new Error('boom');
      const result = await AliasResult.try(async () => {
        throw boom;
      });
      expect(result).toEqual({ ok: false, error: boom });
    });

    it('maps the thrown value through a custom error handler', async () => {
      const handler = vi.fn((e: unknown) => `handled: ${(e as Error).message}`);
      const result = await AliasResult.try(
        async () => {
          throw new Error('async boom');
        },
        handler,
      );
      expect(handler).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ ok: false, error: 'handled: async boom' });
    });

    it('awaits the value returned by the wrapped promise', async () => {
      const result = await AliasResult.try(() => Promise.resolve(21 * 2));
      if (result.ok) expect(result.data).toBe(42);
    });
  });

  describe('Result.trySync', () => {
    it('returns ok with data on success', () => {
      expect(AliasResult.trySync(() => 'sync value')).toEqual({
        ok: true,
        data: 'sync value',
      });
    });

    it('returns the thrown error when no handler is given', () => {
      const boom = new Error('sync boom');
      const result = AliasResult.trySync(() => {
        throw boom;
      });
      expect(result).toEqual({ ok: false, error: boom });
    });

    it('maps the thrown value through a custom error handler', () => {
      const handler = vi.fn((e: unknown) => `sync handled: ${(e as Error).message}`);
      const result = AliasResult.trySync(
        () => {
          throw new Error('sync boom');
        },
        handler,
      );
      expect(handler).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ ok: false, error: 'sync handled: sync boom' });
    });
  });

  describe('Result.ok / Result.error', () => {
    it('creates a plain success envelope', () => {
      expect(AliasResult.ok({ id: 1 })).toEqual({ ok: true, data: { id: 1 } });
    });

    it('creates a plain failure envelope', () => {
      expect(AliasResult.error('nope')).toEqual({ ok: false, error: 'nope' });
    });
  });

  describe('Result.unwrap', () => {
    it('returns data for ok', () => {
      expect(AliasResult.unwrap(AliasResult.ok('data'))).toBe('data');
    });

    it('throws the original error instance for error results', () => {
      const boom = new Error('unwrap boom');
      expect(() => AliasResult.unwrap(AliasResult.error(boom))).toThrow(boom);
    });

    it('throws non-Error values as-is', () => {
      expect(() => AliasResult.unwrap(AliasResult.error('string failure'))).toThrow(
        'string failure',
      );
    });
  });

  describe('Result.unwrapOr', () => {
    it('returns data for ok', () => {
      expect(AliasResult.unwrapOr(AliasResult.ok(7), 0)).toBe(7);
    });

    it('returns the default for error results', () => {
      const failed: ResultType<number, string> = AliasResult.error('fail');
      expect(AliasResult.unwrapOr(failed, -1)).toBe(-1);
    });
  });

  describe('Result.map', () => {
    it('applies the function to a successful value', () => {
      const r = AliasResult.map(AliasResult.ok(10), (x) => x + 1);
      expect(r).toEqual({ ok: true, data: 11 });
    });

    it('does not invoke the function on error results', () => {
      const failed: ResultType<number, string> = AliasResult.error('fail');
      const fn = vi.fn((x: number) => x * 2);
      const r = AliasResult.map(failed, fn);
      expect(fn).not.toHaveBeenCalled();
      expect(r).toBe(failed);
    });
  });

  describe('Result.flatMap', () => {
    it('returns the inner result on success', () => {
      const r = AliasResult.flatMap(AliasResult.ok(5), (x) => AliasResult.ok(x * 3));
      expect(r).toEqual({ ok: true, data: 15 });
    });

    it('propagates an inner failure without calling further steps', () => {
      const r = AliasResult.flatMap(AliasResult.ok(5), () => AliasResult.error('inner'));
      expect(r).toEqual({ ok: false, error: 'inner' });
    });

    it('returns the original error result untouched on failure', () => {
      const failed: ResultType<number, string> = AliasResult.error('outer');
      const r = AliasResult.flatMap(failed, (x) => AliasResult.ok(x * 2));
      expect(r).toBe(failed);
    });
  });

  describe('tipos exportados', () => {
    it('assigna AsyncResult y Result correctamente', async () => {
      const asyncOk: AsyncResult<number> = AliasResult.try(async () => 1);
      const value: ResultType<number> = await asyncOk;
      expect(value.ok).toBe(true);
      if (value.ok) expect(value.data).toBe(1);

      const asyncErr: AsyncResult<number, string> = AliasResult.try(
        async () => {
          throw new Error('typed boom');
        },
        () => 'typed error',
      );
      const failed: ResultType<number, string> = await asyncErr;
      expect(failed).toEqual({ ok: false, error: 'typed error' });
    });
  });
});
