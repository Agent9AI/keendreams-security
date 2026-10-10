[Repository](../README.md) / [Documentation](README.md) / Applications and agents

# Security memory for the tools your team uses

KeenDreams Security is an open-source memory layer that an MCP-capable security
application or agent can use to preserve evidence and retrieve reviewed
knowledge. Its semantic vector search helps find related evidence beyond exact
word matches; keyword search supports precise retrieval and remains available
when the embedding or vector service fails. Retrieval does not confer trust:
default recall filters facts by trust and current validity.

## Use it independently of Tenable

The core server requires no Tenable account, Tenable One license, or Hexa
connection. Deploy it in your own Cloudflare account, configure identity, and
connect an MCP client. Hosting and selected AI services have their own costs.
An application or agent can supply authorized evidence from its existing
security reviews, findings, tickets, or incident notes using the memory tools.
Those sources are possible inputs, not a claim of built-in connectors for every
system. The application remains responsible for acquiring and mapping its data.

The core memory service can continue operating with evidence you control if an
optional provider connection becomes unavailable. It cannot retrieve fresh
provider data without that provider's access.

## What the Tenable combination adds

Tenable Hexa MCP lets a connected client retrieve live Tenable exposure data
within the API user's permissions. KeenDreams lets that client consult and
preserve evidence-backed knowledge across investigations and participating
applications. The client or connector coordinates both servers; KeenDreams does
not contain a Tenable polling service.

| Component | Responsibility |
|---|---|
| Tenable and Hexa MCP | Return the scoped assets, findings, and supporting details available to the authorized user. |
| Connecting application or agent | Select scope, invoke approved tools, preserve source identity and timestamps, and map the actual finding to the correct asset. |
| KeenDreams Security | Store quoted evidence, separate proposals from trusted facts, and retrieve facts with their evidence and history. |
| Human reviewer | Inspect the evidence and decide whether to confirm or reject the proposal. |

For example, a client could retrieve a Tenable finding, discover an earlier
time-limited risk decision in memory, and present its expiry and supporting
reason for review. It could also surface new evidence that warrants revisiting
an earlier remediation decision. These are workflow examples, not measured
claims of faster response or better detection.

Tenable already has its own
[risk-decision history](https://docs.tenable.com/web-app-scanning/Content/recast/recast-intro.htm)
and [Hexa contextual memory](https://www.tenable.com/press-releases/tenable-delivers-the-industrys-first-always-on-agentic-fleet-for-exposure-management).
KeenDreams' intended contribution is a separately deployed, open-source memory
service accessible to other applications and agents through MCP. Recording an
acceptance or remediation here does not modify the corresponding Tenable record.

Read-only Tenable access is sufficient for the retrieval side of this design,
provided the user can read the necessary asset and finding details. Hexa's own
license, enablement, and API permissions apply only to that optional integration.
[Connection instructions and acceptance checks](integrations/tenable.md).

## Example security application: Origin Observatory

Origin Observatory is a separate security application developed by Agent9. It
already has investigation tools, evidence records, and human review. Its planned
KeenDreams integration illustrates how an external application can make selected
knowledge available beyond its own workspace. Origin's native records remain
the source of its investigation history; a connector must preserve references,
scope, timestamps, and review status when exchanging information with memory.

The application example is not a requirement for using KeenDreams, an independent
third-party endorsement, or a bundled component. Origin-specific implementation,
deployment settings, and credentials belong in a separate integration repository.
The core repository may contain a sanitized case study and screenshots documenting
what the separate integration actually did.

The intended screenshot sequence is:

1. Origin displays a real, scoped Tenable finding and its source evidence.
2. KeenDreams presents the resulting proposal for human review.
3. A later Origin investigation retrieves the reviewed decision and its evidence.

**Status:** this complete application integration and screenshot sequence are
not yet verified. Existing product-tour images are captures of the KeenDreams
local demo, not screenshots of Origin using Hexa. No relationship between an
Origin target and a Tenable lab asset should be inferred without matching evidence.

## Security agents use the same interface

An agent can use `find_facts` or `recall` before repeating an investigation,
`record_episode` to preserve evidence, and `assert_fact` to propose a relationship.
A fresh agent session connected to the same authorized client memory can query
the stored facts; the agent does not need the original conversation transcript.
The application must still decide when to call these tools. Memory is not injected
automatically into every prompt.

Ordinary MCP writes remain proposals until reviewed. Administrators may explicitly
allowlist a specific automation identity and source for trusted writes. Neither
an agent nor retrieved evidence may grant that permission to itself. A separate
agent-focused demonstration should show the same evidence and trust boundaries.

## Verified today and still to prove

Live Hexa authentication, discovery, and one bounded asset-summary query passed
on 2026-10-10. Both servers also connected in Claude Code. Specific-finding
capture, human review, and recall in a later session remain pending; the Exchange
Hexa compatibility flag stays false until the complete workflow is demonstrated.
[Verification record](verification.md#live-tenable-hexa-check) ·
[Sanitized test evidence](evidence/hexa-2026-10-10.json).
