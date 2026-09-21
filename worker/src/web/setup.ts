import type { AppSettings, SettingName } from "../config";
import { escapeHtml, htmlResponse, PAGE_STYLE } from "./html";

/** What each setting is, and where the deployer finds its value. */
const SETTING_HELP: Record<string, { label: string; where: string }> = {
  ACCESS_CLIENT_ID: {
    label: "Client ID",
    where: "Shown on the Access application's Overview tab once you create it.",
  },
  ACCESS_CLIENT_SECRET: {
    label: "Client secret",
    where: "Shown once, on the same tab. Copy it before you close the page.",
  },
  ACCESS_AUTHORIZATION_URL: {
    label: "Authorization endpoint",
    where: "From the same tab. It ends in /authorization.",
  },
  ACCESS_TOKEN_URL: {
    label: "Token endpoint",
    where: "From the same tab. It ends in /token.",
  },
  ACCESS_JWKS_URL: {
    label: "Key endpoint",
    where: "From the same tab. It ends in /jwks.",
  },
  COOKIE_ENCRYPTION_KEY: {
    label: "Cookie signing key",
    where: "You generate this one yourself. Any random 32-byte hex string.",
  },
  ADMIN_EMAILS: {
    label: "Administrator emails",
    where: "Comma-separated. These people can review and administer every client.",
  },
};

const SETUP_STYLE = `${PAGE_STYLE}
  main { max-width: 46rem; }
  ol.steps { counter-reset: step; list-style: none; margin: 1.5rem 0 0; padding: 0; }
  ol.steps > li { counter-increment: step; position: relative; padding: 0 0 1.5rem 2.75rem;
                  border-left: 2px solid #243040; margin-left: 0.85rem; }
  ol.steps > li:last-child { border-left-color: transparent; padding-bottom: 0.5rem; }
  ol.steps > li::before { content: counter(step); position: absolute; left: -0.95rem; top: -0.15rem;
    width: 1.8rem; height: 1.8rem; border-radius: 50%; background: #1d2935; border: 1px solid #38506b;
    color: #cfe3ff; font-size: 0.9rem; display: grid; place-items: center; }
  ol.steps h2 { font-size: 1.05rem; margin: 0 0 0.4rem; color: #e8edf2; }
  pre { background: #0d1319; border: 1px solid #243040; border-radius: 9px; padding: 0.8rem 0.9rem;
        overflow-x: auto; margin: 0.6rem 0; }
  code { font-family: ui-monospace, monospace; font-size: 0.85rem; color: #cfe3ff; }
  a.cta { display: inline-block; background: #2f6f4f; border: 1px solid #3c8a63; color: #f2fff8;
          padding: 0.55rem 1rem; border-radius: 9px; text-decoration: none; margin: 0.3rem 0; }
  a { color: #7fd6a8; }
  table.settings { width: 100%; border-collapse: collapse; margin: 0.6rem 0; font-size: 0.9rem; }
  table.settings td { padding: 0.45rem 0.5rem; border-bottom: 1px solid #1c2733; vertical-align: top; }
  td.name { font-family: ui-monospace, monospace; color: #cfe3ff; white-space: nowrap; }
  td.state { white-space: nowrap; width: 1%; }
  .set { color: #7fd6a8; }
  .unset { color: #ffb3bf; }
  .where { color: #8ea0b2; font-size: 0.85rem; }
  .progress { background: #121a22; border: 1px solid #243040; border-radius: 10px;
              padding: 0.7rem 0.9rem; margin: 1.1rem 0 0; color: #b9c6d4; }
`;

function settingRow(name: string, missing: boolean): string {
  const help = SETTING_HELP[name];
  const state = missing ? '<span class="unset">needed</span>' : '<span class="set">set</span>';
  return `<tr>
    <td class="state">${state}</td>
    <td class="name">${escapeHtml(name)}</td>
    <td class="where">${escapeHtml(help?.where ?? "")}</td>
  </tr>`;
}

