import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config';
import { createPool } from './database';

const cfg = loadConfig({
  DATABASE_URL: 'postgres://u:p@127.0.0.1:1/none',
} as NodeJS.ProcessEnv);

describe('createPool', () => {
  it('attaches an error listener, without which a database restart is fatal', async () => {
    // pg emits 'error' on the pool when an idle connection dies. An
    // EventEmitter with no 'error' listener crashes the process, so removing
    // this listener would make every database blip take down api and workers.
    const pool = createPool(cfg, () => {});
    expect(pool.listenerCount('error')).toBeGreaterThan(0);
    await pool.end();
  });

  it('reports the cause instead of swallowing it', async () => {
    const onError = vi.fn();
    const pool = createPool(cfg, onError);

    pool.emit('error', Object.assign(new Error('connection terminated'), { code: '57P01' }));

    expect(onError).toHaveBeenCalledWith('idle database connection lost', {
      cause: '57P01: connection terminated',
    });
    await pool.end();
  });

  it('survives the emitted error rather than rethrowing it', async () => {
    const pool = createPool(cfg, () => {});
    expect(() => pool.emit('error', new Error('boom'))).not.toThrow();
    await pool.end();
  });
});
