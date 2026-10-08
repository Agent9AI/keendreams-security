[Repository](../../README.md) / [Documentation](../README.md) / Tenable

# Tenable Hexa integration

> The MCP server listing is live, but this recipe has not been exercised against
> a Tenable One tenant. No Tenable approval, certification, or verified Hexa
> interoperability is implied.

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

> **Note:** Hexa includes tools that write as well as tools that read. Documented write tools include `scan_create`, `scan_launch`, `ticket_create_issue` and `ticket_notify_assignees`. Anything that reads from Hexa on your behalf should name the specific read tools it may call rather than letting a model choose.

This repository ships [`SKILL.md`](../../SKILL.md), a `/hexa-to-memory` skill for Claude Code that does exactly that: it allowlists four Hexa read tools by name, refuses everything that writes, checks each finding against what your team already decided, and leaves the result as proposals for review.

## First live evaluation

Use one named asset or one CVE. Do not start with the whole tenant.

1. Ask `/hexa-to-memory` to retrieve that scope using only its four allowlisted
   Hexa read tools.
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
| Tenable boundary | Only the four allowlisted read tools run. |
| Evidence | One quoted episode records the scoped Hexa response. |
| Trust | New facts remain `UNCONFIRMED` until browser review. |
| Recall | Confirmed decisions return with reviewer, time, and evidence. |
| Repeat work | The second query identifies decisions already made. |
| Safety | No scan, ticket, tag, dashboard, update, or delete tool runs. |

This sequence proves the useful product claim: KeenDreams is not another scanner;
it remembers the disposition of scanner findings so the next investigation starts
from the team's prior evidence and decisions.

## Exchange submission

The MCP-server listing is live on the CyberAgents Exchange. The companion skill
listing and the verified Hexa interoperability claim remain gated on the live
evaluation above. See the [listing status](../exchange/README.md).
