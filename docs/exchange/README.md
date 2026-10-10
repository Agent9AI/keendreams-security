# CyberAgents Exchange submission

This directory holds the listing sources used in a fork of
[`tenable/cyberagents-exchange`](https://github.com/tenable/cyberagents-exchange)
for Exchange submissions. The path here mirrors the path there, so each file
moves across unchanged.

The MCP-server listing was merged on 2026-09-28 in
[Tenable PR #189](https://github.com/tenable/cyberagents-exchange/pull/189) and is
[published on the Exchange](https://exchange.tenable.com/mcp-servers/keendreams-security-memory/).
The companion skill remains prepared separately:

| File | Type | Status |
|---|---|---|
| `mcp-servers/keendreams-security-memory.md` | MCP server | Published; Hexa verification update prepared for upstream review |
| `skills/hexa-to-memory.md` | Skill | Prepared separately with bounded live and synthetic evidence |

Both validate against Tenable's `validator.py` at Exchange commit
`de2b758e89af4763b7028a5de70322013c6ba30b`, checked on 2026-10-10.
This is metadata validation, not an interoperability or security certification.

## How the listing was checked

```bash
git clone https://github.com/tenable/cyberagents-exchange
cd cyberagents-exchange
cp <this repo>/docs/exchange/mcp-servers/keendreams-security-memory.md mcp-servers/
python3.13 -m venv .venv && ./.venv/bin/pip install pydantic python-frontmatter pyyaml rich typer
./.venv/bin/python validator.py --path .
```

The validator needs Python 3.10 or later. It reports each file individually and
exits non-zero if any fail.

Four deliberately broken variants were also run to confirm the check is
meaningful rather than vacuous: `Cloudflare` in `integrations`, `cta` without the
Hexa flag, the Hexa flag without the Hexa integration, and three `domains`
values. All four were rejected with the expected message.

## Hexa interoperability and review status

The listing sources now set the interoperability flag based on the October 10
live finding-to-evidence, proposal, human-review and recall check. The
[verification record](../verification.md#live-tenable-hexa-check) defines its scope. The published
Exchange listing changes only after Tenable merges the corresponding update.

```yaml
integrations: ["Tenable", "Tenable Hexa AI MCP"]
works_with_tenable_hexa_mcp: true
```

The validator requires the Hexa integration value when the flag is true, and
requires the flag when the optional `cta` is present. It does not require adding
a call to action merely because interoperability has been verified. No `cta`
is added here; the repository's own support link remains separate.

`tier` remains `contributed`. Tenable sets partner/review/vetted metadata, and
successful interoperability does not grant those statuses. Submit the existing
MCP listing update and new skill listing as separate pull requests.

**`Cloudflare` is not listed under `integrations`.** It is not in the validator's
vocabulary, so the design document's assumption that it could be added in the
same pull request would fail validation today. Adding a vocabulary value is a
separate change to Tenable's own repository and should not be bundled with a
listing submission.

## Submission record

- `compatible_clients` claims Claude Code. The full OAuth and MCP path is proven
  by the end to end test suite and a real Claude Code client completed sign-in
  through the deployed Cloudflare Access button on 2026-09-22.
- The owner accepted the Contribution Agreement on 2026-09-22, and posted the
  requested acknowledgment on the upstream pull request before it merged.
- Full Hexa interoperability remains a separate verification gate from Exchange
  publication and successful MCP authentication.

- That gate passed for the bounded observed-finding workflow on 2026-10-10;
  accepted-risk, remediation and false-positive scenarios remain separate checks.

## Verified since the listing was first written

- A real Claude Code OAuth connection completed through the deployed Cloudflare
  Access button on 2026-09-22; see the [live sign-in record](../verification.md#live-browser-sign-in).
- Vectorize, Workers AI embeddings and `suggest_facts` were run against real
  infrastructure on 2026-09-17 (see the [live verification record](../verification.md#live-infrastructure)). The
  run found and fixed a bug that made every production suggestion fail.
- The repository is public, so every link in the listing resolves.
