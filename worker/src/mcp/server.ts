import { env } from "cloudflare:workers";
import {
  createMcpHandler,
  McpServer,
  originValidationResponse,
} from "@modelcontextprotocol/server";
import { isAuthProps } from "../auth/types";
import { type AppSettings, adminEmails } from "../config";
import type { ToolEnv } from "./context";
import { registerMemoryTools } from "./tools";

export const SERVER_NAME = "keendreams-security-memory";
export const SERVER_VERSION = "0.1.0";

/** One MCP server per request; tools close over the signed-in identity. */
const handler = createMcpHandler((requestCtx) => {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const props = (requestCtx.authInfo?.extra as { props?: unknown } | undefined)?.props;
  if (isAuthProps(props)) {
    registerMemoryTools(server, {
      env: env as ToolEnv,
      props,
      adminEmails: adminEmails(env as AppSettings),
      origin: requestCtx.requestInfo ? new URL(requestCtx.requestInfo.url).origin : "",
    });
  }
  return server;
});

/**
 * The `/mcp` route. The OAuth provider verifies the bearer token before this runs
 * and puts the signed-in identity on `ctx.props`; the access token itself never
 * reaches the MCP layer.
 */
export const mcpApiHandler = {
  async fetch(request: Request, _env: unknown, ctx: ExecutionContext): Promise<Response> {
    const rejected = originValidationResponse(request, [new URL(request.url).hostname]);
    if (rejected) return rejected;
    const props = (ctx as ExecutionContext & { props?: unknown }).props;
    if (!isAuthProps(props)) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    return handler.fetch(request, {
      authInfo: { token: "", clientId: props.clientId, scopes: [], extra: { props } },
    });
  },
};
