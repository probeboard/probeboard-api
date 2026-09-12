/**
 * Paths pino replaces before a line is written.
 *
 * `*.headers` is the one that matters most and the one easiest to omit: a
 * monitor's request headers are supplied by the user and routinely carry their
 * API keys, so they must never be logged -- not only the headers of incoming
 * requests to this service.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.secret',
  '*.headers',
] as const;

export const REDACT_CENSOR = '[redacted]';
