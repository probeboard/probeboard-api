import { hostname } from 'node:os';
import { z } from 'zod';

/** How the process presents itself and what it logs. */
const runtime = {
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
};

/** HTTP server. Only the api process reads these. */
const api = {
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  // Monitors are small JSON documents; nothing legitimate needs more.
  API_BODY_LIMIT: z.string().default('64kb'),
};

const database = {
  DATABASE_URL: z.url(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
};

/** Probe execution limits (NFR-13, FR-8). */
const probing = {
  PROBE_MAX_BODY_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .default(64 * 1024),
  PROBE_MAX_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30_000),
  PROBE_CONCURRENCY: z.coerce.number().int().min(1).default(50),
  // Leave true. Users supply the URLs this server then fetches, which is a
  // textbook SSRF primitive. False is for tests against a local server only.
  SSRF_GUARD_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
};

/** Claim-based scheduling (NFR-2, NFR-3, NFR-4). */
const scheduler = {
  // Must be unique per running instance: it is written to `leased_by`, so an
  // ambiguous value makes it impossible to tell which worker holds a claim or
  // which one died. PID alone is not enough -- every container runs its
  // process as PID 1, so N containers would all report the same id.
  WORKER_ID: z
    .string()
    .min(1)
    .default(() => `${hostname()}-${process.pid}`),
  SCHEDULER_TICK_MS: z.coerce.number().int().min(100).default(1000),
  SCHEDULER_BATCH_SIZE: z.coerce.number().int().min(1).default(100),
  SCHEDULER_LEASE_MS: z.coerce.number().int().min(1000).default(60_000),
};

export const configSchema = z.object({
  ...runtime,
  ...api,
  ...database,
  ...probing,
  ...scheduler,
});

export type AppConfig = z.infer<typeof configSchema>;
