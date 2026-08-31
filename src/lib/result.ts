/**
 * Result Pattern Utility
 * 
 * Eliminates the need for repetitive try/catch blocks.
 * Provides a monadic error handling approach.
 * 
 * Usage:
 *   const result = await Result.try(async () => {
 *     return await someAsyncOperation();
 *   });
 *   
 *   if (result.ok) {
 *     console.log(result.data);
 *   } else {
 *     console.error(result.error);
 *   }
 */

export type Result<T, E = Error> =
  | { ok: true; data: T }
  | { ok: false; error: E };

export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

export const Result = {
  /**
   * Wrap an async operation in a Result.
   * Returns { ok: true, data } on success, { ok: false, error } on failure.
   */
  async try<T, E = Error>(
    fn: () => Promise<T>,
    errorHandler?: (error: unknown) => E
  ): AsyncResult<T, E> {
    try {
      const data = await fn();
      return { ok: true, data };
    } catch (error) {
      const e = errorHandler ? errorHandler(error) : (error as E);
      return { ok: false, error: e };
    }
  },

  /**
   * Wrap a sync operation in a Result.
   */
  trySync<T, E = Error>(
    fn: () => T,
    errorHandler?: (error: unknown) => E
  ): Result<T, E> {
    try {
      const data = fn();
      return { ok: true, data };
    } catch (error) {
      const e = errorHandler ? errorHandler(error) : (error as E);
      return { ok: false, error: e };
    }
  },

  /**
   * Create a successful Result.
   */
  ok<T>(data: T): Result<T, never> {
    return { ok: true, data };
  },

  /**
   * Create a failed Result.
   */
  error<E>(error: E): Result<never, E> {
    return { ok: false, error };
  },

  /**
   * Unwrap a Result, throwing on error.
   */
  unwrap<T, E>(result: Result<T, E>): T {
    if (result.ok) {
      return result.data;
    }
    throw result.error;
  },

  /**
   * Unwrap a Result with a default value on error.
   */
  unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
    return result.ok ? result.data : defaultValue;
  },

  /**
   * Map over a successful Result.
   */
  map<T, U, E>(result: Result<T, E>, fn: (data: T) => U): Result<U, E> {
    if (result.ok) {
      return { ok: true, data: fn(result.data) };
    }
    return result;
  },

  /**
   * FlatMap (chain) over a successful Result.
   */
  flatMap<T, U, E>(
    result: Result<T, E>,
    fn: (data: T) => Result<U, E>
  ): Result<U, E> {
    if (result.ok) {
      return fn(result.data);
    }
    return result;
  },
};
