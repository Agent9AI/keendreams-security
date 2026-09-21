# Contributing

Issues and pull requests are welcome. This document says what the project cares
about, so you can tell in advance whether a change is likely to land.

## Getting set up

```bash
cd worker
npm install
npm run demo      # review queue on localhost, no account or configuration
npm test          # the full suite, fully offline
```

Node 22 or later. Nothing here talks to the network during tests, and that is
deliberate: a test suite that needs an account is a test suite people stop
running.

## The rules that are not negotiable

These come from the threat model in [SECURITY.md](SECURITY.md). A change that
breaks one of them will not be merged, even if it is convenient.

1. **The caller cannot choose trust.** Ordinary MCP writes and every model
   suggestion start as proposals. Only an administrator's explicit allowlist of
   an automation identity and source can make an incoming assertion trusted.
   Never add an input parameter that lets a caller set a fact's status.
2. **Only a browser session can confirm a fact.** There is no MCP tool for it and
   there should never be one.
3. **Every fact cites evidence.** No path may create a fact without an episode
   behind it.
4. **Keep prior versions and the audit trail.** Corrections supersede prior facts.
   Status and observation metadata may change, but evidence, earlier versions,
   and decision history must stay available for `as_of` and auditing.
5. **Episode text is data, never instructions.** It is stored quoted, and any
   prompt that includes it must say so and delimit it.
6. **No secret is ever logged, returned in a response, or written into memory.**
7. **No component may send data anywhere the deployer did not configure.** There
   is no telemetry in this project and there will not be any.

## How changes are expected to arrive

Tests first. Every feature in this repository was built by writing a failing
test, watching it fail for the expected reason, then making it pass. It is not
ceremony: it caught a false-trust bug, a cross-tenant leak in a query, and an
unhandled promise rejection that would otherwise have been intermittent.

Before opening a pull request:

```bash
npm test && npm run typecheck && npm run lint
```

CI runs those plus gitleaks over the full history, and CodeQL. All of it must be
green.

## House style

Keep the root focused on entry points. Runtime code and configuration belong in
`worker/`, operating guides in `docs/`, and community files
in `.github/`. Maintain the [documentation index](../docs/README.md) when adding a guide.
Regenerate bindings with `npm run types` after changing Wrangler configuration.

- Files stay under 500 lines. When one grows past that, it is usually doing two
  jobs.
- Error messages start with a stable code (`invalid_input`, `forbidden_client`,
  `not_found`, `too_large`, `rate_limited`, `unavailable`) so agents can react to
  them without parsing prose.
- Comments explain why, not what. If a line needs a comment to say what it does,
  rename something instead.
- No em-dashes in documentation, UI copy or error messages.
- Timestamps are ISO 8601 strings, because they sort correctly as text.
- Never commit a credential, even a fake one. Test fixtures assemble fake secrets
  from fragments at runtime so no literal matches a scanner rule.

## Reporting a vulnerability

Please do not open a public issue. See [SECURITY.md](SECURITY.md) for private
disclosure through GitHub Security Advisories.
