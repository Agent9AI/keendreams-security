[Repository](../README.md) / [Documentation](README.md) / Verification

# Verification and limitations

This page separates checks that have run from the integrations still waiting for
live validation. A passing automated suite is evidence of its covered behavior,
not a certification or proof that every deployment works.

## Automated checks

The offline suite contains 237 tests across 26 test files. It covers memory,
authentication, client isolation, browser review, the MCP interface, and search.
Typechecking, Biome, CodeQL, and a full-history secret scan are separate checks.
The repository's Actions badges link to their latest results.

From the repository root:

```bash
cd worker
npm ci
npm run typecheck
npm run lint
npm test
```

The test configuration disables remote bindings. Live verification is a separate,
explicit command and requires the deployer's own account.

## Live infrastructure

`npm test` runs offline, which means Vectorize and Workers AI are stand-ins there.
So they were also run for real, on 2026-09-17, against a Cloudflare account:

| Check | Result |
|---|---|
| Workers KV, Vectorize, embeddings, suggestions | All four health probes passed |
| Embedding model | 768 dimensions, matching the index |
| Queue drain, embed and upsert | Completed in about one second |
| New vector becomes queryable | 69 s and 121 s on two runs |
| `recall` on a question phrased differently from the evidence | Answered in `hybrid` mode with the confirmed fact |
| `suggest_facts` reading a change ticket | Proposed three correct relationships (ownership, remediation, related ticket), dropped one malformed, stored all as unconfirmed |

That run also caught a real bug the offline suite could not: with a JSON schema
requested, the default model returns its answer already parsed, and the first
version of this code only accepted text, so every suggestion failed in
production. It was fixed test first, from the response shapes the real model
returned.

To repeat the verification in your own account, from `worker/`:

```bash
npx wrangler vectorize create keendreams-memory --dimensions=768 --metric=cosine
CLOUDFLARE_ACCOUNT_ID=<your account id> npm run verify:live
```

It makes a handful of Workers AI calls and writes three vectors into a throwaway
namespace, then deletes them.

## Live browser sign-in

On 2026-09-22, the repository owner completed a successful Claude Code OAuth
connection to the deployed MCP endpoint. The flow opened Cloudflare Access for
SaaS (OIDC), the Cloudflare sign-in button completed authentication, and Claude
Code reported that the server was connected and its tools were available. The
deployed review and administration routes were also verified against the same
Access application and callback URL.

## Known limitations

Stated plainly, because a security tool that oversells itself is worse than useless.

- **New evidence takes one to two minutes to become searchable by meaning.** Vectorize indexes asynchronously; in the live verification a new vector became queryable after 69 and 121 seconds on two runs. Keyword search sees it immediately, and `recall` uses both, so a fresh finding is still found by its words straight away.
- **The alternate PIN identity-provider route was not used in the live check.** The verified path is the Cloudflare OAuth button through the configured Access for SaaS application.
- **The Tenable Hexa recipe has not been run against a live Tenable One tenant.** Its safety design, an explicit allowlist of read tools, is documented and reviewable, but the recipe itself is unverified in production.
- **`suggest_facts` depends on a model returning schema-valid JSON.** The default model does, verified live. If you choose another and it is unreliable, set `SUGGEST_MODEL=off`, and the admin page will tell you. Suggestions are a convenience, not a dependency.
- **The audit log grows without bound.** There is no retention policy yet.
- **Multi-client mode requires deliberate setup.** Single-client mode is the default and is what most teams want.
- **No scheduled Tenable sync is included.** Ingestion is driven by an analyst or an agent you write.
