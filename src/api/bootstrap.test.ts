import type { NestExpressApplication } from '@nestjs/platform-express';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../core/config/index.js';
import { API_VERSION_PREFIX, UNVERSIONED_PATHS, configureApp } from './bootstrap.js';

const cfg = loadConfig({
  DATABASE_URL: 'postgres://u:p@localhost:5432/probeboard',
  API_BODY_LIMIT: '32kb',
});

function fakeApp() {
  const app = {
    setGlobalPrefix: vi.fn(),
    useGlobalFilters: vi.fn(),
    useBodyParser: vi.fn(),
    enableShutdownHooks: vi.fn(),
    get: vi.fn().mockReturnValue({ catch: vi.fn() }),
  };
  return app as unknown as NestExpressApplication & typeof app;
}

describe('configureApp', () => {
  it('versions the api', () => {
    const app = fakeApp();
    configureApp(app, cfg);
    expect(app.setGlobalPrefix).toHaveBeenCalledWith(API_VERSION_PREFIX, {
      exclude: UNVERSIONED_PATHS,
    });
  });

  it('leaves the health endpoints unversioned', () => {
    // An orchestrator's probe should not have to track API versions.
    expect(UNVERSIONED_PATHS).toContain('healthz');
    expect(UNVERSIONED_PATHS).toContain('readyz');
  });

  it('excludes the catch-all, so an unversioned path still gets JSON', () => {
    // Otherwise Express answers unmatched non-/v1 paths with an HTML page.
    expect(UNVERSIONED_PATHS.some((p) => typeof p === 'object' && p.path === '*splat')).toBe(true);
  });

  it('registers the error filter so no failure escapes unmapped', () => {
    const app = fakeApp();
    configureApp(app, cfg);
    expect(app.useGlobalFilters).toHaveBeenCalledOnce();
  });

  it('bounds the request body from configuration, not a literal', () => {
    const app = fakeApp();
    configureApp(app, cfg);
    expect(app.useBodyParser).toHaveBeenCalledWith('json', { limit: '32kb' });
  });

  it('enables shutdown hooks so the database pool is released', () => {
    const app = fakeApp();
    configureApp(app, cfg);
    expect(app.enableShutdownHooks).toHaveBeenCalledOnce();
  });
});
