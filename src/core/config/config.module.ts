import { Global, Module } from '@nestjs/common';
import { type AppConfig, loadConfig } from './index.js';

/** Injection token for the validated environment. */
export const APP_CONFIG = Symbol('APP_CONFIG');

/**
 * Provides the validated configuration through dependency injection.
 *
 * It replaces a module-level memoised singleton, which had three costs: the
 * environment was validated at *import* time rather than in bootstrap as the
 * code claimed, tests had to mutate `process.env` and reset a cache to change
 * it, and a project whose central argument is about not sharing mutable state
 * carried a piece of exactly that.
 *
 * `loadConfig()` is pure and deterministic, so calling it here as well as in
 * the entrypoint costs nothing. The entrypoint's call is what fails fast; this
 * one is what the application consumes.
 */
@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: (): AppConfig => loadConfig() }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
