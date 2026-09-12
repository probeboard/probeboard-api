/**
 * Parses a byte-size string such as `64kb`.
 *
 * The `bytes` parser that body-parser uses is lenient in ways that turn an
 * operator's typo into a silent misconfiguration rather than a startup failure:
 * `64kbb` parses to 64 *bytes*, and `abc` parses to null, which body-parser
 * treats as no limit at all. Both remove the protection the setting exists to
 * provide, without anything being reported.
 *
 * This parser is strict instead: an explicit unit is required, so a bare `64`
 * cannot be mistaken for 64 kilobytes, and anything unparseable returns
 * undefined for the caller to reject.
 */
const BYTE_SIZE = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)$/i;

const UNIT_BYTES: Record<string, number> = {
  b: 1,
  kb: 1024,
  mb: 1024 * 1024,
  gb: 1024 * 1024 * 1024,
};

export function parseByteSize(value: string): number | undefined {
  const match = BYTE_SIZE.exec(value.trim());
  if (!match) return undefined;

  const amount = Number(match[1]);
  const unit = UNIT_BYTES[match[2].toLowerCase()];
  if (!Number.isFinite(amount) || unit === undefined) return undefined;

  const total = amount * unit;
  return total > 0 ? total : undefined;
}
