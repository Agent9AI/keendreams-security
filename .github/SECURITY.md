# Security Policy

## Reporting a vulnerability

Please report security issues privately through
[GitHub Security Advisories](https://github.com/Agent9AI/keendreams-security/security/advisories/new).
Do not open a public issue for a vulnerability.

We aim to acknowledge a report within three working days.

## What this project protects

KeenDreams Security Memory stores security findings and the decisions a team has
made about them. The threats it is built against are, in order:

1. **Memory poisoning** (OWASP Agentic Security Initiative, ASI06). Untrusted text
   reaching the memory and later being treated as established fact. Every fact
   cites the evidence it came from. Ordinary MCP writes and model suggestions
   begin as proposals, and only a signed-in browser reviewer can confirm one.
   Administrators may explicitly allowlist an automation identity and source to
   write trusted facts directly; that source is part of the trust boundary.
2. **Cross-tenant leakage.** Each client's memory lives in its own Durable Object
   with its own SQLite database and its own Vectorize namespace.
3. **Credential capture.** Evidence is redacted on ingest. Tokens are never
   logged, returned in a response, or written into memory.
4. **Silent tampering.** The audit log is append-only, enforced by database
   triggers, and hash-chained so a modified row can be detected.

The [security model](../docs/security.md) describes the implemented controls,
data flows, and their limits. The [verification record](../docs/verification.md)
distinguishes completed checks from integrations awaiting live validation.

## What is out of scope

- The security of your own Cloudflare account, Access application, or identity provider.
- The Tenable Hexa AI MCP server, which is Tenable's product.
- Demo mode, which runs only on loopback addresses and uses a stand-in identity.

## Deployment expectations

This project is designed so that the deployer holds everything. There are no
vendor API keys, no shared client secrets, and no telemetry. If you find a code
path that sends data anywhere the deployer did not configure, treat that as a
security bug and report it.
