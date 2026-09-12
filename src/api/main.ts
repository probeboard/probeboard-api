import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './api.module.js';
import { loadConfig } from '../core/config.js';
import { describeError } from '../core/errors.js';

async function bootstrap(): Promise<void> {
  // Validate the environment before anything else is constructed, so a bad
  // value fails at boot rather than at first use (docs §8).
  const cfg = loadConfig();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  await app.listen(cfg.API_PORT);

  // Static message, variable data in fields.
  app.get(Logger).log({ port: cfg.API_PORT, env: cfg.NODE_ENV, msg: 'api listening' });
}

bootstrap().catch((err: unknown) => {
  console.error(`api failed to start: ${describeError(err)}`);
  process.exit(1);
});
