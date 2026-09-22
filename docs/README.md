[Repository](../README.md) / Documentation

# KeenDreams documentation

Start with the outcome you need. The repository README is the product overview;
these pages hold the operating instructions and supporting detail.

| I want to… | Start here |
|---|---|
| Try the product on my own computer | [Local demo](local-demo.md) |
| Explore the real review and administration screens | [Product tour](product-tour.md) |
| Understand the evidence and review flow | [Reproducible walkthrough](walkthrough.md) |
| Deploy into my Cloudflare account | [Deployment and sign-in](deployment/README.md) |
| Connect Tenable Hexa | [Integration guide](integrations/tenable.md) |
| Build a client or inspect the tool contract | [MCP tool reference](reference/mcp-tools.md) |
| Understand isolation, storage, and retrieval | [Architecture](architecture.md) |
| Assess the security boundaries and data flows | [Security model](security.md) |
| See what has actually been verified | [Verification and limitations](verification.md) |
| Review the planned Exchange submission | [Submission status](exchange/README.md) |
| Contribute a change | [Contribution guide](../.github/CONTRIBUTING.md) |
| Report a vulnerability privately | [Security policy](../.github/SECURITY.md) |
| Use or extend the visual identity | [Brand kit](brand/README.md) |

## Source map

The runtime lives under [`worker/src/`](../worker/src/): `auth/` handles identity, `mcp/` adapts
tool calls, `memory/` owns storage and history, `policy/` decides trust,
`registry/` controls client access, `search/` handles retrieval, and `web/` renders
the review and administration pages. The entry point is `worker/src/worker.ts`.

[`worker/tests/`](../worker/tests/) contains the offline suite and its fixtures. The opt-in
live test and its Cloudflare configuration are isolated in `worker/tests/live/`.

The original [design record](design.md) preserves the reasoning and launch plan.
Use the current guides and verification page for shipped behavior and status.
