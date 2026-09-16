import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    // remoteBindings: false keeps VECTORS and AI local-only, so the suite never
    // opens a remote proxy session and CI runs without a Cloudflare account.
    cloudflareTest({ remoteBindings: false, wrangler: { configPath: "./wrangler.jsonc" } }),
  ],
  test: { include: ["tests/**/*.test.ts"] },
});
