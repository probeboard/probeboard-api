import type { Params } from 'nestjs-pino';
import type { AppConfig } from '../config/schema.js';
import { REDACT_CENSOR, REDACT_PATHS } from './redaction.js';

export { REDACT_CENSOR, REDACT_PATHS } from './redaction.js';

export type ServiceName = 'api' | 'worker';

/**
 * Structured logging. The message is a static string and variable data goes in
 * fields, so logs stay greppable and aggregatable.
 *
 * Configuration is passed in rather than read from a singleton, which keeps
 * this a pure function of its inputs.
 */
export function loggerOptions(service: ServiceName, cfg: AppConfig): Params {
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
