export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw result.error;
  return result.value;
}

export function map<T, U>(result: Result<T>, fn: (v: T) => U): Result<U> {
  return result.ok ? ok(fn(result.value)) : result;
}

export function flatMap<T, U>(result: Result<T>, fn: (v: T) => Result<U>): Result<U> {
  return result.ok ? fn(result.value) : result;
}
