const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/** Every page ships the same hardened headers: no scripts, no framing, no referrers. */
export function htmlResponse(
  html: string,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(html, {
    status: init.status ?? 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "x-frame-options": "DENY",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "cache-control": "no-store",
      ...init.headers,
    },
  });
}

export const PAGE_STYLE = `
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 2rem 1rem; font: 16px/1.5 ui-sans-serif, system-ui, sans-serif;
         background: #10161c; color: #e8edf2; display: flex; justify-content: center; }
  main { width: 100%; max-width: 34rem; background: #161e26; border: 1px solid #243040;
         border-radius: 14px; padding: 1.75rem; }
  h1 { margin: 0 0 0.75rem; font-size: 1.35rem; }
  p { margin: 0 0 1rem; color: #b9c6d4; }
  ul { margin: 0 0 1.25rem 1.1rem; padding: 0; color: #b9c6d4; }
  li { margin-bottom: 0.4rem; }
  .target { font-family: ui-monospace, monospace; color: #e8edf2; }
  .row { display: flex; gap: 0.75rem; margin-top: 1.5rem; }
  button { font: inherit; padding: 0.6rem 1.1rem; border-radius: 9px; border: 1px solid #2c3a4c;
           cursor: pointer; }
  .approve { background: #2f6f4f; color: #f2fff8; border-color: #3c8a63; }
  .cancel { background: transparent; color: #b9c6d4; }
  .note { font-size: 0.9rem; color: #8ea0b2; }
`;
