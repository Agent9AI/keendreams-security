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
| `mcp-servers/keendreams-security-memory.md` | MCP server | Published |
| `skills/hexa-to-memory.md` | Skill | Prepared; full live Hexa workflow pending |

Both validate cleanly against Tenable's `validator.py`, re-downloaded and re-run
on 2026-09-17.

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

## Two claims deliberately left switched off

**The published MCP listing keeps `works_with_tenable_hexa_mcp` false and has no
Hexa call to action.**

Setting `cta: "T1"` is what renders the "Powered by Hexa AI" treatment and a
"Request a Demo" link on the listing, and the validator will only accept it when
`works_with_tenable_hexa_mcp` is `true`. That flag is a claim of verified
interoperability, and the project's own design document requires it to be proven
against a live Tenable One instance before it is set.

Live authentication, tool discovery, and one bounded Hexa read passed on
2026-10-10. The complete finding-to-memory, review, and recall test is still
pending; see the [verification record](../verification.md#live-tenable-hexa-check).
Once the Hexa recipe has been exercised end to end against a real tenant,
three lines change together:

```yaml
integrations: ["Tenable", "Tenable Hexa AI MCP"]
works_with_tenable_hexa_mcp: true
cta: "T1"
```

The validator enforces that these three move as a set, which is a good design:
the demo call to action cannot appear without the interoperability claim behind
it.

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

## Verified since the listing was first written

- A real Claude Code OAuth connection completed through the deployed Cloudflare
  Access button on 2026-09-22; see the [live sign-in record](../verification.md#live-browser-sign-in).
- Vectorize, Workers AI embeddings and `suggest_facts` were run against real
  infrastructure on 2026-09-17 (see the [live verification record](../verification.md#live-infrastructure)). The
  run found and fixed a bug that made every production suggestion fail.
- The repository is public, so every link in the listing resolves.
