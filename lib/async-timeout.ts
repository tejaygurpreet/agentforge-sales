/**
 * Races `promise` against a timer; clears the timer when the promise settles first.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let id: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    id = setTimeout(() => {
      reject(new Error(`${label}: exceeded ${ms}ms`));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(id);
  }) as Promise<T>;
}
