<picture>
  <source media="(prefers-color-scheme: dark) and (max-width: 600px)" srcset="docs/brand/hero-mobile-dark.svg">
  <source media="(max-width: 600px)" srcset="docs/brand/hero-mobile-light.svg">
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/hero-dark.svg">
  <img src="docs/brand/hero-light.svg" width="1280" alt="KeenDreams Security Memory by Agent9. Every decision. Backed by evidence.">
</picture>

<p align="center">
  <a href="https://github.com/Agent9AI/keendreams-security/actions/workflows/ci.yml"><img src="https://github.com/Agent9AI/keendreams-security/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/Agent9AI/keendreams-security/actions/workflows/codeql.yml"><img src="https://github.com/Agent9AI/keendreams-security/actions/workflows/codeql.yml/badge.svg" alt="CodeQL"></a>
  <a href="https://github.com/Agent9AI/keendreams-security/actions/workflows/secret-scan.yml"><img src="https://github.com/Agent9AI/keendreams-security/actions/workflows/secret-scan.yml/badge.svg" alt="Secret scan"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-235d42" alt="MIT license"></a>
</p>

**Your security team already made the decision. Your next agent should be able to find it.**

KeenDreams is shared memory for security agents and analysts: what was found,
what was remediated, which risks were accepted, and the evidence behind each
decision. It is an open-source MCP server that runs in **your own Cloudflare
account**, with browser review, isolated client memories, and an auditable history.

