import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const monorepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const config: NextConfig = {
  // Keep the development badge from covering the mobile workspace actions.
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  outputFileTracingRoot: monorepoRoot,
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["tsx", "esbuild", "@openai/codex", "@openai/codex-sdk"],
  transpilePackages: ["@silogium/core", "@silogium/authoring", "@silogium/judge"],
  webpack(configuration) {
    configuration.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"]
    };
    return configuration;
  },
  outputFileTracingIncludes: {
    "/api/v1/problems/**/*": ["../../content/judge/**/*.json"]
  }
};

export default config;
