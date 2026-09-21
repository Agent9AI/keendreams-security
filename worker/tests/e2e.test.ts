import { reset, SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { getOAuthApi } from "@cloudflare/workers-oauth-provider";
import { afterEach, describe, expect, it } from "vitest";
import { pkcePair } from "../src/auth/access";
import type { AuthProps } from "../src/auth/types";
import { oauthOptions } from "../src/worker";

const ORIGIN = "https://memory.example.com";
const CLIENT_REDIRECT = "https://client.example/callback";

const ANALYST: AuthProps = {
  sub: "access-user-1",
  email: "alice@example.com",
  name: "Alice Analyst",
  clientId: "placeholder",
  clientName: "Claude Code",
};

afterEach(async () => {
  await reset();
});

/** Walks the real OAuth flow, standing in for the Access hop, and returns a bearer token. */
async function signIn(): Promise<string> {
  const api = getOAuthApi(oauthOptions as never, env);
  const client = await api.createClient({
    redirectUris: [CLIENT_REDIRECT],
    clientName: "Claude Code",
    tokenEndpointAuthMethod: "none",
  } as never);
  const { verifier, challenge } = await pkcePair();
  const authorizeUrl = new URL(`${ORIGIN}/authorize`);
  authorizeUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: client.clientId,
    redirect_uri: CLIENT_REDIRECT,
    scope: "memory",
    state: "client-state",
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();

  const authRequest = await api.parseAuthRequest(new Request(authorizeUrl));
  const { redirectTo } = await api.completeAuthorization({
    request: authRequest,
    userId: ANALYST.sub,
    metadata: { label: ANALYST.email },
    scope: authRequest.scope,
    props: { ...ANALYST, clientId: client.clientId },
  });
  const code = new URL(redirectTo).searchParams.get("code") ?? "";

  const tokenResponse = await SELF.fetch(`${ORIGIN}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: CLIENT_REDIRECT,
      client_id: client.clientId,
      code_verifier: verifier,
    }),
  });
  expect(tokenResponse.status).toBe(200);
  const tokens = (await tokenResponse.json()) as { access_token: string };
  return tokens.access_token;
}

async function mcp(token: string, method: string, params: Record<string, unknown>) {
  const response = await SELF.fetch(`${ORIGIN}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  expect(response.status).toBe(200);
  const body = await response.text();
  const line = body.split("\n").find((entry) => entry.startsWith("data: "));
  const envelope = JSON.parse((line ?? "data: {}").slice(6)) as {
    result?: { content?: { text: string }[]; tools?: { name: string }[]; isError?: boolean };
  };
  const text = envelope.result?.content?.[0]?.text ?? "";
  return {
    tools: envelope.result?.tools ?? [],
    isError: envelope.result?.isError === true,
    text,
    data: text && !envelope.result?.isError ? (JSON.parse(text) as Record<string, unknown>) : null,
  };
}

describe("discovery and sign-in", () => {
  it("tells an MCP client where to sign in", async () => {
    const response = await SELF.fetch(`${ORIGIN}/mcp`, { method: "POST", body: "{}" });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate") ?? "").toContain("resource_metadata=");
  });

  it("publishes authorization server metadata with a registration endpoint", async () => {
    const response = await SELF.fetch(`${ORIGIN}/.well-known/oauth-authorization-server`);
    expect(response.status).toBe(200);
    const metadata = (await response.json()) as Record<string, string>;
    expect(metadata.token_endpoint).toBe(`${ORIGIN}/token`);
    expect(metadata.registration_endpoint).toBe(`${ORIGIN}/register`);
  });

  it("lets a client register itself", async () => {
    const response = await SELF.fetch(`${ORIGIN}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Claude Code",
        redirect_uris: [CLIENT_REDIRECT],
        token_endpoint_auth_method: "none",
      }),
    });
    expect([200, 201]).toContain(response.status);
    const client = (await response.json()) as { client_id?: string };
    expect(client.client_id).toBeTruthy();
  });
});

describe("signed-in MCP session", () => {
  it("records evidence, proposes a fact and reads it back", async () => {
    const token = await signIn();

    const tools = await mcp(token, "tools/list", {});
    expect(tools.tools.map((tool) => tool.name)).toContain("record_episode");

    const episode = await mcp(token, "tools/call", {
      name: "record_episode",
      arguments: { content: "Nessus plugin 201455 on web-prod-03", source: "nessus" },
    });
    const episodeId = String(episode.data?.episodeId ?? "");
    expect(episodeId).not.toBe("");

    const fact = await mcp(token, "tools/call", {
      name: "assert_fact",
      arguments: {
        subject: "asset:web-prod-03",
        predicate: "HAS_VULN",
        object: "cve:CVE-2026-1234",
        evidence_episode_id: episodeId,
      },
    });
    expect(fact.data).toMatchObject({ status: "proposed", confidenceLabel: "UNCONFIRMED" });

    const found = await mcp(token, "tools/call", {
      name: "find_facts",
      arguments: { status: "proposed" },
    });
    expect(found.data?.count).toBe(1);
  });

  it("refuses a token that was revoked", async () => {
    const token = await signIn();
    const api = getOAuthApi(oauthOptions as never, env);
    const clients = await api.listClients();
    for (const client of clients.items) {
      await api.deleteClient(client.clientId);
    }
    const response = await SELF.fetch(`${ORIGIN}/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(response.status).toBe(401);
  });
});
