[Repository](../README.md) / [Documentation](README.md) / Security model

# Security model and data flows

For private vulnerability reporting, use the [security policy](../.github/SECURITY.md).
For deployment prerequisites and limitations, see [verification](verification.md).

This is a memory system for security teams, so it is built against the ways memory gets abused (OWASP Agentic Security Initiative, ASI06 memory poisoning).

- **Evidence or it did not happen.** Every fact cites an episode. Nothing is stored as a bare assertion.
- **Text is data, never instructions.** Episode content is stored quoted and passed to models inside a delimited block that the prompt names as data.
- **Credential redaction on ingest.** Key-shaped and token-shaped strings are blanked before storage, and the count is recorded.
- **Instruction-like evidence is flagged** for the reviewer. A flag never raises trust.
- **Prior versions remain auditable.** Corrections supersede previous facts; status and observation metadata can change, while prior versions and audit entries remain available.
- **Hash-chained audit log.** Append-only, enforced by database triggers, with a chain verifier and rollback.
- **Per-principal write limits** per client.
- **SSRF protection** via the `global_fetch_strictly_public` compatibility flag.
- **Tokens are never logged**, returned, or written into memory.
- Browser pages ship a strict CSP with no scripts at all, `frame-ancestors 'none'`, and CSRF tokens on every form.

Secret scanning (gitleaks over full history), type checking, linting, CodeQL and the full test suite run on every push.

---

## Data flows

No component sends data to the authors of this project.

| From | To | What |
|---|---|---|
| MCP client | Your Worker | Tool calls over OAuth |
| Your Worker | Your Workers AI | Episode and query text, for embeddings and optional suggestions |
| Your Worker | Your Vectorize index | Embeddings and item IDs. No episode text, no metadata. |
| Your Worker | Your Cloudflare Access | OAuth code exchange and key discovery |
| Analyst's Claude Code | Tenable Hexa AI MCP | Read-only finding queries, using the analyst's own Tenable keys |

## What the trust boundary does not promise

The default MCP path and every model suggestion create proposals. An administrator
can allowlist an exact automation identity and source to create trusted facts.
The quality and integrity of that source remain the administrator's responsibility.

Credential redaction and instruction flags are defense in depth. They do not
promise to identify every possible secret or prompt injection. Quoting evidence
helps distinguish data from instructions; browser review and server-enforced
permissions are the actual control over trust.

The hash chain can reveal changes to an intact recorded history. It is not an
external, independently anchored proof against an administrator who controls the
entire deployment and can rewrite its storage and code.
