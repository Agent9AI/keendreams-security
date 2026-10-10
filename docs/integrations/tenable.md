[Repository](../../README.md) / [Documentation](../README.md) / Tenable

# Tenable Hexa integration

> **Live verification, 2026-10-10:** Hexa authentication, tool discovery, and one
> bounded asset-with-vulnerabilities query passed. The full finding-to-memory,
> human-review, and recall workflow remains to be verified. See the
> [verification record](../verification.md#live-tenable-hexa-check).

Tenable's [Hexa AI MCP server](https://docs.tenable.com/exposure-management/Content/getting-started/hexa-AI-MCP.htm) exposes your exposure data to an MCP client. Connect both servers in the same session and an analyst can pull live findings from Tenable and check them against what the team already decided.

```bash
claude mcp add --transport http tenable-hexa https://cloud.tenable.com/mcp/ \
  --header "X-ApiKeys: accessKey=<ACCESS_KEY>;secretKey=<SECRET_KEY>"
```

Your Tenable keys stay in your own MCP client configuration. This project never sees them.

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

## Exchange submission

The MCP-server listing was merged in
[Tenable PR #189](https://github.com/tenable/cyberagents-exchange/pull/189) and is
[published on the Exchange](https://exchange.tenable.com/mcp-servers/keendreams-security-memory/).
The [submission directory](../exchange/README.md) contains the listing sources and
the companion skill. The Hexa interoperability flag remains false until the full
workflow has been demonstrated; Exchange publication is not interoperability certification.