[**Try the demo**](#try-it-locally) &nbsp;·&nbsp;
[Deploy](docs/deployment/README.md) &nbsp;·&nbsp;
[Architecture](docs/architecture.md) &nbsp;·&nbsp;
[Tool reference](docs/reference/mcp-tools.md) &nbsp;·&nbsp;
[Documentation](docs/README.md)

## Try it locally

Node.js 22 or later. No account or sign-in configuration needed for the demo.

```bash
git clone https://github.com/Agent9AI/keendreams-security
cd keendreams-security/worker
npm ci
npm run demo
```

Open **[the review queue](http://localhost:8787/review)** or
**[the admin page](http://localhost:8787/admin)**. The demo seeds sample evidence
and a local reviewer identity. Cloud-only health checks are marked **live only**.

## The product, in two pages

| Review the evidence | Inspect the memory |
|:---|:---|
| [![Review queue with proposed facts, quoted evidence, and confirm or reject actions](docs/images/review-queue.png)](docs/images/review-queue.png) | [![Admin page with deployment health, audit verification, and client controls](docs/images/admin.png)](docs/images/admin.png) |
| **`/review`** connects each proposal to its evidence. A reviewer confirms or rejects it in the browser. | **`/admin`** checks live services, verifies audit chains, supports rollback, and manages client access. |

<details>
<summary>Watch the review queue turn proposals into decisions</summary>

![A reviewer confirms three proposals, then inspects the audit chain](docs/images/review-flow.gif)

The sequence ends on the admin page, where the recorded decisions are checked
against the hash chain. [Walk through the actual tool responses](docs/walkthrough.md).

</details>

## Evidence first. Trust is a separate decision.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/trust-path-dark.svg">
  <img src="docs/brand/trust-path-light.svg" width="1280" alt="Record evidence, propose an unconfirmed fact, review in a browser, then recall with provenance. Explicit admin allowlists can let named automation sources write trusted facts directly.">
</picture>

1. **Record** raw evidence as a quoted episode. Credential-shaped strings are redacted.
2. **Propose** a relationship that cites that episode. Model suggestions always start unconfirmed.
3. **Review** in a signed-in browser. There is no MCP tool that confirms a proposal.
4. **Recall** trusted, currently valid facts with their evidence and decision history.

Administrators can separately allowlist a specific automation identity and source
to write trusted facts. A caller cannot grant itself that permission or choose a
trusted status. [Read the trust model](docs/architecture.md#the-trust-lifecycle).

For the ordinary MCP path, the result is observable: a newly proposed fact is
absent from default recall; after browser confirmation, it appears with its
provenance. [See the reproducible walkthrough](docs/walkthrough.md).

## What your team gets back

| The recurring problem | The useful answer |
|---|---|
| A finding was already investigated | Retrieve the earlier decision and its supporting evidence. |
| A risk acceptance outlived its intended window | An expiry and reason are required; expired acceptances stop appearing as current. |
| A previously fixed vulnerability returns | A newly trusted finding supersedes the remediation, preserving the timeline. |
| An auditor asks who decided and why | Inspect the actor, time, evidence, and history of the relationship. |
| One service is unavailable | Recall falls back to keyword search when the vector or embedding service fails. |

[Explore the workflows](docs/walkthrough.md#practical-workflows).

## How it runs

**MCP client → OAuth + Worker → one memory database per client.**

Each client gets a Durable Object with SQLite and full-text search. Vectorize
adds semantic recall in a separate namespace for that client. Workers AI supplies
embeddings and optional suggestions. A registry controls access and trusted sources.

| Boundary | Implementation |
|---|---|
| Identity | Cloudflare Access for SaaS, OAuth 2.1, PKCE, and dynamic client registration |
| Memory | Per-client SQLite, evidence-linked relationships, validity windows, and history |
| Retrieval | Keyword + vector search, followed by trust and validity filtering |
| Human control | Browser review, administrative allowlists, and audited rollback |
| Ownership | Your Worker, account, data, model configuration, and billing |

[Architecture and diagrams](docs/architecture.md) ·
[Security model and data flows](docs/security.md)

## Tools

Nine MCP tools. **Six reads, three writes.** All four behavior hints are explicit.

| Read | Purpose | Write | Purpose |
|---|---|---|---|
| `recall` | Ask in plain language | `record_episode` | Store quoted evidence |
| `find_facts` | Filter exact relationships | `assert_fact` | Propose an evidence-linked fact |
| `get_entity` | Inspect one entity | `suggest_facts` | Propose relationships from an episode |
| `explore_graph` | Follow trusted relationships | | |
| `fact_history` | Inspect the full timeline | | |
| `list_proposals` | Inspect the review queue | | |

[Full tool reference, output examples, and annotations](docs/reference/mcp-tools.md).

## Deploy in your account

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Agent9AI/keendreams-security/tree/main/worker)

The [deployment guide](docs/deployment/README.md) covers prerequisites, bindings,
settings, and connecting an MCP client. The deployer owns the infrastructure;
there is no service operated by Agent9 that receives your evidence.

### Sign-in setup

Configure Cloudflare Access for SaaS and the Worker secrets, then connect your
MCP client. [Follow the sign-in instructions](docs/deployment/README.md#sign-in-setup).

### Using it with Tenable

The included [`/hexa-to-memory` skill](SKILL.md) uses an explicit allowlist of
Hexa read tools to compare findings with prior decisions and record proposals.
[Integration guide](docs/integrations/tenable.md) ·
[Exchange submission status](docs/exchange/README.md).

## Security posture and verification

**237 tests across 26 files**, plus typechecking, lint, CodeQL, and full-history
secret scanning. The badges above open the actual workflow results.

Live checks on September 17, 2026 verified Workers AI, Vectorize, hybrid recall,
and model-generated proposals. They also found a production response-format bug
that the offline stand-ins missed; the fix is covered by regression tests.

> **Still to verify:** a real MCP client completing sign-in through a live
> Cloudflare Access application, and the Hexa recipe against a live Tenable One
> tenant. Semantic indexing is asynchronous, and the audit log has no retention
> policy yet. [Evidence, procedures, and all known limitations](docs/verification.md).

For vulnerability reports, use the [private reporting process](.github/SECURITY.md).

## Repository map

| Location | What belongs here |
|---|---|
| [`worker/`](worker/) | Self-contained application, package manifest, and deployment configuration |
| [`worker/src/`](worker/src/) | Authentication, memory, policy, search, and browser pages |
| [`worker/tests/`](worker/tests/) | Offline suite, fixtures, and opt-in live checks |
| [`docs/`](docs/README.md) | Guides, reference, verification, screenshots, and the brand kit |
| [`.github/`](.github/) | CI, security scans, contribution guidelines, and issue templates |
| [`SKILL.md`](SKILL.md) | Discoverable Hexa-to-memory skill |
| [`worker/wrangler.jsonc`](worker/wrangler.jsonc) | Portable Cloudflare deployment configuration |

The root keeps the entry points. Supporting configuration lives beside the code
or tests it serves. [Find your way through the documentation](docs/README.md).

## Development

```bash
cd worker
npm ci
npm run typecheck
npm run lint
npm test
npm run demo
```

Run these commands from `worker/`. `npm run types` regenerates bindings under `worker/src/`.
`npm run verify:live` is an opt-in check against your own account.
[Contributing](.github/CONTRIBUTING.md) · [Live verification](docs/verification.md#live-infrastructure).

---

**Built by [Agent9](https://agent9.dev/?utm_source=github&utm_medium=readme&utm_campaign=keendreams-security). Owned by you.**

MIT licensed. The complete implementation is here. For deployment, identity setup,
and integration with your team's scanners and workflows,
[work with Agent9](https://agent9.dev/?utm_source=github&utm_medium=readme&utm_campaign=keendreams-security).
