/**
 * Resolves when the process is asked to stop.
 *
 * The keep-alive timer is what actually holds the event loop open. Registering
 * signal listeners does not -- verified directly: a process whose only content
 * is `process.once('SIGTERM', ...)` exits immediately. Without it an
 * application context, unlike an HTTP server, returns from bootstrap and the
 * process ends; a container that exits is indistinguishable from a crash loop.
 *
 * From M4 the scheduler's own timers also hold the loop open, but the worker
 * must not depend on a later milestone to stay running.
 */
export function untilShutdown(
  signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'],
): Promise<NodeJS.Signals> {
  return new Promise((resolve) => {
    // The callback is irrelevant; only the timer's existence matters.
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const keepAlive = setInterval(() => {}, 1 << 30);

    // Each listener closes over the signal it was registered for, rather than
    // reading the emitted argument. Node does pass the name, but not depending
    // on it keeps this correct however the event is raised.
    const handlers = new Map<NodeJS.Signals, () => void>();

    const finish = (signal: NodeJS.Signals) => {
      clearInterval(keepAlive);
      for (const [s, handler] of handlers) process.removeListener(s, handler);
      handlers.clear();
      resolve(signal);
    };

    for (const s of signals) {
      const handler = () => {
        finish(s);
      };
      handlers.set(s, handler);
      process.once(s, handler);
    }
  });
}
