[Repository](../../README.md) / [Worker](../README.md) / Tests

# Verification entry points

Run commands from `worker/`. The normal suite uses Cloudflare's local
runtime with remote bindings disabled; it needs no Cloudflare account.

```bash
npm test
npm test -- tests/mcp-tools.test.ts
npm run typecheck
npm run lint
```

`vitest.config.ts` configures the offline suite. Fixtures sit beside the tests;
`tsconfig.json` extends the source configuration and adds test-runtime types.

Live checks are explicit:

```bash
CLOUDFLARE_ACCOUNT_ID=<your-account-id> npm run verify:live
```

`vitest.live.config.ts` selects only `live/*.live.ts` and reads
`live/wrangler.jsonc`. That configuration keeps the Worker local while connecting
to the deployer's remote AI and vector bindings. It makes model calls and writes
temporary vectors. Read the [procedure and recorded results](../../docs/verification.md)
before running it.
