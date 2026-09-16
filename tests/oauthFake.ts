import type {
  AuthRequest,
  ClientInfo,
  CompleteAuthorizationOptions,
} from "@cloudflare/workers-oauth-provider";

export const KNOWN_CLIENT_ID = "known-client";
export const CLIENT_REDIRECT = "https://client.example/callback";
/** Deliberately hostile name: the consent page must escape it. */
export const CLIENT_NAME = "<script>alert(1)</script> Agent";

export type OAuthCalls = { completeAuthorization: CompleteAuthorizationOptions[] };

/** A stand-in for the OAuth provider's helpers, so route tests need no real provider. */
export function fakeOAuth(overrides: Record<string, unknown> = {}) {
  const calls: OAuthCalls = { completeAuthorization: [] };
  const helpers = {
    async parseAuthRequest(request: Request): Promise<AuthRequest> {
      const params = new URL(request.url).searchParams;
      const clientId = params.get("client_id");
      if (!clientId) throw new Error("missing client_id");
      return {
        responseType: params.get("response_type") ?? "code",
        clientId,
        redirectUri: params.get("redirect_uri") ?? CLIENT_REDIRECT,
        scope: (params.get("scope") ?? "memory").split(" "),
        state: params.get("state") ?? "",
        codeChallenge: params.get("code_challenge") ?? undefined,
        codeChallengeMethod: params.get("code_challenge_method") ?? undefined,
      } as AuthRequest;
    },
    async lookupClient(clientId: string): Promise<ClientInfo | null> {
      if (clientId !== KNOWN_CLIENT_ID) return null;
      return { clientId, clientName: CLIENT_NAME, redirectUris: [CLIENT_REDIRECT] } as ClientInfo;
    },
    async completeAuthorization(options: CompleteAuthorizationOptions) {
      calls.completeAuthorization.push(options);
      return { redirectTo: `${CLIENT_REDIRECT}?code=issued-code&state=${options.request.state}` };
    },
    ...overrides,
  };
  return { helpers, calls };
}
