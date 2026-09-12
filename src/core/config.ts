import { hostname } from 'node:os';
import { z } from 'zod';

/**
 * Environment contract. Validated once at boot: the process refuses to start
 * with an invalid or missing value rather than failing later at first use.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  DATABASE_URL: z.url(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  // Probe execution limits (NFR-13, FR-8)
  PROBE_MAX_BODY_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .default(64 * 1024),
  PROBE_MAX_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30_000),

  // Scheduler (NFR-2, NFR-3, NFR-4)
  // Must be unique per running instance: it is written to `leased_by`, so an
  // ambiguous value makes it impossible to tell which worker holds a claim or
  // which one died (NFR-3, NFR-4). PID alone is not enough -- every container
  // runs its process as PID 1, so N containers would all report the same id.
  WORKER_ID: z
    .string()
    .min(1)
    .default(() => `${hostname()}-${process.pid}`),
  SCHEDULER_TICK_MS: z.coerce.number().int().min(100).default(1000),
  SCHEDULER_BATCH_SIZE: z.coerce.number().int().min(1).default(100),
  SCHEDULER_LEASE_MS: z.coerce.number().int().min(1000).default(60_000),
  PROBE_CONCURRENCY: z.coerce.number().int().min(1).default(50),

  // SSRF policy (NFR-11). Off only for local development against a test server.
  SSRF_GUARD_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | undefined;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    // Deliberately not a logger call: this runs before the logger exists.
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return parsed.data;
}

export function config(): AppConfig {
  cached ??= loadConfig();
  return cached;
}

/** Test seam: drop the memoised config so a test can load a different env. */
export function resetConfigCache(): void {
  cached = undefined;
}
