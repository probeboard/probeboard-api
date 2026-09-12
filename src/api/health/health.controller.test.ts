import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DbService } from '../../core/db/db.service.js';
import { HealthController } from './health.controller.js';

interface Logger {
  error: ReturnType<typeof vi.fn>;
}

/** A DbService whose single query either answers or fails. */
const DEFAULT_FAILURE = new Error('database unavailable');

function dbThat(outcome: 'answers' | 'fails', err: Error = DEFAULT_FAILURE) {
  return {
    kysely: {
      executeQuery:
        outcome === 'answers'
          ? vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] })
          : vi.fn().mockRejectedValue(err),
      getExecutor: () => ({
        executeQuery:
          outcome === 'answers'
            ? vi.fn().mockResolvedValue({ rows: [] })
            : vi.fn().mockRejectedValue(err),
        transformQuery: (node: unknown) => node,
        compileQuery: () => ({ sql: 'select 1', parameters: [] }),
        provideConnection: async (fn: (c: unknown) => Promise<unknown>) =>
          outcome === 'answers'
            ? fn({ executeQuery: () => Promise.resolve({ rows: [] }) })
            : Promise.reject(err),
      }),
    },
  } as unknown as DbService;
}

function controller(outcome: 'answers' | 'fails', err: Error = DEFAULT_FAILURE) {
  const logger: Logger = { error: vi.fn() };
  return {
    ctrl: new HealthController(dbThat(outcome, err), logger as never),
    logger,
  };
}

describe('HealthController', () => {
  it('liveness answers without touching the database', () => {
    // Passing a DbService that would reject proves nothing is queried.
    const { ctrl } = controller('fails', new Error('database is gone'));
    expect(ctrl.live()).toEqual({ status: 'ok' });
  });

  it('readiness reports ok when the database answers', async () => {
    const { ctrl } = controller('answers');
    await expect(ctrl.ready()).resolves.toEqual({ status: 'ok', database: 'ok' });
  });

  it('readiness fails with 503 when the database does not answer', async () => {
    const { ctrl } = controller('fails', new Error('connection terminated'));
    await expect(ctrl.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('logs the cause and keeps it out of the response', async () => {
    // The detail is for an operator. An unauthenticated caller gets a stable
    // code and nothing internal.
    const cause = Object.assign(new Error('connection terminated'), { code: '57P01' });
    const { ctrl, logger } = controller('fails', cause);

    const thrown = await ctrl.ready().catch((e: unknown) => e);

    expect(logger.error).toHaveBeenCalledWith(
      { cause: '57P01: connection terminated' },
      'readiness check failed',
    );
    expect((thrown as ServiceUnavailableException).getResponse()).toEqual({
      code: 'DATABASE_UNAVAILABLE',
      message: 'database is not reachable',
    });
    expect(JSON.stringify((thrown as ServiceUnavailableException).getResponse())).not.toContain(
      '57P01',
    );
  });

  it('unwraps AggregateError, which carries no message of its own', async () => {
    const inner = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
      code: 'ECONNREFUSED',
    });
    const { ctrl, logger } = controller('fails', new AggregateError([inner], ''));

    await ctrl.ready().catch(() => undefined);

    expect(logger.error).toHaveBeenCalledWith(
      { cause: 'ECONNREFUSED: connect ECONNREFUSED 127.0.0.1:5432' },
      'readiness check failed',
    );
  });
});
