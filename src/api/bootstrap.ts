import { type INestApplication, RequestMethod } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AppConfig } from '../core/config/index.js';
import { ErrorFilter } from './common/filters/error.filter.js';

/**
 * Served outside the version prefix.
 *
 * Health endpoints, because an orchestrator's probe should not have to track
 * API versions. And the catch-all, so a request to an unversioned path still
 * gets a JSON error rather than Express's HTML page.
 */
export const UNVERSIONED_PATHS = [
  'healthz',
  'readyz',
  { path: '*splat', method: RequestMethod.ALL },
];

export const API_VERSION_PREFIX = 'v1';

/**
 * Applies every cross-cutting concern to the application.
 *
 * Separate from main.ts so the configuration is a value that can be inspected
 * and asserted on, rather than statements buried in a bootstrap function.
 */
export function configureApp(app: NestExpressApplication, cfg: AppConfig): INestApplication {
  // Adding a version prefix once clients exist is a breaking change, so it
  // goes in before the first one. Health endpoints are excluded: an
  // orchestrator's probe should not have to track API versions.
  app.setGlobalPrefix(API_VERSION_PREFIX, { exclude: UNVERSIONED_PATHS });

  // One response shape for every failure, with no internal detail in any.
  app.useGlobalFilters(app.get(ErrorFilter));

  // A request body has no legitimate reason to be large here. Rejecting early
  // keeps a hostile payload from reaching a parser.
  app.useBodyParser('json', { limit: cfg.API_BODY_LIMIT });

  // Closes the module tree on SIGTERM, which releases the database pool.
  app.enableShutdownHooks();

  return app;
}
