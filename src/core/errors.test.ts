import { describe, expect, it } from 'vitest';
import { describeError } from './errors';

describe('describeError', () => {
  it('reads a plain error message', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
  });

  it('prefixes the errno code when there is one', () => {
    const err = Object.assign(new Error('connect failed'), { code: 'ECONNREFUSED' });
    expect(describeError(err)).toBe('ECONNREFUSED: connect failed');
  });

  it('unwraps AggregateError, which carries no message of its own', () => {
    const inner = Object.assign(new Error('connect ECONNREFUSED ::1:5432'), {
      code: 'ECONNREFUSED',
    });
    const agg = new AggregateError([inner], '');
    expect(describeError(agg)).toBe('ECONNREFUSED: connect ECONNREFUSED ::1:5432');
  });

  it('collapses duplicate causes from multiple resolved addresses', () => {
    const mk = () => Object.assign(new Error('connect failed'), { code: 'ECONNREFUSED' });
    expect(describeError(new AggregateError([mk(), mk()], ''))).toBe(
      'ECONNREFUSED: connect failed',
    );
  });

  it('falls back to the code when the message is empty', () => {
    expect(describeError(Object.assign(new Error(''), { code: 'ETIMEDOUT' }))).toBe('ETIMEDOUT');
  });

  it('never throws on a non-error value', () => {
    expect(describeError('plain string')).toBe('plain string');
    expect(describeError({ weird: true })).toBe('{"weird":true}');
  });
});
