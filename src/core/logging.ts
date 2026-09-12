import type { Params } from 'nestjs-pino';
import { config } from './config';

/**
 * Structured logging. Messages are static; variable data goes in fields, so
 * logs stay greppable and aggregatable. Credentials and probe request headers
 * are redacted, since a monitor's headers routinely carry API keys.
 */
export function loggerOptions(service: 'api' | 'worker'): Params {
  const cfg = config();
  const pretty = cfg.NODE_ENV === 'development';

  return {
    pinoHttp: {
      level: cfg.LOG_LEVEL,
      base: { service },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          '*.password',
          '*.passwordHash',
          '*.headers',
        ],
        censor: '[redacted]',
      },
      transport: pretty ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
    },
  };
}
