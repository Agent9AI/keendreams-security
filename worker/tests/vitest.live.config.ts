import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      remoteBindings: true,
      wrangler: { configPath: "./tests/live/wrangler.jsonc" },
    }),
  ],
  test: { include: ["tests/live/**/*.live.ts"], testTimeout: 240_000 },
});
