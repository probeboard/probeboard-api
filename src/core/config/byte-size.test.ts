import { describe, expect, it } from 'vitest';
import { parseByteSize } from './byte-size.js';

describe('parseByteSize', () => {
  it('parses each supported unit', () => {
    expect(parseByteSize('512b')).toBe(512);
    expect(parseByteSize('64kb')).toBe(65536);
    expect(parseByteSize('2mb')).toBe(2 * 1024 * 1024);
    expect(parseByteSize('1gb')).toBe(1024 * 1024 * 1024);
  });

  it('is case and whitespace tolerant', () => {
    expect(parseByteSize('64KB')).toBe(65536);
    expect(parseByteSize(' 64 kb ')).toBe(65536);
  });

  it('accepts a fractional amount', () => {
    expect(parseByteSize('1.5kb')).toBe(1536);
  });

  it('rejects a doubled unit rather than reading part of it', () => {
    // The lenient parser body-parser uses reads "64kbb" as 64 bytes, silently
    // shrinking the limit by three orders of magnitude.
    expect(parseByteSize('64kbb')).toBeUndefined();
  });

  it('rejects a value with no unit, which would otherwise mean bytes', () => {
    // "64" meaning 64 bytes is a footgun when the author meant 64kb.
    expect(parseByteSize('64')).toBeUndefined();
  });

  it('rejects unparseable text, which would otherwise remove the limit', () => {
    // body-parser treats a null limit as unlimited.
    expect(parseByteSize('abc')).toBeUndefined();
    expect(parseByteSize('')).toBeUndefined();
    expect(parseByteSize('kb')).toBeUndefined();
  });

  it('rejects zero and negative sizes', () => {
    expect(parseByteSize('0kb')).toBeUndefined();
    expect(parseByteSize('-5kb')).toBeUndefined();
  });

  it('rejects an unknown unit', () => {
    expect(parseByteSize('5tb')).toBeUndefined();
    expect(parseByteSize('5kib')).toBeUndefined();
  });
});
