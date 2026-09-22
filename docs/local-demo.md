[Repository](../README.md) / [Documentation](README.md) / Local demo

# Run the demo on your computer

This guide starts KeenDreams Security locally with sample evidence and a demo
reviewer identity. You need Node.js 22 or later and a terminal. Installing the
dependencies requires network access; no Cloudflare or Tenable account is needed
for the demo.

## Start the application

```bash
git clone https://github.com/Agent9AI/keendreams-security
cd keendreams-security/worker
npm ci
npm run demo
```

Keep the terminal running. Wait for Wrangler to report that the local server is
ready before opening either page.

## Open the demo pages

In a browser on the **same computer**, enter one of these addresses:

| Page | Local address |
|---|---|
| Review queue | `http://localhost:8787/review` |
| Administration | `http://localhost:8787/admin` |

`localhost` means the computer running your browser. These addresses reach the
server you just started and work while that process is running. If the terminal
reports a different port, use that port in the address.

## Follow one decision

1. Open the review queue and read a proposed fact alongside its quoted evidence.
2. Confirm or reject the proposal using the browser controls.
3. Open the administration page and verify the recorded audit chain.

The demo uses synthetic findings. Cloud-only checks are labelled **live only**;
the [verification record](verification.md) explains which services have been
tested against real infrastructure.

For the tool-level sequence and sample responses, see the
[evidence-to-decision walkthrough](walkthrough.md).

## Stop or deploy

Press **Ctrl+C** in the terminal to stop the demo. Demo mode requires a loopback
request host and an explicit flag; its identity is restricted to local use.

For team access through a deployed HTTPS address and real sign-in, follow the
[Cloudflare deployment guide](deployment/README.md).
