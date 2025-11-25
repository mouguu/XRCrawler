/**
 * Result helper utilities for consistent success/failure handling.
 */

export interface Result<T, E = string> {
  success: boolean;
  data: T | null;
  error: E | null;
  metadata?: Record<string, unknown>;
}

export function ok<T>(data: T, metadata: Record<string, unknown> = {}): Result<T> {
  return { success: true, data, error: null, metadata };
}

export function fail<E = string>(error: E, metadata: Record<string, unknown> = {}): Result<never, E> {
  return { success: false, data: null, error, metadata };
}

export function isOk<T, E>(result: Result<T, E>): result is Result<T, E> & { success: true; data: T } {
  return result.success;
}

export function isFail<T, E>(result: Result<T, E>): result is Result<T, E> & { success: false; error: E } {
  return !result.success;
}

export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return result.success ? (result.data as T) : defaultValue;
}

export function wrap<T extends (...args: any[]) => any>(fn: T) {
  return (...args: Parameters<T>): ReturnType<T> extends Promise<infer R>
    ? Promise<Result<R>>
    : Result<ReturnType<T>> => {
    try {
      const maybePromise = fn(...args);
      if (maybePromise instanceof Promise) {
        return (maybePromise.then(value => ok(value)).catch(err => fail(err))) as any;
      }
      return ok(maybePromise) as any;
    } catch (error: any) {
      return fail(error) as any;
    }
  };
}

export async function fromPromise<T>(promise: Promise<T>): Promise<Result<T>> {
  try {
    const data = await promise;
    return ok(data);
  } catch (error: any) {
    return fail(error);
  }
}
