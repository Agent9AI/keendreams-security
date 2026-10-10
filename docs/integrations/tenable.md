[Repository](../../README.md) / [Documentation](../README.md) / Tenable

# Tenable Hexa integration

**Tenable is optional.** KeenDreams Security works without a Tenable account or
Tenable One license. This guide covers the additional requirements for using
Hexa as an evidence source. The core memory layer serves applications and agents
through the same MCP tools. [How the components fit together](../applications-and-agents.md).

> **Live verification, 2026-10-10:** Hexa authentication, tool discovery, and one
> bounded asset-with-vulnerabilities query passed. The full finding-to-memory,
> human-review, and recall workflow remains to be verified. See the
> [verification record](../verification.md#live-tenable-hexa-check).

Tenable's [Hexa AI MCP server](https://docs.tenable.com/exposure-management/Content/getting-started/hexa-AI-MCP.htm) exposes your exposure data to an MCP client. Connect both servers in the same session and an analyst can pull live findings from Tenable and check them against what the team already decided.

## Connect without exposing keys

Tenable requires Tenable One Foundation or Advanced, Hexa AI MCP enabled, a
read-capable role, and Vulnerability Management API keys. Create or retrieve the
keys under Settings > My Account > API Keys.

Load the two key values into `TENABLE_ACCESS_KEY` and `TENABLE_SECRET_KEY` from
your credential manager. Do not paste either value into chat, shell history, or
version control. Claude Code supports environment-variable expansion in HTTP MCP
headers, so a project `.mcp.json` can contain references rather than credentials:

```json
{
  "mcpServers": {
    "tenable-hexa": {
      "type": "http",
      "url": "https://cloud.tenable.com/mcp/",
      "headers": {
        "X-ApiKeys": "accessKey=${TENABLE_ACCESS_KEY};secretKey=${TENABLE_SECRET_KEY}"
      }
    }
  }
}
```

Your Tenable keys stay in your local environment; the MCP configuration contains
only variable names. This project never sees the keys.
Run `/mcp` in Claude Code and confirm both `tenable-hexa` and
`keendreams-security` are connected before querying any finding.

An existing connection named `tenable` can be used without creating a second
connection. The skill identifies the Tenable endpoint and uses the actual tool
prefix. Partner integrations should include
`User-Agent: Integration/1.0 (VENDOR; PRODUCT; Build/VERSION)` using their actual
vendor, product, and version, as described in
[Tenable's integration guidance](https://developer.tenable.com/docs/user-agent-header).

> **Note:** Hexa includes tools that write as well as tools that read. Documented write tools include `scan_create`, `scan_launch`, `ticket_create_issue` and `ticket_notify_assignees`. Anything that reads from Hexa on your behalf should name the specific read tools it may call rather than letting a model choose.

This repository ships [`SKILL.md`](../../SKILL.md), a `/hexa-to-memory` skill for Claude Code that does exactly that: it allowlists three Hexa read tools by name, refuses Tenable writes, checks each finding against what your team already decided, and leaves new facts as proposals for review. The live server did not expose the previously documented `asset_search`; use discovery rather than assuming it exists.

The workflow runs through an MCP client connected to both servers. It is not a
background synchronization service. Asset-level counts alone cannot support a
specific vulnerability assertion; the workflow requires evidence linking the
particular asset to the CVE or Tenable plugin.

## First live evaluation

Use one named asset or one CVE. Do not start with the whole tenant.

1. Ask `/hexa-to-memory` to retrieve that scope using its discovered, allowlisted
   Hexa read tools. Approve any additional scoped read tool explicitly before use.
2. Record the returned batch as one `tenable-hexa` episode and propose each live
   asset/finding pair as `HAS_VULN`.
3. Confirm that default `recall` returns none of the new proposals. Open the
   returned `/review` link, inspect the quoted Tenable evidence, and confirm or
   reject at least one proposal.
4. Run the same recall again. Only the human-confirmed decision should appear,
   with reviewer, time, and evidence.
5. Repeat the same Tenable query. The report must distinguish already-triaged
   findings from new work without issuing any Tenable write action.

| Acceptance check | Pass condition |
|---|---|
| Tenable boundary | Only allowlisted or explicitly approved scoped read tools run. |
| Evidence | One quoted episode records the scoped Hexa response. |
| Trust | New facts remain `UNCONFIRMED` until browser review. |
| Recall | Confirmed decisions return with reviewer, time, and evidence. |
| Repeat work | The second query identifies decisions already made. |
| Safety | No scan, ticket, tag, dashboard, update, or delete tool runs. |

This sequence proves the useful product claim: KeenDreams is not another scanner;
it remembers the disposition of scanner findings so the next investigation starts
from the team's prior evidence and decisions.

## Exchange submission

The MCP-server listing was merged in
[Tenable PR #189](https://github.com/tenable/cyberagents-exchange/pull/189) and is
[published on the Exchange](https://exchange.tenable.com/mcp-servers/keendreams-security-memory/).
The [submission directory](../exchange/README.md) contains the listing sources and
the companion skill. The Hexa interoperability flag remains false until the full
workflow has been demonstrated; Exchange publication is not interoperability certification.
