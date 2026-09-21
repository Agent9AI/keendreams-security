import { MemoryError } from "./errors";

export function normalizeTimestamp(value: unknown, field: string): string {
  const ms = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(ms)) {
    throw new MemoryError("invalid_input", `${field} must be an ISO 8601 timestamp`);
  }
  return new Date(ms).toISOString();
}

const SOURCE = /^[a-z0-9][a-z0-9._:-]{0,63}$/;

export function normalizeSource(value: unknown): string {
  const source = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!SOURCE.test(source)) {
    throw new MemoryError(
      "invalid_input",
      "source must be 1 to 64 characters: letters, digits, dot, underscore, colon or hyphen",
    );
  }
  return source;
}

export const MAX_REASON_CHARS = 2000;

export function normalizeReason(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new MemoryError("invalid_input", "reason must be text");
  }
  const reason = value.trim();
  if (reason === "") return null;
  if (reason.length > MAX_REASON_CHARS) {
    throw new MemoryError("invalid_input", `reason must be at most ${MAX_REASON_CHARS} characters`);
  }
  return reason;
}

export function clampLimit(value: unknown, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new MemoryError("invalid_input", "limit must be a positive integer");
  }
  return Math.min(value, max);
}
