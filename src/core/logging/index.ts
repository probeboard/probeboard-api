import type { Params } from 'nestjs-pino';
import { config } from '../config/index.js';
import { REDACT_CENSOR, REDACT_PATHS } from './redaction.js';

export { REDACT_CENSOR, REDACT_PATHS } from './redaction.js';

export type ServiceName = 'api' | 'worker';

/**
 * Structured logging. The message is a static string and variable data goes in
 * fields, so logs stay greppable and aggregatable.
 */
export function loggerOptions(service: ServiceName): Params {
  const cfg = config();
  const pretty = cfg.NODE_ENV === 'development';

  return {
    pinoHttp: {
      level: cfg.LOG_LEVEL,
      base: { service },
      redact: { paths: [...REDACT_PATHS], censor: REDACT_CENSOR },
      // Pretty output is for a human reading a terminal. Production logs stay
      // machine-parseable.
      transport: pretty ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
    },
  };
}
