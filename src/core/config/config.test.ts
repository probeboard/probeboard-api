import { describe, expect, it } from 'vitest';
import { loadConfig } from './index.js';

const valid = { DATABASE_URL: 'postgres://u:p@localhost:5432/probeboard' };

describe('loadConfig', () => {
  it('applies defaults when only required values are present', () => {
    const cfg = loadConfig(valid);
    expect(cfg.API_PORT).toBe(3000);
    expect(cfg.NODE_ENV).toBe('development');
    expect(cfg.SSRF_GUARD_ENABLED).toBe(true);
  });

  it('refuses to start without a database url', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it('refuses a non-numeric port rather than coercing it to NaN', () => {
    expect(() => loadConfig({ ...valid, API_PORT: 'http' })).toThrow(/API_PORT/);
  });

  it('names every invalid key, not just the first', () => {
    const err = (() => {
      try {
        loadConfig({ API_PORT: '0', LOG_LEVEL: 'loud' });
      } catch (e) {
        return (e as Error).message;
      }
    })();
    expect(err).toMatch(/DATABASE_URL/);
    expect(err).toMatch(/API_PORT/);
    expect(err).toMatch(/LOG_LEVEL/);
  });

  it('treats SSRF_GUARD_ENABLED as a real boolean, not a truthy string', () => {
    expect(loadConfig({ ...valid, SSRF_GUARD_ENABLED: 'false' }).SSRF_GUARD_ENABLED).toBe(false);
  });
});

describe('error reporting', () => {
  it('labels an issue with no path as (root) rather than an empty string', () => {
    // zod reports whole-object problems with an empty path; the message must
    // still name something a reader can act on.
    const err = (() => {
      try {
        loadConfig(null as unknown as NodeJS.ProcessEnv);
      } catch (e) {
        return (e as Error).message;
      }
    })();
    expect(err).toContain('(root)');
  });
});

describe('WORKER_ID', () => {
  it('defaults to something unique per instance, not just the pid', () => {
    // Every container runs its process as PID 1, so a pid-only default would
    // give every worker the same identity.
    const id = loadConfig(valid).WORKER_ID;
    expect(id).toContain(String(process.pid));
    expect(id).not.toBe(`worker-${process.pid}`);
    expect(id.length).toBeGreaterThan(String(process.pid).length + 1);
  });

  it('is overridable from the environment', () => {
    expect(loadConfig({ ...valid, WORKER_ID: 'probe-eu-1' }).WORKER_ID).toBe('probe-eu-1');
  });
});

describe('API_BODY_LIMIT', () => {
  it('accepts a well-formed size', () => {
    expect(loadConfig({ ...valid, API_BODY_LIMIT: '256kb' }).API_BODY_LIMIT).toBe('256kb');
  });

  it('refuses a doubled unit instead of silently shrinking the cap', () => {
    // body-parser's own parser reads "64kbb" as 64 bytes.
    expect(() => loadConfig({ ...valid, API_BODY_LIMIT: '64kbb' })).toThrow(/API_BODY_LIMIT/);
  });

  it('refuses unparseable text instead of silently removing the cap', () => {
    // body-parser treats an unparseable limit as no limit.
    expect(() => loadConfig({ ...valid, API_BODY_LIMIT: 'abc' })).toThrow(/API_BODY_LIMIT/);
  });

  it('refuses a bare number, which would mean bytes rather than kilobytes', () => {
    expect(() => loadConfig({ ...valid, API_BODY_LIMIT: '64' })).toThrow(/API_BODY_LIMIT/);
  });

  it('refuses zero and negative sizes', () => {
    expect(() => loadConfig({ ...valid, API_BODY_LIMIT: '0kb' })).toThrow(/API_BODY_LIMIT/);
    expect(() => loadConfig({ ...valid, API_BODY_LIMIT: '-5kb' })).toThrow(/API_BODY_LIMIT/);
  });

  it('refuses an absurd cap that would defeat the protection', () => {
    expect(() => loadConfig({ ...valid, API_BODY_LIMIT: '5gb' })).toThrow(/API_BODY_LIMIT/);
  });
});
