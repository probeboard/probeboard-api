import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { loadConfig } from '../core/config';
import { describeError } from '../core/errors';
import { WorkerModule } from './worker.module';

/**
 * Resolves when the process is asked to stop. Without this the worker would
 * exit as soon as bootstrap returned: an application context, unlike an HTTP
 * server, holds nothing open by itself. A container that exits immediately is
 * indistinguishable from a crash loop.
 *
 * From M4 onward the scheduler's timers also hold the loop open, but the
 * shutdown path stays the same.
 */
function untilShutdown(): Promise<NodeJS.Signals> {
  return new Promise((resolve) => {
    // A ref'd libuv handle is what actually holds the event loop open.
    // Registering signal listeners does not -- verified: a process that only
    // calls process.once('SIGTERM', ...) exits immediately. From M4 the
    // scheduler's own timers would also keep it alive, but the worker must not
    // depend on a later milestone to stay running.
    // The callback is irrelevant; only the timer's existence matters.
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const keepAlive = setInterval(() => {}, 1 << 30);

    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
    const onSignal = (signal: NodeJS.Signals) => {
      clearInterval(keepAlive);
      for (const s of signals) process.removeListener(s, onSignal);
      resolve(signal);
    };
    for (const s of signals) process.once(s, onSignal);
  });
}

async function bootstrap(): Promise<void> {
  const cfg = loadConfig();

  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  logger.log({ workerId: cfg.WORKER_ID, env: cfg.NODE_ENV, msg: 'worker started' });

  const signal = await untilShutdown();
  logger.log({ signal, msg: 'worker stopping' });

  // Closes the module tree, which releases the database pool (DbService).
  await app.close();
  logger.log({ msg: 'worker stopped' });
}

bootstrap().catch((err: unknown) => {
  console.error(`worker failed to start: ${describeError(err)}`);
  process.exit(1);
});
