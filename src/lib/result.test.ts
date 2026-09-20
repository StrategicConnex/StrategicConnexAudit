import { describe, it, expect } from 'vitest';
import { Result } from './result';

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
