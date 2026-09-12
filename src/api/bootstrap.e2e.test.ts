import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../core/config/index.js';
import { ErrorFilter } from './common/filters/error.filter.js';
import { configureApp, registerNotFoundFallback } from './bootstrap.js';

/**
 * Boots a real HTTP server.
 *
 * The unit tests assert that `setGlobalPrefix` was *called*, which is not the
 * same as a route being served under `/v1`. That gap hid a real bug: a
 * wildcard among the prefix exclusions matched every route, so the whole API
 * would have been served unversioned while `/v1/...` returned 404.
 */

@Controller('monitors')
class MonitorsController {
  @Get()
  list() {
    return { ok: true };
  }
}

@Controller()
class RootHealthController {
  @Get('healthz')
  live() {
    return { status: 'ok' };
  }
}

@Module({
  controllers: [MonitorsController, RootHealthController],
  providers: [{ provide: ErrorFilter, useValue: { catch: () => undefined } }],
})
class HarnessModule {}

const cfg = loadConfig({
  DATABASE_URL: 'postgres://u:p@localhost:5432/probeboard',
});

let app: NestExpressApplication;
let base: string;

beforeAll(async () => {
  app = await NestFactory.create<NestExpressApplication>(HarnessModule, { logger: false });
  configureApp(app, cfg);
  await registerNotFoundFallback(app);
  await app.listen(0);
  const addr = app.getHttpServer().address() as { port: number };
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await app.close();
});

describe('routing on a running server', () => {
  it('serves ordinary routes under the version prefix', async () => {
    const res = await fetch(`${base}/v1/monitors`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('does not serve ordinary routes unversioned', async () => {
    expect((await fetch(`${base}/monitors`)).status).toBe(404);
  });

  it('serves health endpoints without the prefix, and only there', async () => {
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
    expect((await fetch(`${base}/v1/healthz`)).status).toBe(404);
  });
});

describe('unmatched routes', () => {
  it('answer with JSON, not Express HTML, inside the prefix', async () => {
    const res = await fetch(`${base}/v1/nope`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    await expect(res.json()).resolves.toEqual({
      code: 'NOT_FOUND',
      message: 'route not found',
    });
  });

  it('answer with JSON outside the prefix too', async () => {
    // The earlier controller-based fallback could only cover one of these.
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      code: 'NOT_FOUND',
      message: 'route not found',
    });
  });

  it('answer on any method, not only GET', async () => {
    const res = await fetch(`${base}/v1/monitors/123`, { method: 'DELETE' });
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ code: 'NOT_FOUND' });
  });
});
