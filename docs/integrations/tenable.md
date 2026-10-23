[Repository](../../README.md) / [Documentation](../README.md) / Tenable

# Tenable Hexa integration

**Tenable is optional.** KeenDreams Security works without a Tenable account or
Tenable One license. This guide covers the additional requirements for using
Hexa as an evidence source. The core memory layer serves applications and agents
through the same MCP tools. [How the components fit together](../applications-and-agents.md).

> **Live verification, 2026-10-10:** Hexa authentication, tool discovery, and one
> bounded finding retrieval passed. One specific plugin finding was recorded as
> an unconfirmed memory proposal and excluded from default recall, then confirmed
> by a person and recalled with its original evidence and reviewer. A repeated
> source query recognized the known finding. See the
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

The configuration above contains variable references, not stored secrets. Your
MCP client resolves the values locally and sends the `X-ApiKeys` header to
Tenable over HTTPS. KeenDreams Security does not require that header or those
keys. Its separate MCP connection uses the deployer's OAuth sign-in.

Environment variables are a delivery mechanism, not an encrypted credential
store. Load them from your credential manager into the intended client process;
avoid committing them to an environment file or exposing them in debug output.
If either key is unavailable, stop setup before making requests. Do not use
placeholder credentials, widen permissions, or disable authentication to make
a connection succeed. Run `/mcp` and confirm both the Tenable connection and
`keendreams-security` are connected before querying any finding.

Only the Tenable connection receives the Tenable authentication header. Never
copy that header to the KeenDreams connection, a browser-side integration, or a
different provider. Keep TLS certificate verification enabled. A custom adapter
must validate the destination and must not forward credentials across a redirect
to another origin.

Evidence episodes contain the scoped finding response, never API keys,
authorization headers, client configuration, or diagnostic logs containing
secrets. Memory's credential redaction is an additional safeguard, not a reason
to submit credentials as evidence. Public verification artifacts and screenshots
must omit credentials and private asset identifiers.

An existing connection named `tenable` can be used without creating a second
connection. The skill identifies the Tenable endpoint and uses the actual tool
prefix. Partner integrations should include
`User-Agent: Integration/1.0 (VENDOR; PRODUCT; Build/VERSION)` using their actual
vendor, product, and version, as described in
[Tenable's integration guidance](https://developer.tenable.com/docs/user-agent-header).

> **Note:** Hexa includes tools that write as well as tools that read. Documented write tools include `scan_create`, `scan_launch`, `ticket_create_issue` and `ticket_notify_assignees`. Anything that reads from Hexa on your behalf should name the specific read tools it may call rather than letting a model choose.

This repository ships [`SKILL.md`](../../SKILL.md), a `/hexa-to-memory` skill for Claude Code ([see it working on live data](../hexa-to-memory.md)) that does exactly that: it allowlists five Hexa read tools by name, refuses Tenable writes, checks each finding against what your team already decided, and leaves ordinary new facts as proposals for review. The two asset-scoped tools provide the specific asset/plugin evidence needed for an assertion. The live server did not expose the previously documented `asset_search`; use discovery rather than assuming it exists.

Follow the [skill installation instructions](#install-the-claude-code-skill) below.
A confirmed finding and a triage disposition are different:
`HAS_VULN` alone does not mean the risk was accepted or the vulnerability fixed.

The workflow runs through an MCP client connected to both servers. It is not a
background synchronization service. Asset-level counts alone cannot support a
specific vulnerability assertion; the workflow requires evidence linking the
particular asset to the CVE or Tenable plugin.

## Install the Claude Code skill

After configuring both MCP connections, install the repository-root `SKILL.md`
using [Claude Code's personal skill layout](https://code.claude.com/docs/en/skills):

```bash
mkdir -p ~/.claude/skills
git clone https://github.com/Agent9AI/keendreams-security.git ~/.claude/skills/hexa-to-memory
git -C ~/.claude/skills/hexa-to-memory rev-parse HEAD
```

Review and pin the installed commit for controlled use. If the directory already
exists, inspect its origin and local changes before updating; do not overwrite it.
Loading the skill needs no Worker deployment or package installation. Keep
credentials out of the skill directory. In the project where both MCP connections
are configured, verify them with `/mcp`, then invoke `/hexa-to-memory` with one
agreed asset or vulnerability scope. Specify the actual identifiers privately.

The report distinguishes new findings, pending proposals, confirmed observations,
prior dispositions and conflicts. A prior decision informs review; it does not
automatically suppress fresh findings. Browser confirmation remains the person's
action. [Verified behavior and limits](../verification.md#live-tenable-hexa-check).

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
5. Repeat the same Tenable query. Distinguish known observations, pending
   proposals, applicable prior decisions and conflicts without issuing any
   Tenable write action. A confirmed observation is not a triage disposition.

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
the companion skill. The listing update that sets the Hexa interoperability flag,
based on the bounded live workflow, is in review as
[Tenable PR #213](https://github.com/tenable/cyberagents-exchange/pull/213). The
Exchange changes only when Tenable merges it; publication and interoperability
testing are not certification.
