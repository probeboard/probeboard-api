import { describe, expect, it, vi } from 'vitest';
import { untilShutdown } from './shutdown.js';

describe('untilShutdown', () => {
  it('resolves with the signal that arrived', async () => {
    const waiting = untilShutdown(['SIGUSR2']);
    process.emit('SIGUSR2');
    await expect(waiting).resolves.toBe('SIGUSR2');
  });

  it('holds the event loop open until then', () => {
    // The ref'd timer is the whole point: signal listeners alone do not keep
    // Node alive, so without it the worker exits the moment bootstrap returns.
    const spy = vi.spyOn(global, 'setInterval');
    const waiting = untilShutdown(['SIGUSR2']);

    expect(spy).toHaveBeenCalled();

    process.emit('SIGUSR2');
    spy.mockRestore();
    return waiting;
  });

  it('releases the timer and its listeners once stopped', async () => {
    const before = process.listenerCount('SIGUSR2');
    const clear = vi.spyOn(global, 'clearInterval');

    const waiting = untilShutdown(['SIGUSR2']);
    expect(process.listenerCount('SIGUSR2')).toBe(before + 1);

    process.emit('SIGUSR2');
    await waiting;

    expect(clear).toHaveBeenCalled();
    expect(process.listenerCount('SIGUSR2')).toBe(before);
    clear.mockRestore();
  });

  it('listens on every signal it was given', async () => {
    const waiting = untilShutdown(['SIGUSR2', 'SIGHUP']);
    process.emit('SIGHUP');
    await expect(waiting).resolves.toBe('SIGHUP');
    expect(process.listenerCount('SIGUSR2')).toBe(0);
  });
});
