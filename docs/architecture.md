[Repository](../README.md) / [Documentation](README.md) / Architecture

# Architecture

KeenDreams separates raw evidence, proposed claims, and trusted decisions. This
page describes the implemented system; the longer [design record](design.md)
preserves the original design rationale.

```mermaid
flowchart LR
  subgraph Clients
    CC["Claude Code<br/>or any MCP client"]
    BR["Reviewer<br/>in a browser"]
  end

  subgraph CF["Your Cloudflare account"]
    W["Worker<br/>OAuth provider + MCP server"]
    RG[("Registry<br/>Durable Object")]
    CM[("ClientMemory<br/>Durable Object<br/>SQLite + FTS5")]
    VX[["Vectorize<br/>one namespace per client"]]
    AI[["Workers AI<br/>embeddings + suggestions"]]
  end

  ACC["Cloudflare Access<br/>your identity provider"]

  CC -- "MCP over HTTP<br/>OAuth 2.1 + PKCE" --> W
  BR -- "/review" --> W
  W -- "sign in" --> ACC
  W --> RG
  W --> CM
  CM --> VX
  CM --> AI

  style CF fill:#0d1319,stroke:#2f4257,color:#e8edf2
  style ACC fill:#3a2f12,stroke:#6b5520,color:#f3e2b8
```

One `ClientMemory` Durable Object holds one client's entire memory in its own SQLite database, so two tenants never share a table. The `Registry` decides who may open which client and which automation sources are trusted.

### The trust lifecycle

This is the heart of the design. A fact's status is not a label a caller can set.

```mermaid
stateDiagram-v2
  [*] --> proposed: assert_fact over MCP<br/>or suggest_facts
  [*] --> trusted: allowlisted automation source<br/>(an explicit admin decision)
  proposed --> trusted: a human confirms<br/>in the browser
  proposed --> rejected: a human rejects
  trusted --> superseded: a newer trusted fact<br/>replaces it
  superseded --> trusted: rollback to an audit point
  trusted --> proposed: rollback to an audit point

  note right of proposed
    recall and find_facts hide these
    by default. They are always
    labelled UNCONFIRMED.
  end note
```

Nothing written over MCP starts trusted, whatever the caller's role. The single exception is an identity an administrator has explicitly allowlisted for a named source, for example a scheduled Tenable sync.

### Recall

`recall` fuses keyword and semantic search, then filters by trust and validity in SQL, so an unconfirmed fact can never be returned as settled.

```mermaid
flowchart TD
  Q["Question in plain language"] --> FTS["SQLite FTS5<br/>BM25 ranking"]
  Q --> EMB["Workers AI embedding"]
  EMB --> VEC["Vectorize<br/>client namespace"]
  FTS --> RRF["Reciprocal rank fusion<br/>k = 60"]
  VEC --> RRF
  RRF --> FILTER["Filter in SQL:<br/>trusted, valid at as_of,<br/>not superseded"]
  FILTER --> OUT["Answer with quoted evidence,<br/>confirmer and validity window"]

  VEC -. "unavailable" .-> DEG["search_mode:<br/>keyword_only"]
  DEG --> FILTER
```

If Vectorize or Workers AI is unavailable, recall degrades to `keyword_only` and still answers, rather than failing.
