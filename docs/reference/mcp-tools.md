[Repository](../../README.md) / [Documentation](../README.md) / MCP tools

# MCP tool reference

Nine tools, exposed over MCP. Six are read-only.

| Tool | Reads or writes | What it does |
|---|---|---|
| `recall` | read | Ask a question in plain language. Hybrid keyword and semantic search with quoted evidence. |
| `find_facts` | read | Exact lookup by subject, relationship, object or status, with `as_of` for past dates. |
| `get_entity` | read | Everything known about one asset, vulnerability, identity or indicator. |
| `explore_graph` | read | Walk outward across trusted relationships, up to three hops. |
| `fact_history` | read | The full timeline of one relationship, built for audits. |
| `list_proposals` | read | What is waiting for human review. |
| `record_episode` | write | Store raw evidence. Credentials are redacted before storage. |
| `assert_fact` | write | Propose a relationship, citing the episode that proves it. |
| `suggest_facts` | write | Ask your own model to read one episode and propose relationships. |

Relationships: `HAS_VULN`, `REMEDIATED`, `FALSE_POSITIVE`, `ACCEPTED_RISK`, `OWNS`, `OBSERVED`, `RELATED_TO`.

### Output shape

Every tool returns JSON. Facts always carry a `confidenceLabel` so an agent cannot mistake a proposal for something settled:

```json
{
  "client": "default",
  "search_mode": "hybrid",
  "count": 1,
  "results": [
    {
      "subject": "asset:web-prod-03",
      "predicate": "HAS_VULN",
      "object": "cve:CVE-2026-1234",
      "status": "trusted",
      "confidenceLabel": "TRUSTED",
      "confirmedBy": "alice@example.com",
      "confirmedAt": "2026-09-16T12:01:22.000Z",
      "validFrom": "2026-09-10T00:00:00.000Z",
      "validTo": null,
      "evidence": {
        "source": "tenable-hexa",
        "quote": "Tenable plugin 201455: Apache Struts remote code execution on web-prod-03..."
      }
    }
  ]
}
```

## Behavior annotations

All nine tools publish explicit boolean values for all four
[MCP tool annotations](https://modelcontextprotocol.io/specification/2025-11-25/schema#toolannotations).
The `tools/list` integration check verifies the actual protocol response.

| Tools | `readOnlyHint` | `destructiveHint` | `idempotentHint` | `openWorldHint` |
|---|---|---|---|---|
| `recall`, `find_facts`, `get_entity`, `explore_graph`, `fact_history`, `list_proposals` | `true` | `false` | `true` | `false` |
| `record_episode` | `false` | `false` | `false` | `false` |
| `assert_fact` | `false` | `true` | `false` | `false` |
| `suggest_facts` | `false` | `false` | `false` | `false` |

`assert_fact` may supersede an existing trusted relationship when the writer is
an allowlisted source, so it declares a potentially destructive update. Old
versions remain available in history. Repeated writes can consume write quota,
update observation and audit state, or produce additional model suggestions;
they do not promise idempotency. All tools operate within the deployment's memory,
index, and configured model.

Annotations describe behavior to clients. Access control and the trust boundary
are enforced by the handlers independently of these hints.
