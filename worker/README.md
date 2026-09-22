# KeenDreams Worker

The self-contained application: source, tests, package manifest, and Cloudflare
configuration. The [main repository](https://github.com/Agent9AI/keendreams-security)
holds the product tour, documentation, brand assets, and Hexa skill.

## Local demo

From this directory, with Node.js 22 or later:

```bash
npm ci
npm run demo
```

Once the terminal reports that the server is ready, open
`http://localhost:8787/review` or `http://localhost:8787/admin` in a browser on
that same computer. These addresses work while the local server is running.
Demo mode uses sample data and a loopback-only identity. See the
[local demo guide](https://github.com/Agent9AI/keendreams-security/blob/main/docs/local-demo.md)
for the full walkthrough.

## Commands

| Command | Purpose |
|---|---|
| `npm test` | Offline suite with remote bindings disabled |
| `npm run typecheck` | Source and test typechecking |
| `npm run lint` | Biome validation |
| `npm run types` | Regenerate `src/worker-configuration.d.ts` |
| `npm run deploy` | Deploy into your Cloudflare account |
| `npm run verify:live` | Opt-in checks against your own remote AI and vector bindings |

Before deployment, follow the
[deployment and sign-in guide](https://github.com/Agent9AI/keendreams-security/blob/main/docs/deployment/README.md).
For completed checks and remaining prerequisites, read the
[verification record](https://github.com/Agent9AI/keendreams-security/blob/main/docs/verification.md).

The Deploy to Cloudflare button copies this directory as a standalone repository.
All package, source, type, and test paths are relative to this directory, and a
copy of the [MIT license](LICENSE) is included for that distribution.
