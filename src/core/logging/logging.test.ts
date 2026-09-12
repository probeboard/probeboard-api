import { describe, expect, it } from 'vitest';
import { loadConfig, resetConfigCache } from '../config/index.js';
import { loggerOptions } from './index.js';

function optionsFor(env: Partial<NodeJS.ProcessEnv> = {}) {
  resetConfigCache();
  process.env.DATABASE_URL = 'postgres://u:p@localhost:5432/probeboard';
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  loadConfig();
  return loggerOptions('api');
}

describe('loggerOptions', () => {
  it('tags every line with the service that produced it', () => {
    optionsFor();
    expect(loggerOptions('api').pinoHttp).toMatchObject({ base: { service: 'api' } });
    expect(loggerOptions('worker').pinoHttp).toMatchObject({ base: { service: 'worker' } });
  });

  it('redacts credentials and monitor headers', () => {
    // A monitor's request headers routinely carry the user's API keys, so
    // `*.headers` must be redacted, not only the incoming request's.
    const opts = optionsFor() as { pinoHttp: { redact: { paths: string[]; censor: string } } };
    const paths = opts.pinoHttp.redact.paths;

    expect(paths).toContain('req.headers.authorization');
    expect(paths).toContain('req.headers.cookie');
    expect(paths).toContain('*.password');
    expect(paths).toContain('*.passwordHash');
    expect(paths).toContain('*.headers');
    expect(opts.pinoHttp.redact.censor).toBe('[redacted]');
  });

  it('pretty-prints only in development, so production logs stay parseable', () => {
    const dev = optionsFor({ NODE_ENV: 'development' }) as { pinoHttp: { transport?: unknown } };
    expect(dev.pinoHttp.transport).toBeDefined();

    const prod = optionsFor({ NODE_ENV: 'production' }) as { pinoHttp: { transport?: unknown } };
    expect(prod.pinoHttp.transport).toBeUndefined();
  });

  it('honours the configured level', () => {
    const opts = optionsFor({ NODE_ENV: 'production', LOG_LEVEL: 'warn' }) as {
      pinoHttp: { level: string };
    };
    expect(opts.pinoHttp.level).toBe('warn');
  });
});
