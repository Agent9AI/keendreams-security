[Repository](../../README.md) / [Tenable](tenable.md) / Claude Code skill

# Install and evaluate Hexa to Memory

The MCP server provides storage, trust checks, and retrieval. The
[`hexa-to-memory` skill](../../SKILL.md) supplies the analyst procedure: compare a
scoped Tenable finding with prior decisions, preserve evidence, and propose new
facts for a person to review. It is not an autonomous risk-acceptance agent.

## Install in Claude Code

Prerequisites: Git, Claude Code, a working KeenDreams Security MCP connection,
and a read-capable Tenable Hexa connection. Configure credentials using the
[integration guide](tenable.md#connect-without-exposing-keys); never put them in
the skill directory.

For a new installation, clone the repository into Claude Code's personal skills
directory. The repository-root `SKILL.md` is the entry point:

This layout follows [Claude Code's skill loading documentation](https://code.claude.com/docs/en/skills).

```bash
mkdir -p ~/.claude/skills
git clone https://github.com/Agent9AI/keendreams-security.git ~/.claude/skills/hexa-to-memory
git -C ~/.claude/skills/hexa-to-memory rev-parse HEAD
```

If that directory already exists, inspect its origin and local changes before
updating it; do not overwrite another skill. Record and review the installed
commit. For controlled evaluations, check out the exact approved revision rather
than silently pulling a moving branch. No Worker deployment or package install
is needed merely to load the skill.

Start Claude Code in the project where both MCP servers are configured. Use
`/mcp` to verify the connections, then invoke:

```text
/hexa-to-memory Inspect one agreed lab asset. Compare current decisions and
pending proposals, propose only evidence-backed new findings, and stop for my
browser review. Do not modify Tenable or accept risk on my behalf.
```

Specify the actual asset in the private client session, not in a public issue.
The skill asks for scope and additional read-tool approval when needed. It also
checks that copying the selected evidence into this memory client is authorized.

## What a useful result looks like

| Returned evidence | Report interpretation |
|---|---|
| Asset summary containing vulnerability counts only | Mapping incomplete; no asset-to-CVE assertion |
| Asset/plugin evidence, no current facts or pending proposals | New finding eligible for a proposal |
| Matching unconfirmed proposal | Pending review; reuse it |
| Confirmed `HAS_VULN` | Known finding; no disposition implied |
| Current `ACCEPTED_RISK` with reason and expiry | Prior decision; expose scope, reviewer and expiry |
| Live evidence after a `REMEDIATED` decision | Needs reassessment; preserve both records |
| Error, result cap, or unavailable tool | Coverage gap; no claim that nothing exists |

A previous decision informs the analyst; it does not automatically suppress new
evidence. Only a person reviews the proposal through the browser. The skill
cannot turn a conversation's agreement into a browser approval or claim an
automatically trusted assertion was human-reviewed.

## Verification and ownership

Maintainer: Agent9AI. Declared client: Claude Code. Required authority: scoped
Tenable reads, access to the selected memory client, and explicit permission for
memory writes. Browser reviewer/admin access is needed for the human step.

Use the [live evaluation](tenable.md#first-live-evaluation) and
[behavioral evaluation cases](../verification/hexa-skill-cases.md). Syntax
validation is not behavioral validation. The current
[verification record](../verification.md#live-tenable-hexa-check) states exactly
which live stages have passed. The companion Exchange listing is prepared;
publication and any interoperability badge remain separate review steps.
