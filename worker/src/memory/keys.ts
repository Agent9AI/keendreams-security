import { MemoryError } from "./errors";

export const ENTITY_KINDS = [
  "asset",
  "cve",
  "tenable-plugin",
  "identity",
  "agent",
  "ioc-ip",
  "ioc-domain",
  "ioc-hash",
  "control",
  "ticket",
] as const;

export type EntityKind = (typeof ENTITY_KINDS)[number];

export type CanonicalKey = { kind: EntityKind; value: string; key: string };

const OCTET = "(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const IPV4 = new RegExp(`^${OCTET}(\\.${OCTET}){3}$`);
const IPV6 = /^(?=.*:.*:)[0-9a-f:.]{2,45}$/;
const DOMAIN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function freeText(raw: string): string | null {
  const s = raw.trim();
  return s.length >= 1 && s.length <= 128 && !/[\r\n]/.test(s) ? s : null;
}

const NORMALIZERS: Record<EntityKind, (raw: string) => string | null> = {
  asset: (raw) => {
    const s = raw.trim().toLowerCase();
    return /^[a-z0-9][a-z0-9._:/-]{0,252}$/.test(s) ? s : null;
  },
  cve: (raw) => {
    const s = raw.trim().toUpperCase();
    return /^CVE-\d{4}-\d{4,}$/.test(s) ? s : null;
  },
  "tenable-plugin": (raw) => {
    const s = raw.trim();
    return /^\d{1,10}$/.test(s) ? s : null;
  },
  identity: (raw) => {
    const s = raw.trim().toLowerCase();
    return /^[^\s@]{1,64}@[^\s@]{1,255}$/.test(s) || /^[a-z0-9._-]{1,128}$/.test(s) ? s : null;
  },
  agent: (raw) => {
    const s = raw.trim().toLowerCase();
    return /^[a-z0-9][a-z0-9._-]{0,127}$/.test(s) ? s : null;
  },
  "ioc-ip": (raw) => {
    const s = raw.trim().toLowerCase();
    return IPV4.test(s) || IPV6.test(s) ? s : null;
  },
  "ioc-domain": (raw) => {
    const s = raw.trim().toLowerCase().replace(/\.$/, "");
    return DOMAIN.test(s) ? s : null;
  },
  "ioc-hash": (raw) => {
    const s = raw.trim().toLowerCase();
    return /^([a-f0-9]{32}|[a-f0-9]{40}|[a-f0-9]{64})$/.test(s) ? s : null;
  },
  control: freeText,
  ticket: freeText,
};

export function parseKey(raw: string): CanonicalKey {
  const text = String(raw ?? "");
  const colon = text.indexOf(":");
  if (colon <= 0) {
    throw new MemoryError("invalid_input", `key "${text}" must look like kind:value`);
  }
  const kind = text.slice(0, colon).trim().toLowerCase();
  if (!(ENTITY_KINDS as readonly string[]).includes(kind)) {
    throw new MemoryError(
      "invalid_input",
      `unknown entity kind "${kind}"; expected one of ${ENTITY_KINDS.join(", ")}`,
    );
  }
  const entityKind = kind as EntityKind;
  const value = NORMALIZERS[entityKind](text.slice(colon + 1));
  if (value === null) {
    throw new MemoryError("invalid_input", `"${text}" is not a valid ${entityKind} key`);
  }
  return { kind: entityKind, value, key: `${entityKind}:${value}` };
}
