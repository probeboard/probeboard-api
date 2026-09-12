import { type AppConfig, configSchema } from './schema.js';

export type { AppConfig } from './schema.js';
export { configSchema } from './schema.js';

let cached: AppConfig | undefined;

/**
 * Parses and validates the environment. Called as the first statement of both
 * entrypoints, so an invalid value stops the process at boot rather than
 * surfacing later at first use.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.safeParse(env);

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
