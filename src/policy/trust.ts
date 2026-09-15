export const FACT_ORIGINS = ["mcp", "allowlisted_source", "ai_suggestion"] as const;

export type FactOrigin = (typeof FACT_ORIGINS)[number];
export type Role = "member" | "reviewer" | "admin";
export type Channel = "mcp" | "browser";

/**
 * Nothing written over MCP starts trusted, whatever the caller's role.
 * The only exception is a source identity an admin allowlisted for a client.
 */
export function initialStatus(origin: FactOrigin): "proposed" | "trusted" {
  return origin === "allowlisted_source" ? "trusted" : "proposed";
}

/** Confirm, reject and rollback happen only in a signed-in browser session. */
export function canReview(role: Role, channel: Channel): boolean {
  return channel === "browser" && (role === "reviewer" || role === "admin");
}
