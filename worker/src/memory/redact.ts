type RedactionRule = { name: string; pattern: RegExp; keepPrefix: boolean };

/**
 * Order matters: specific token formats run before the generic
 * `secret-assignment` rule, which skips values already redacted.
 */
const RULES: readonly RedactionRule[] = [
  {
    name: "private-key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    keepPrefix: false,
  },
  { name: "aws-access-key-id", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, keepPrefix: false },
  { name: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, keepPrefix: false },
  {
    name: "github-fine-grained-token",
    pattern: /\bgithub_pat_[A-Za-z0-9_]{50,}/g,
    keepPrefix: false,
  },
  { name: "slack-token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, keepPrefix: false },
  { name: "anthropic-key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/g, keepPrefix: false },
  { name: "openai-key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g, keepPrefix: false },
  {
    name: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    keepPrefix: false,
  },
  {
    name: "bearer-token",
    pattern: /(authorization\s*:\s*bearer\s+)(?!\[REDACTED)[A-Za-z0-9._~+/=-]{16,}/gi,
    keepPrefix: true,
  },
  {
    name: "secret-assignment",
    pattern:
      /((?:password|passwd|secret|api[_-]?key|access[_-]?key|secret[_-]?key|token)\s*[:=]\s*["']?)(?!\[REDACTED)[^\s"',;]{8,}/gi,
    keepPrefix: true,
  },
];

export type RedactionResult = { text: string; count: number };

export function redact(input: string): RedactionResult {
  let text = input;
  let count = 0;
  for (const { name, pattern, keepPrefix } of RULES) {
    text = text.replace(pattern, (_match: string, prefix: unknown) => {
      count += 1;
      const kept = keepPrefix && typeof prefix === "string" ? prefix : "";
      return `${kept}[REDACTED:${name}]`;
    });
  }
  return { text, count };
}

const INSTRUCTION_PATTERNS: readonly RegExp[] = [
  /\bignore\s+(?:all\s+|any\s+)?(?:previous|prior|above|earlier)\s+(?:instructions|messages|context|rules)\b/i,
  /\b(?:you are now|act as|pretend to be|from now on you)\b/i,
  /\b(?:system prompt|developer message|new instructions)\b/i,
  /\b(?:call|invoke|run|use)\s+(?:the\s+)?(?:tool|function)\s+[`'"]?[a-z_]{3,}/i,
  /\b(?:do not|don't)\s+(?:tell|inform|alert|notify)\s+(?:the\s+)?(?:user|analyst|reviewer|human)\b/i,
  /\bmark\s+(?:this|it|these)\s+as\s+(?:trusted|safe|confirmed|a false positive|accepted)\b/i,
];

/**
 * A hint for reviewers, not a defense: flagged text never gains trust,
 * and unflagged text is not assumed safe.
 */
export function detectFlags(text: string): string[] {
  return INSTRUCTION_PATTERNS.some((pattern) => pattern.test(text)) ? ["instruction_like"] : [];
}
