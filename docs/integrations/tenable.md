[Repository](../../README.md) / [Documentation](../README.md) / Tenable

# Tenable Hexa integration

> The recipe is implemented, but has not been exercised against a live Tenable
> One tenant. No Tenable approval, certification, or completed listing is implied.

Tenable's [Hexa AI MCP server](https://docs.tenable.com/exposure-management/Content/getting-started/hexa-AI-MCP.htm) exposes your exposure data to an MCP client. Connect both servers in the same session and an analyst can pull live findings from Tenable and check them against what the team already decided.

```bash
claude mcp add --transport http tenable-hexa https://cloud.tenable.com/mcp/ \
  --header "X-ApiKeys: accessKey=<ACCESS_KEY>;secretKey=<SECRET_KEY>"
```

Your Tenable keys stay in your own MCP client configuration. This project never sees them.

> **Note:** Hexa includes tools that write as well as tools that read. Documented write tools include `scan_create`, `scan_launch`, `ticket_create_issue` and `ticket_notify_assignees`. Anything that reads from Hexa on your behalf should name the specific read tools it may call rather than letting a model choose.

This repository ships [`SKILL.md`](../../SKILL.md), a `/hexa-to-memory` skill for Claude Code that does exactly that: it allowlists four Hexa read tools by name, refuses everything that writes, checks each finding against what your team already decided, and leaves the result as proposals for review.

## Exchange submission

The [submission directory](../exchange/README.md) contains the prepared MCP-server
and skill listings, validation notes, and remaining prerequisites. The contribution
agreement and live interoperability claims must be settled before submission.
