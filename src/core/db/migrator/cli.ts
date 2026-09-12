/**
 * Migration CLI.
 *
 *   tsx src/core/db/migrator/cli.ts up | down
 *
 * Covered by the CI `migrations` job against a real PostgreSQL -- apply, no-op,
 * roll back, re-apply -- rather than by unit tests, which would exercise a
 * mocked pg client.
 */
import { Pool } from 'pg';
import { loadConfig } from '../../config/index.js';
import { describeError } from '../../errors/describe.js';
import { down, up } from './runner.js';

async function main(): Promise<void> {
  const direction = process.argv[2] ?? 'up';
  if (direction !== 'up' && direction !== 'down') {
    throw new Error(`unknown direction "${direction}" (expected "up" or "down")`);
  }

  const cfg = loadConfig();
  const pool = new Pool({ connectionString: cfg.DATABASE_URL, max: 1 });

  try {
    await (direction === 'up' ? up(pool, console.log) : down(pool, console.log));
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(describeError(err));
  process.exit(1);
});
