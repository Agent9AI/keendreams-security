export const SETTING_NAMES = [
  "ACCESS_CLIENT_ID",
  "ACCESS_CLIENT_SECRET",
  "ACCESS_AUTHORIZATION_URL",
  "ACCESS_TOKEN_URL",
  "ACCESS_JWKS_URL",
  "ACCESS_ISSUER",
  "COOKIE_ENCRYPTION_KEY",
  "ADMIN_EMAILS",
  "SUGGEST_MODEL",
  "DEMO_MODE",
] as const;

export type SettingName = (typeof SETTING_NAMES)[number];

/** Deployer settings arrive as Worker secrets; any of them may be missing. */
export type AppSettings = Partial<Record<SettingName, string>>;

/** Thrown when the deployment is not configured. Names only, never values. */
export class SetupError extends Error {
  readonly missing: SettingName[];

  constructor(missing: SettingName[], detail: string) {
    super(`KeenDreams Security Memory is not set up: ${detail}`);
    this.name = "SetupError";
    this.missing = missing;
  }
}

export type AccessSettings = {
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  jwksUrl: string;
  issuer: string;
  cookieKey: string;
};

/** Settings the deployment works without. `ACCESS_ISSUER` only overrides the derived issuer. */
const OPTIONAL_SETTINGS: SettingName[] = [
  "ADMIN_EMAILS",
  "ACCESS_ISSUER",
  "SUGGEST_MODEL",
  "DEMO_MODE",
];
const ACCESS_SETTINGS: SettingName[] = SETTING_NAMES.filter(
  (name) => !OPTIONAL_SETTINGS.includes(name),
);

function httpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function readAccessSettings(env: AppSettings): AccessSettings {
  const missing = ACCESS_SETTINGS.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new SetupError(missing, `missing settings ${missing.join(", ")}`);
  }
  const value = (name: SettingName) => (env[name] ?? "").trim();

  const invalidUrls = (
    ["ACCESS_AUTHORIZATION_URL", "ACCESS_TOKEN_URL", "ACCESS_JWKS_URL"] as const
  ).filter((name) => !httpsUrl(value(name)));
  if (invalidUrls.length > 0) {
    throw new SetupError(invalidUrls, `${invalidUrls.join(", ")} must be https URLs`);
  }

  const tokenUrl = value("ACCESS_TOKEN_URL");
  if (!/\/token\/?$/.test(tokenUrl)) {
    throw new SetupError(
      ["ACCESS_TOKEN_URL"],
      "ACCESS_TOKEN_URL must end with /token (copy it from your Access for SaaS app)",
    );
  }

  if (value("COOKIE_ENCRYPTION_KEY").length < 32) {
    throw new SetupError(
      ["COOKIE_ENCRYPTION_KEY"],
      "COOKIE_ENCRYPTION_KEY must be at least 32 characters (openssl rand -hex 32)",
    );
  }

  const issuerOverride = value("ACCESS_ISSUER");
  if (issuerOverride && !httpsUrl(issuerOverride)) {
    throw new SetupError(["ACCESS_ISSUER"], "ACCESS_ISSUER must be an https URL");
  }

  return {
    clientId: value("ACCESS_CLIENT_ID"),
    clientSecret: value("ACCESS_CLIENT_SECRET"),
    authorizationUrl: value("ACCESS_AUTHORIZATION_URL"),
    tokenUrl,
    jwksUrl: value("ACCESS_JWKS_URL"),
    issuer: issuerOverride || tokenUrl.replace(/\/token\/?$/, ""),
    cookieKey: value("COOKIE_ENCRYPTION_KEY"),
  };
}

export function adminEmails(env: AppSettings): Set<string> {
  return new Set(
    (env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => /^[^\s@]+@[^\s@]+$/.test(entry)),
  );
}
