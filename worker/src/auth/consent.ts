import { escapeHtml, htmlResponse, PAGE_STYLE } from "../web/html";

export type ConsentOptions = {
  clientName: string;
  redirectHost: string;
  accessOrigin: string;
  consentId: string;
  csrfToken: string;
  csrfCookie: string;
};

/** The approval screen shown before a person is sent to Cloudflare Access. */
export function renderConsent(options: ConsentOptions): Response {
  const client = escapeHtml(options.clientName);
  const host = escapeHtml(options.redirectHost);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect ${client}</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<main>
  <h1>Connect ${client}?</h1>
  <p>This app is asking to use KeenDreams Security Memory as you.</p>
  <ul>
    <li>Read memory: facts, entities, history and pending proposals</li>
    <li>Record evidence and propose facts, which stay unconfirmed until a reviewer approves them here in a browser</li>
    <li>It cannot confirm, reject or roll back anything</li>
  </ul>
  <p class="note">After you approve, you sign in with your organization's Cloudflare Access.
  Tokens are returned to <span class="target">${host}</span>.</p>
  <form method="post" action="/authorize">
    <input type="hidden" name="consent_id" value="${escapeHtml(options.consentId)}">
    <input type="hidden" name="csrf" value="${escapeHtml(options.csrfToken)}">
    <div class="row">
      <button class="approve" type="submit" name="action" value="approve">Approve</button>
      <button class="cancel" type="submit" name="action" value="deny">Cancel</button>
    </div>
  </form>
</main>
</body>
</html>`;
  return htmlResponse(html, {
    headers: {
      "set-cookie": options.csrfCookie,
      "content-security-policy": `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${options.accessOrigin}; base-uri 'none'; frame-ancestors 'none'`,
    },
  });
}

export function messagePage(title: string, detail: string, status: number): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${PAGE_STYLE}</style>
</head>
<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p></main></body>
</html>`;
  return htmlResponse(html, { status });
}
