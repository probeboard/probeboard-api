/**
 * Node surfaces connection failures as AggregateError when a hostname resolves
 * to several addresses and every attempt fails. Its own `.message` is empty, so
 * naively reading `err.message` loses the cause entirely.
 */
export function describeError(err: unknown): string {
  if (err instanceof AggregateError) {
    const parts = err.errors.map(describeError).filter(Boolean);
    const unique = [...new Set(parts)];
    return unique.length > 0 ? unique.join('; ') : err.message || 'AggregateError';
  }

  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    if (err.message) return code ? `${code}: ${err.message}` : err.message;
    return code ?? err.name;
  }

  return typeof err === 'string' ? err : JSON.stringify(err);
}
