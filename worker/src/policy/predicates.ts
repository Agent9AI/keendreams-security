import { MemoryError } from "../memory/errors";
import type { EntityKind } from "../memory/keys";

export const PREDICATES = [
  "HAS_VULN",
  "REMEDIATED",
  "FALSE_POSITIVE",
  "ACCEPTED_RISK",
  "OWNS",
  "OBSERVED",
  "RELATED_TO",
] as const;

export type Predicate = (typeof PREDICATES)[number];

type KindRule = readonly EntityKind[] | "any";

export type PredicateRule = {
  subjectKinds: KindRule;
  objectKinds: KindRule;
  requiresValidTo: boolean;
  requiresReason: boolean;
  /** Other predicates a new trusted fact closes for the same subject and object. */
  closes: readonly Predicate[];
};

const VULN: readonly EntityKind[] = ["cve", "tenable-plugin"];

function rule(
  subjectKinds: KindRule,
  objectKinds: KindRule,
  closes: readonly Predicate[] = [],
  requires: { validTo?: boolean; reason?: boolean } = {},
): PredicateRule {
  return {
    subjectKinds,
    objectKinds,
    closes,
    requiresValidTo: requires.validTo ?? false,
    requiresReason: requires.reason ?? false,
  };
}

export const PREDICATE_RULES: Record<Predicate, PredicateRule> = {
  HAS_VULN: rule(["asset"], VULN, ["REMEDIATED"]),
  REMEDIATED: rule(["asset"], VULN, ["HAS_VULN", "ACCEPTED_RISK"]),
  FALSE_POSITIVE: rule(["asset"], VULN, ["HAS_VULN"]),
  ACCEPTED_RISK: rule(["asset"], VULN, [], { validTo: true, reason: true }),
  OWNS: rule(["identity"], ["asset"]),
  OBSERVED: rule(["agent", "identity"], ["asset", "ioc-ip", "ioc-domain", "ioc-hash"]),
  RELATED_TO: rule("any", "any"),
};

export function parsePredicate(raw: string): Predicate {
  const value = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (!(PREDICATES as readonly string[]).includes(value)) {
    throw new MemoryError(
      "invalid_input",
      `unknown relationship type "${raw}"; expected one of ${PREDICATES.join(", ")}`,
    );
  }
  return value as Predicate;
}

function kindAllowed(allowed: KindRule, kind: EntityKind): boolean {
  return allowed === "any" || allowed.includes(kind);
}

export function checkShape(
  predicate: Predicate,
  subjectKind: EntityKind,
  objectKind: EntityKind,
  extras: { validTo: string | null; reason: string | null },
): void {
  const r = PREDICATE_RULES[predicate];
  if (!kindAllowed(r.subjectKinds, subjectKind)) {
    throw new MemoryError("invalid_input", `${predicate} cannot have a ${subjectKind} subject`);
  }
  if (!kindAllowed(r.objectKinds, objectKind)) {
    throw new MemoryError("invalid_input", `${predicate} cannot have a ${objectKind} object`);
  }
  if (r.requiresValidTo && extras.validTo === null) {
    throw new MemoryError("invalid_input", `${predicate} requires validTo (an expiry date)`);
  }
  if (r.requiresReason && extras.reason === null) {
    throw new MemoryError("invalid_input", `${predicate} requires a reason`);
  }
}

/**
 * Predicates a new trusted fact closes for the same subject and object.
 * A predicate always closes itself, so a trusted fact with a different
 * validity window replaces the older one instead of coexisting with it.
 */
export function predicatesClosedBy(predicate: Predicate): Predicate[] {
  return [...new Set<Predicate>([predicate, ...PREDICATE_RULES[predicate].closes])];
}
