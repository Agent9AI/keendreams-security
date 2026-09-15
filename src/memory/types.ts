export const FACT_STATUSES = ["proposed", "trusted", "rejected", "superseded"] as const;

export type FactStatus = (typeof FACT_STATUSES)[number];

/** Who is writing: the signed-in person and the MCP client acting for them. */
export type Principal = { email: string; oauthClientId: string; oauthClientName: string };

export function principalId(principal: Principal): string {
  return `${principal.email}|${principal.oauthClientId}`;
}

export type WriteContext = {
  principal: Principal;
  now: string;
  nowMs: number;
  newId: () => string;
  writesPerMinute: number;
};

export type WriteOptions = { writesPerMinute?: number; suggestedByModel?: string };

export type RecordEpisodeInput = { content: string; source: string; observedAt?: string };

export type RecordEpisodeResult = {
  episodeId: string;
  redactions: number;
  flags: string[];
  parts: number;
  deduplicated: boolean;
  /** Null when an identical episode already existed and nothing was written. */
  auditSeq: number | null;
};

export type AssertFactInput = {
  subject: string;
  predicate: string;
  object: string;
  evidenceEpisodeId: string;
  validFrom?: string;
  validTo?: string;
  reason?: string;
};

export type AssertFactResult = {
  factId: string;
  status: FactStatus;
  corroborated: boolean;
  superseded: string[];
  auditSeq: number;
};

export type ReviewContext = { reviewerEmail: string; now: string };

export type ReviewResult = {
  factId: string;
  status: FactStatus;
  superseded: string[];
  auditSeq: number;
};

export type RollbackResult = {
  toSeq: number;
  reopened: string[];
  reverted: string[];
  auditSeq: number;
};
