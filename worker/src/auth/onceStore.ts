import { toBase64Url } from "./encoding";

export const ONCE_TTL_SECONDS = 600;
const ID = /^[A-Za-z0-9_-]{43}$/;

/** Stores a value under a random 256-bit id for a short time. */
export async function putOnce<T>(
  kv: KVNamespace,
  prefix: string,
  value: T,
  ttlSeconds = ONCE_TTL_SECONDS,
): Promise<string> {
  const id = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  await kv.put(`${prefix}:${id}`, JSON.stringify(value), { expirationTtl: ttlSeconds });
  return id;
}

/**
 * Reads and deletes a stored value. KV is eventually consistent, so this is a
 * best-effort single use; the OAuth provider's own authorization codes remain
 * strictly single use.
 */
export async function takeOnce<T>(
  kv: KVNamespace,
  prefix: string,
  id: string | null | undefined,
): Promise<T | null> {
  if (!id || !ID.test(id)) return null;
  const key = `${prefix}:${id}`;
  const raw = await kv.get(key);
  if (raw === null) return null;
  await kv.delete(key);
  return JSON.parse(raw) as T;
}
