import { appendAudit, sha256Hex } from "./audit";
import { MemoryError } from "./errors";
import { consumeWrite } from "./limits";
import { detectFlags, redact } from "./redact";
import {
  principalId,
  type RecordEpisodeInput,
  type RecordEpisodeResult,
  type WriteContext,
} from "./types";
import { normalizeSource, normalizeTimestamp } from "./validate";

/** 87,000 UTF-16 units is at most 261,000 UTF-8 bytes, under the 256 KB part cap. */
export const EPISODE_PART_CHARS = 87_000;
export const MAX_EPISODE_BYTES = 4 * 1024 * 1024;

export function splitParts(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + EPISODE_PART_CHARS, text.length);
    const lastUnit = text.charCodeAt(end - 1);
    if (end < text.length && lastUnit >= 0xd800 && lastUnit <= 0xdbff) {
      end -= 1;
    }
    parts.push(text.slice(start, end));
    start = end;
  }
  return parts;
}

export function recordEpisode(
  sql: SqlStorage,
  ctx: WriteContext,
  input: RecordEpisodeInput,
): RecordEpisodeResult {
  if (typeof input.content !== "string" || input.content.trim() === "") {
    throw new MemoryError("invalid_input", "content must be non-empty text");
  }
  const bytes = new TextEncoder().encode(input.content).byteLength;
  if (bytes > MAX_EPISODE_BYTES) {
    throw new MemoryError(
      "too_large",
      `episode is ${bytes} bytes; the limit is ${MAX_EPISODE_BYTES} bytes`,
    );
  }
  const source = normalizeSource(input.source);
  const observedAt =
    input.observedAt === undefined ? ctx.now : normalizeTimestamp(input.observedAt, "observedAt");
  consumeWrite(sql, principalId(ctx.principal), ctx.nowMs, ctx.writesPerMinute);

  const { text, count } = redact(input.content);
  const flags = detectFlags(text);
  const contentHash = sha256Hex(text);

  const existing = sql
    .exec<{ id: string; redactions: number; flags: string }>(
      "SELECT id, redactions, flags FROM episodes WHERE content_hash = ? AND part_of IS NULL",
      contentHash,
    )
    .toArray()[0];
  if (existing) {
    const children = sql
      .exec<{ n: number }>("SELECT COUNT(*) AS n FROM episodes WHERE part_of = ?", existing.id)
      .one().n;
    return {
      episodeId: existing.id,
      redactions: existing.redactions,
      flags: JSON.parse(existing.flags) as string[],
      parts: children + 1,
      deduplicated: true,
      auditSeq: null,
    };
  }

  const parts = splitParts(text);
  const episodeId = ctx.newId();
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index] ?? "";
    const isParent = index === 0;
    const id = isParent ? episodeId : ctx.newId();
    sql.exec(
      `INSERT INTO episodes (id, content, source, principal_email, oauth_client_id, oauth_client_name,
        content_hash, redactions, flags, part_of, part_index, observed_at, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      part,
      source,
      ctx.principal.email,
      ctx.principal.oauthClientId,
      ctx.principal.oauthClientName,
      isParent ? contentHash : sha256Hex(part),
      isParent ? count : 0,
      JSON.stringify(isParent ? flags : []),
      isParent ? null : episodeId,
      index,
      observedAt,
      ctx.now,
    );
    sql.exec("INSERT INTO fts (kind, ref_id, text) VALUES ('episode', ?, ?)", id, part);
  }

  const auditSeq = appendAudit(sql, ctx.now, {
    actor: ctx.principal.email,
    action: "episode.record",
    target: episodeId,
    detail: {
      source,
      parts: parts.length,
      redactions: count,
      flags,
      client: ctx.principal.oauthClientName,
    },
  });

  return {
    episodeId,
    redactions: count,
    flags,
    parts: parts.length,
    deduplicated: false,
    auditSeq,
  };
}
