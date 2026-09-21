import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { AuthProps } from "../src/auth/types";
import { mcpApiHandler } from "../src/mcp/server";

export const ANALYST: AuthProps = {
  sub: "access-user-1",
  email: "alice@example.com",
  name: "Alice Analyst",
  clientId: "client-alice",
  clientName: "Claude Code",
};

export const SYNC_AGENT: AuthProps = {
  sub: "access-user-2",
  email: "sync@example.com",
  name: "Hexa Sync",
  clientId: "client-sync",
  clientName: "hexa-sync",
};

export const BOB: AuthProps = {
  sub: "access-user-3",
  email: "bob@example.com",
  name: "Bob Builder",
  clientId: "client-bob",
  clientName: "Claude Code",
};

export const MCP_URL = "https://memory.example.com/mcp";

type JsonRpcEnvelope = {
  result?: { content?: { type: string; text: string }[]; isError?: boolean; tools?: unknown[] };
};

function parseEventStream(body: string): JsonRpcEnvelope {
  const line = body.split("\n").find((entry) => entry.startsWith("data: "));
  if (!line) throw new Error(`no data line in MCP response: ${body.slice(0, 200)}`);
  return JSON.parse(line.slice(6)) as JsonRpcEnvelope;
}

async function send(
  props: AuthProps | null,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; envelope: JsonRpcEnvelope | null }> {
  const request = new Request(MCP_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  const ctx = createExecutionContext() as ExecutionContext & { props?: AuthProps };
  if (props) ctx.props = props;
  const response = await mcpApiHandler.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  if (response.status !== 200) return { status: response.status, envelope: null };
  return { status: 200, envelope: parseEventStream(await response.text()) };
}

export async function callTool(
  props: AuthProps | null,
  name: string,
  args: Record<string, unknown> = {},
  extraHeaders: Record<string, string> = {},
) {
  const { status, envelope } = await send(
    props,
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
    extraHeaders,
  );
  const text = envelope?.result?.content?.[0]?.text ?? "";
  const isError = envelope?.result?.isError === true;
  return {
    status,
    isError,
    text,
    data: status === 200 && !isError && text ? (JSON.parse(text) as Record<string, unknown>) : null,
  };
}

export async function listTools(props: AuthProps) {
  const { envelope } = await send(props, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {},
  });
  return (envelope?.result?.tools ?? []) as {
    name: string;
    annotations?: { readOnlyHint?: boolean };
  }[];
}

export function registry() {
  return env.REGISTRY.getByName("registry");
}
