export const MEMORY_ERROR_CODES = [
  "invalid_input",
  "forbidden_client",
  "not_found",
  "too_large",
  "rate_limited",
  "unavailable",
] as const;

export type MemoryErrorCode = (typeof MEMORY_ERROR_CODES)[number];

/**
 * The code is also the message prefix, because only `message` reliably
 * survives Durable Object RPC.
 */
export class MemoryError extends Error {
  readonly code: MemoryErrorCode;

  constructor(code: MemoryErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "MemoryError";
    this.code = code;
  }
}

export function memoryErrorCode(err: unknown): MemoryErrorCode | null {
  if (!(err instanceof Error)) return null;
  const prefix = err.message.split(":", 1)[0] ?? "";
  return (MEMORY_ERROR_CODES as readonly string[]).includes(prefix)
    ? (prefix as MemoryErrorCode)
    : null;
}
