[Repository](../README.md) / [Documentation](README.md) / Verification

# Verification and limitations

This page separates checks that have run from the integrations still waiting for
live validation. A passing automated suite is evidence of its covered behavior,
not a certification or proof that every deployment works.

## Evidence at a glance

| Capability | Evidence type | Result and record |
|---|---|---|
| Core memory, trust, isolation, and authentication behavior | Automated offline tests | 238 tests across 26 files passed on 2026-10-10; Cloudflare services are simulated in this suite. |
| First browser review without vendor accounts | Running local app with synthetic fixtures | One click changed pending/confirmed counts from 3/1 to 2/2; audit entries increased from 8 to 9 and remained intact. [Screenshots](start-here.md#1-see-the-review-workflow-without-any-accounts) · [Recorded result](evidence/local-first-decision-2026-10-10.json). |
| Storage, embeddings, semantic retrieval, and suggestions | Live Cloudflare services | Passed on 2026-09-17. [Procedure and observations](#live-infrastructure). |
| Claude Code authentication | Live deployed OAuth connection | Passed on 2026-09-22. [Sign-in record](#live-browser-sign-in). |
| Claude Code memory tool execution | Live authenticated `find_facts` call | Passed on 2026-10-10 for one selected asset; zero current facts returned, no writes. [Sanitized record](evidence/memory-client-read-2026-10-10.json). |
| Hexa authentication, discovery, and scoped asset retrieval | Live Tenable MCP requests | Passed on 2026-10-10. [Sanitized evidence](evidence/hexa-2026-10-10.json). |
| Specific Hexa finding recorded as an unconfirmed proposal | Live scoped reads and Claude Code memory calls | Passed on 2026-10-10. Exact evidence preserved; default recall excluded the proposal and inclusive recall returned it. [Workflow checkpoint](evidence/hexa-workflow-2026-10-10.json). |
| Complete Hexa finding-to-memory, human-review, and later-recall workflow | Live cross-system evaluation | Pending; not established by the local demo or tool discovery. |
| Origin Observatory integration demonstration | Separate example application | Pending; no live integration screenshot is claimed. |

Each record states its scope. A passing synthetic demonstration is not a live
Tenable result, and successful authentication does not prove every tool works.

## Automated checks

The offline suite contains 238 tests across 26 test files. It covers memory,
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

On 2026-10-10, all 238 offline tests, typechecking, and lint passed in the
reconciled onboarding checkout. The suite needs no Tenable credentials or live
Tenable connection. Runtime configuration contains no Tenable API-key requirement;
Tenable/Hexa is an optional source used by the connecting client. This verifies
the core's independence from Tenable, not a completed live Hexa workflow.

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

## Live Tenable Hexa check

On 2026-10-10, an authenticated MCP session against Tenable's hosted endpoint
completed initialization and tool discovery. It reported `Tenable VM MCP`
version `4.0.10`, protocol `2025-03-26`, and 95 tools without a further results page.
An actual Claude Code session also reported both Tenable and KeenDreams Security
connected; that session did not execute the agent-driven workflow.

A separate Claude Code check at 21:10 UTC successfully executed `find_facts`
against the deployed memory for the selected asset. It returned zero current
facts without a tool error. This confirms actual authenticated memory tool use;
it made no Tenable calls or memory writes and does not complete the cross-system
workflow. [Read-check record](evidence/memory-client-read-2026-10-10.json).

| Check | Result |
|---|---|
| Hexa authentication and `tools/list` | Passed |
| `tenable_one_search_assets` | Discovered; not invoked in this check |
| `workbenches_list_vulnerabilities` | Discovered; not invoked in this check |
| `workbenches_list_assets_with_vulnerabilities` | Invoked with `severity: Critical`, `age: 30`, `limit: 1`; returned one asset summary without a tool error |
| Previously documented `asset_search` | Not exposed by this server; removed from the skill's allowlist |
| Asset-to-specific-plugin evidence, memory proposal, pre-review recall | Passed in the subsequent scoped check below |
| Human review and post-review recall | Pending |

The live read returned an asset summary and vulnerability counts, not a specific
asset-to-plugin or asset-to-CVE mapping. No such relationship was inferred and no
Tenable write tool was called. This proves authenticated retrieval, not the full
Hexa-to-memory workflow. Private tenant records and credentials are excluded from
the [sanitized machine-readable evidence](evidence/hexa-2026-10-10.json).

The subsequent authorized check used `workbenches_get_asset_vulnerabilities`
and `workbenches_get_asset_vulnerability_details` for one selected lab asset.
They established a specific relationship to plugin 344819, Microsoft .NET
Framework (September 2026), marked Critical. No CVE or remediation was inferred.
The plugin name came from the asset's vulnerability list; the detail response
omitted its name, family, first-seen and last-seen dates.

Claude Code then wrote one evidence episode and one `HAS_VULN` proposal.
The tool trace was checked against the prepared evidence byte for byte and the
returned episode/fact IDs. The proposal stayed `UNCONFIRMED`. Default recall
excluded that ID; `include_proposed: true` returned it with the same evidence ID.
Both queries reported `hybrid`; this does not isolate the vector contribution
from keyword ranking. No Tenable write occurred. The deployed Cloudflare version
is recorded separately from the repository release; it was not redeployed.

Human browser review and the post-review recall/history check remain pending.
The [workflow checkpoint](evidence/hexa-workflow-2026-10-10.json) contains no private
asset identifiers, raw tenant response, credentials, or private deployment URL.

## Known limitations

Stated plainly, because a security tool that oversells itself is worse than useless.

- **New evidence takes one to two minutes to become searchable by meaning.** Vectorize indexes asynchronously; in the live verification a new vector became queryable after 69 and 121 seconds on two runs. Keyword search sees it immediately, and `recall` uses both, so a fresh finding is still found by its words straight away.
- **The alternate PIN identity-provider route was not used in the live check.** The verified path is the Cloudflare OAuth button through the configured Access for SaaS application.
- **The complete Tenable Hexa-to-memory workflow remains unverified.** Live discovery, scoped finding retrieval, evidence recording, an unconfirmed proposal, and pre-review recall checks passed on 2026-10-10. Human browser review and post-review recall/history remain pending.
- **`suggest_facts` depends on a model returning schema-valid JSON.** The default model does, verified live. If you choose another and it is unreliable, set `SUGGEST_MODEL=off`, and the admin page will tell you. Suggestions are a convenience, not a dependency.
- **The audit log grows without bound.** There is no retention policy yet.
- **Multi-client mode requires deliberate setup.** Single-client mode is the default and is what most teams want.
- **No scheduled Tenable sync is included.** Ingestion is driven by an analyst or an agent you write.
