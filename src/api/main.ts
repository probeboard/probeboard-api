import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { loadConfig } from '../core/config/index.js';
import { describeError } from '../core/errors/describe.js';
import { AppModule } from './api.module.js';
import { configureApp, registerNotFoundFallback } from './bootstrap.js';

async function bootstrap(): Promise<void> {
  // Validate the environment before anything else is constructed, so a bad
  // value fails at boot rather than at first use (docs §8).
  const cfg = loadConfig();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  configureApp(app, cfg);
  await registerNotFoundFallback(app);

  await app.listen(cfg.API_PORT);
  app.get(Logger).log({ port: cfg.API_PORT, env: cfg.NODE_ENV, msg: 'api listening' });
}

bootstrap().catch((err: unknown) => {
  console.error(`api failed to start: ${describeError(err)}`);
  process.exit(1);
});
