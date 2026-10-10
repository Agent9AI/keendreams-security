[Repository](../../README.md) / [Exchange](README.md) / Review package

# Maintainer review package

This is an evidence map for reviewers, not an independent security assessment or
an Exchange Inspector promotion. The listing remains **Contributed**. Tenable
selects candidates and records its own reviewed commit and review outcome.

## Review baseline

| Item | Reference |
|---|---|
| Published source | [`v0.1.0`](https://github.com/Agent9AI/keendreams-security/releases/tag/v0.1.0) |
| Release commit | `f41e56a121e81437b0270d25ffbb3be6d65aa873` |
| License | [MIT](../../LICENSE) |
| Runtime and lockfile | [Worker package](../../worker/package.json), [lockfile](../../worker/package-lock.json) |
| Shipped behavior and live limits | [Verification record](../verification.md) |
| Initial listing acceptance | [Tenable PR #189](https://github.com/tenable/cyberagents-exchange/pull/189) |
| Security reporting | [Private reporting policy](../../.github/SECURITY.md) |

The release is immutable; a later branch or PR is a different review target.
Existing deployments are not automatically upgraded by a GitHub release.
The separately tested embedding-validation change in
[PR #18](https://github.com/Agent9AI/keendreams-security/pull/18) is not part of
the v0.1.0 baseline. When selecting a newer candidate, pin its final commit and
repeat the checks rather than carrying a prior approval forward.

## Product and authority boundaries

KeenDreams stores evidence and relationships for security applications and agents.
It works without Tenable. An optional client workflow reads Tenable findings,
compares them with recorded decisions, and proposes evidence-backed facts.
It is not a scanner, a Tenable write adapter, or a background sync service.
Origin Observatory is a separate example application; its code is not shipped
here, and a live Origin integration is not established by this package.

| Surface | Authority and state change | Source / checks |
|---|---|---|
| Memory MCP reads | OAuth identity and resolved client membership; reads facts, evidence quotes, and history | [Context](../../worker/src/mcp/context.ts), [registry tests](../../worker/tests/registry.test.ts) |
| `record_episode` | Stores redacted evidence, provenance, search work, and audit state; consumes write quota | [Episodes](../../worker/src/memory/episodes.ts), [episode tests](../../worker/tests/episodes.test.ts) |
| `assert_fact` | Creates a proposal by default; an explicitly allowlisted identity/source may create trusted facts and supersede a prior version | [Trust policy](../../worker/src/policy/trust.ts), [fact tests](../../worker/tests/facts.test.ts) |
| `suggest_facts` | Calls the configured model and writes validated proposals; never grants trust | [Suggestion path](../../worker/src/search/suggest.ts), [tests](../../worker/tests/suggest.test.ts) |
| Browser review | Signed-in reviewer/admin confirms or rejects; CSRF and role checks apply | [Review routes](../../worker/src/web/review.ts), [route tests](../../worker/tests/review.routes.test.ts) |
| Browser administration | Administrator manages client access, write limits, automation allowlists, audit rollback and failed-index retries | [Admin routes](../../worker/src/web/admin.ts), [tests](../../worker/tests/admin.test.ts) |
| Tenable skill | Named, discovered read tools in an agreed scope; no scans, tickets, tagging, or Tenable writes | [Skill](../../SKILL.md), [integration guide](../integrations/tenable.md) |

Read-only Tenable access is sufficient for the intended workflow. It does not
grant authority to publish tenant data or transfer another team's records.
The operator must authorize the destination memory and scope separately.

## Destinations, credentials, and data

| Initiator | Destination | Data and purpose |
|---|---|---|
| MCP client | Deployer's KeenDreams HTTPS endpoint | OAuth-authenticated tool arguments and responses |
| Browser | Deployer's Worker and configured Access/identity provider | Sign-in, reviewer identity, forms and cookies |
| Worker | Configured Access authorization/token/JWKS endpoints | Browser authorization redirect, code exchange with client secret and PKCE verifier, signing-key retrieval |
| Worker | Client Durable Object SQLite and registry Durable Object | Evidence, facts, history, audit, client membership, policy |
| Worker | `OAUTH_KV` | OAuth grants and short-lived authorization state |
| Worker | Bound Workers AI | Evidence/query text for embeddings; quoted evidence for optional suggestions |
| Worker | Bound Vectorize | Vectors, item IDs and client namespace; no raw episode text in vector records |
| Analyst's MCP client | `https://cloud.tenable.com/mcp/` | Scoped queries and `X-ApiKeys`; keys are never needed by the memory Worker |
| Analyst's AI client | Its configured model provider | Conversation and selected tool results according to that client's settings; these can contain sensitive findings |

There is no project-author telemetry endpoint. The deployer controls bindings,
Access endpoints and model settings; review those values in the actual deployment.
HTTPS configuration checks do not establish the trustworthiness of a configured
host. Review logging and model-provider data handling before supplying sensitive
evidence. Source: [authentication](../../worker/src/auth/access.ts),
[backend](../../worker/src/search/backend.ts), [configuration](../../worker/src/config.ts).

Installation and CI also contact package registries, GitHub Actions providers,
and Cloudflare deployment APIs. Those are build/operations dependencies, not
hidden finding-export destinations. Consult the lockfile and
[workflows](../../.github/workflows/) when reviewing the supply chain.

## Threat model and limits

| Threat | Implemented boundary | Remaining responsibility |
|---|---|---|
| Untrusted evidence becomes authoritative | Proposal default, cited evidence, browser review; model suggestions always proposed | A human can approve a false claim; allowlisted automation deliberately changes the boundary |
| Client data leaks into another client | Registry membership, per-client Durable Object and vector namespace | Correct identity/membership administration; protect deployer credentials |
| Prompt injection in tool output | Treat findings as data; quote evidence; explicit Hexa tool allowlist | Instructions alone do not enforce a hostile client's behavior; configure client tool permissions too |
| Credential ingestion | Redaction before evidence storage; separate Tenable and memory credentials | Redaction is incomplete by design; do not submit keys or headers as evidence |
| Stale or unconfirmed recall | SQL trust/validity filtering after retrieval | Similarity is relevance, not confidence; an old decision may need reassessment |
| Audit tampering | Append-only triggers, hash chain, history and rollback | Not externally anchored against an administrator controlling code and storage |
| Outages or delayed vectors | Keyword fallback and queued indexing retries | Semantic coverage may lag; report actual search mode and retrieval limits |

See the [security model](../security.md) for fuller limitations. The audit log
has no retention policy. Evidence indexing truncates text before embedding;
keyword coverage and semantic coverage are not identical. Do not represent
either as exhaustive detection or proof of the absence of vulnerabilities.

## Reproduce the checks

Use the pinned tag in a clean checkout with the documented Node prerequisites:

```bash
git clone --branch v0.1.0 https://github.com/Agent9AI/keendreams-security.git
cd keendreams-security/worker
npm ci
npm run typecheck
npm run lint
npm test
npm audit --audit-level=high
```

The release's recorded result is 238 passing offline tests. Local test bindings
are simulated; they do not establish live Tenable or Cloudflare interoperability.
Full-history secret scanning and CodeQL run separately in GitHub Actions.
Use [Start here](../start-here.md) for the real local browser demonstration and
[deployment instructions](../deployment/README.md) for an isolated live install.

For Hexa, follow the [live evaluation procedure](../integrations/tenable.md#first-live-evaluation).
Its evidence must connect a specific asset to a specific plugin/CVE, then show
proposal exclusion, a real human browser decision, and recall/history afterward.
Never substitute a local fixture screenshot for the live result.

## Promotion readiness

- Pin the candidate commit; include passing CI, CodeQL, dependency and full-history
  secret-scan results for that candidate.
- Attach the sanitized live workflow record and screenshots with date, client,
  deployment provenance, query limits and redactions stated.
- Preserve raw records privately; share them only through an agreed private
  channel. Do not publish partner-lab identifiers or credentials.
- Resolve findings or document remaining risks with an owner and follow-up date.
- Verify the contributor profile and a working contact route.
- Ask Tenable to consider the candidate for review. Leave `tier`, partner status,
  review date and vetted commit fields for Tenable to set.

Current gap: the complete live Hexa workflow remains pending. This document makes
the candidate easier to review; it does not declare it ready for promotion.