/**
 * The page a deployer sees before sign-in is configured. It is the first thing
 * anyone meets after deploying, so it walks through the setup rather than just
 * naming what is absent. It never displays a value, only whether one is present.
 */
const GENERATED = "COOKIE_ENCRYPTION_KEY";

export function setupPage(
  env: AppSettings,
  workerOrigin: string,
  allNames: readonly SettingName[],
): Response {
  const shown = allNames.filter((name) => name in SETTING_HELP);
  // Read presence from the environment itself. The caller's `missing` list covers
  // only required settings, so an optional one left unset would otherwise be
  // counted as done and the page could claim it is ready when it is not.
  const isSet = (name: SettingName) => (env[name] ?? "").trim() !== "";
  const missingSet = new Set<string>(shown.filter((name) => !isSet(name)));
  const done = shown.length - missingSet.size;
  const callback = `${workerOrigin}/callback`;
  // The cookie key is generated, never pasted, so it gets its own command below.
  const secretCommands = shown
    .filter((name) => missingSet.has(name) && name !== GENERATED && name !== "ADMIN_EMAILS")
    .map((name) => `npx wrangler secret put ${name}`)
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Set up KeenDreams Security Memory</title>
<style>${SETUP_STYLE}</style>
</head>
<body>
<main>
  <h1>Almost there</h1>
  <p>Your Worker is deployed and running. It needs one thing before anyone can sign in:
  a Cloudflare Access application, which is how your team authenticates. This takes about
  three minutes and everything stays inside your own Cloudflare account.</p>

  <div class="progress">${done} of ${shown.length} settings in place.</div>

  <ol class="steps">
    <li>
      <h2>Create an Access application</h2>
      <p>In Cloudflare One, add a <strong>SaaS</strong> application using the
      <strong>OIDC</strong> protocol. Name it whatever you like.</p>
      <a class="cta" href="https://one.dash.cloudflare.com/?to=/:account/access/apps/new" target="_blank" rel="noopener noreferrer">Open Cloudflare One</a>
    </li>
    <li>
      <h2>Use this callback URL</h2>
      <p>Paste this as the application's redirect URL:</p>
      <pre><code>${escapeHtml(callback)}</code></pre>
      <p class="where">Then add an Access policy deciding who may sign in, for example everyone
      with an email ending in your company domain.</p>
    </li>
    <li>
      <h2>Copy the values it gives you</h2>
      <table class="settings">
        ${shown.map((name) => settingRow(name, missingSet.has(name))).join("\n")}
      </table>
    </li>
    <li>
      <h2>Set them as Worker secrets</h2>
      <p>Run these from the project directory. Each one prompts you to paste the value,
      so nothing sensitive ends up in your shell history:</p>
      <pre><code>${escapeHtml(secretCommands || "All Access settings are already set.")}</code></pre>
      ${
        missingSet.has(GENERATED)
          ? `<p>Generate the cookie key rather than inventing one:</p>
      <pre><code>openssl rand -hex 32 | npx wrangler secret put COOKIE_ENCRYPTION_KEY</code></pre>`
          : ""
      }
      ${
        missingSet.has("ADMIN_EMAILS")
          ? `<p>Name at least one administrator:</p>
      <pre><code>echo "you@example.com" | npx wrangler secret put ADMIN_EMAILS</code></pre>`
          : ""
      }
    </li>
    <li>
      <h2>Reload this page</h2>
      <p>Secrets apply immediately, with no redeploy. When this page turns into a sign-in
      prompt, you are done.</p>
      <p class="where">Want to look around first? Run <code>npm run demo</code> and open
      <code>localhost:8787/review</code>. That needs no setup at all.</p>
    </li>
  </ol>

  <p class="note">Full instructions, including how to connect an MCP client, are in the
  <a href="https://github.com/Agent9AI/keendreams-security#sign-in-setup">README</a>.</p>
</main>
</body>
</html>`;
  return htmlResponse(html, { status: 503 });
}
