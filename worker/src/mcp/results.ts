import { memoryErrorCode } from "../memory/errors";

export type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

export function ok(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

/**
 * Known failures keep their stable code prefix so agents can react to them.
 * Anything else is reported as `unavailable` and logged in the deployer's account.
 */
export function fail(error: unknown): ToolResult {
  const code = memoryErrorCode(error);
  if (code && error instanceof Error) {
    return { isError: true, content: [{ type: "text", text: error.message }] };
  }
  console.error("keendreams tool failure", error);
  return {
    isError: true,
    content: [
      { type: "text", text: "unavailable: the memory service failed; check the Worker logs" },
    ],
  };
}

const LABELS: Record<string, string> = {
  proposed: "UNCONFIRMED",
  trusted: "TRUSTED",
  rejected: "REJECTED",
  superseded: "SUPERSEDED",
};

/** Marks every fact so an agent never mistakes a proposal for something settled. */
export function labelFact<T extends { status: string }>(fact: T): T & { confidenceLabel: string } {
  return { ...fact, confidenceLabel: LABELS[fact.status] ?? fact.status.toUpperCase() };
}

export async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (error) {
    return fail(error);
  }
}
