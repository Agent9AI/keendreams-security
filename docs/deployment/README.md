[Repository](../../README.md) / [Documentation](../README.md) / Deployment

# Deploy in your own Cloudflare account

The Worker, identity configuration, memory, index, and billing belong to the
deployer. KeenDreams does not send evidence to Agent9.

> **Validation status:** the live storage and AI checks have passed. A full
> Cloudflare Access sign-in with a real MCP client remains unverified, as does
> a live Tenable One workflow. See [verification and limitations](../verification.md).

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Agent9AI/keendreams-security/tree/main/worker)

The button copies the self-contained `worker/` application into a new repository.
If you clone the full source repository instead, start here:

```bash
git clone https://github.com/Agent9AI/keendreams-security
cd keendreams-security/worker
npm ci
```

Run the commands below from the application directory: `worker/` in a full clone,
or the repository root when the deploy button created a standalone copy.

### Prerequisites

- A Cloudflare account with Workers, Durable Objects (SQLite), Workers KV, Vectorize and Workers AI available
- A **Cloudflare Access for SaaS (OIDC)** application, which is how people sign in. Access is what connects this to your existing identity provider.
- Node.js 22 or later for local development

### Manual deploy

```bash
npx wrangler vectorize create keendreams-memory --dimensions=768 --metric=cosine
npx wrangler deploy
```

### Sign-in setup

Create an **Access for SaaS** application in Cloudflare One, set its redirect URL to `https://<your-worker>/callback`, then set these as Worker secrets:

| Secret | Where it comes from |
|---|---|
| `ACCESS_CLIENT_ID` | The Access for SaaS application |
| `ACCESS_CLIENT_SECRET` | The same application |
| `ACCESS_AUTHORIZATION_URL` | Ends in `/authorization` |
| `ACCESS_TOKEN_URL` | Ends in `/token` |
| `ACCESS_JWKS_URL` | Ends in `/jwks` |
| `COOKIE_ENCRYPTION_KEY` | `openssl rand -hex 32` |
| `ADMIN_EMAILS` | Comma-separated administrator emails |
| `SUGGEST_MODEL` | Optional. A Workers AI model, or `off` to disable suggestions. |

```bash
npx wrangler secret put ACCESS_CLIENT_ID
# ...and so on for each secret above
```

### Connect an MCP client

```bash
claude mcp add --transport http keendreams-security "https://<your-worker>/mcp"
```

Replace `<your-worker>` with the hostname of your own deployed Worker before
running that command. The connection name `keendreams-security` identifies this
security-memory server independently of any other memory service you use.

The **transport is Streamable HTTP** and the **authentication method is OAuth 2.1** with PKCE and dynamic client registration. Your MCP client opens a browser, you approve the connection, you sign in through Cloudflare Access, and the client receives a token scoped to this server. No API key is ever copied or pasted.

## Local settings

For a local session with your own identity configuration, copy the provided
[settings template](.dev.vars.example) into the application directory. In a full
clone, run this from `worker/`:

```bash
cp ../docs/deployment/.dev.vars.example .dev.vars
```

Fill in your own values in `.dev.vars`; it is ignored by Git. Use Wrangler secrets
for a deployed Worker. Never commit account credentials or copy them into a chat.

For the seeded demo, no settings file is needed:

```bash
npm ci
npm run demo
```

After the terminal reports that the local server is ready, open
`http://localhost:8787/review` or `http://localhost:8787/admin` on that same
computer. These are addresses for the running local demo. The admin page
labels cloud-only checks as **live only**. Demo mode requires both `DEMO_MODE=on`
and a loopback request host; a public deployment cannot use the demo identity.

See the [local demo guide](../local-demo.md) for the complete evaluation flow.

## Verify your deployment

Follow the [live verification procedure](../verification.md#live-infrastructure)
to check your own index and model. The live test configuration lives under
[`worker/tests/live/`](../../worker/tests/live/), separately from the offline suite.
