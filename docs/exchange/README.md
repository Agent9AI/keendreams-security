# CyberAgents Exchange submission

This directory holds the listing that gets copied into a fork of
[`tenable/cyberagents-exchange`](https://github.com/tenable/cyberagents-exchange)
when the submission is made. The path here mirrors the path there, so the file
moves across unchanged.

Two listings are prepared, one per pull request as Tenable prefers:

| File | Type | Submit |
|---|---|---|
| `mcp-servers/keendreams-security-memory.md` | MCP server | First |
| `skills/hexa-to-memory.md` | Skill | After the first merges |

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

**`works_with_tenable_hexa_mcp` is `false` and there is no `cta`.**

Setting `cta: "T1"` is what renders the "Powered by Hexa AI" treatment and a
"Request a Demo" link on the listing, and the validator will only accept it when
`works_with_tenable_hexa_mcp` is `true`. That flag is a claim of verified
interoperability, and the project's own design document requires it to be proven
against a live Tenable One instance before it is set.

That test has not been run. Until it is, the honest values are the ones in the
file. Once the Hexa recipe has been exercised end to end against a real tenant,
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

## Still outstanding before submitting

- `contribution_agreement_date` is absent. It is the repository owner's to add,
  because adding it asserts acceptance of Tenable's Contribution Agreement.
- `compatible_clients` claims Claude Code. The full OAuth and MCP path is proven
  by the end to end test suite and the deployed endpoints answer correctly, but a
  real Claude Code client has not yet completed a sign-in against a deployment
  with Cloudflare Access configured.

## Verified since the listing was first written

- Vectorize, Workers AI embeddings and `suggest_facts` were run against real
  infrastructure on 2026-09-17 (see the README's live verification table). The
  run found and fixed a bug that made every production suggestion fail.
- The repository is public, so every link in the listing resolves.
- The pull request title must read `Add listing: KeenDreams Security Memory`, and
  the description must carry the Contribution Agreement acceptance statement.
