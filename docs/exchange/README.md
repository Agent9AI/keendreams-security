# CyberAgents Exchange submission

The KeenDreams Security Memory MCP-server listing was published on the
[CyberAgents Exchange](https://exchange.tenable.com/mcp-servers/keendreams-security-memory/)
on September 17, 2026. This directory retains the source listing and the
companion skill listing that has not yet been submitted.

Current status as of October 8, 2026:

| File | Type | Status |
|---|---|---|
| `mcp-servers/keendreams-security-memory.md` | MCP server | Published as Contributed |
| `skills/hexa-to-memory.md` | Skill | Prepared; not yet published |

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

## Still outstanding

- Run the documented `/hexa-to-memory` workflow against the Tenable One trial,
  using one asset or one CVE and only the four allowlisted read tools.
- Preserve the tool responses and memory review result as interoperability
  evidence without recording credentials.
- After that test passes, update the published MCP listing's Hexa fields as one
  change and submit `skills/hexa-to-memory.md` as its own pull request.
- Keep the current listing unchanged if any part of the live workflow remains
  unverified.

## Verified since the listing was first written

- A real Claude Code OAuth connection completed through the deployed Cloudflare
  Access button on 2026-09-22; see the [live sign-in record](../verification.md#live-browser-sign-in).
- Vectorize, Workers AI embeddings and `suggest_facts` were run against real
  infrastructure on 2026-09-17 (see the [live verification record](../verification.md#live-infrastructure)). The
  run found and fixed a bug that made every production suggestion fail.
- The repository is public, so every link in the listing resolves.
