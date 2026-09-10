import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repository = resolve(import.meta.dirname, "../../..");
const config = JSON.parse(readFileSync(resolve(repository, "apps/web/vercel.json"), "utf8"));

describe("Vercel Git deployment from apps/web", () => {
  it("installs the locked workspace graph from the monorepo root", () => {
    expect(config.installCommand).toBe("cd ../.. && npm ci");
    const lock = JSON.parse(readFileSync(resolve(repository, "package-lock.json"), "utf8"));
    expect(lock.packages["apps/web"].name).toBe("@silogium/web");
  });

  it("generates the public catalog and builds only the web workspace", () => {
    expect(config.framework).toBe("nextjs");
    expect(config.buildCommand).toBe("cd ../.. && npm run content:generate && npm run build -w @silogium/web");
    expect(config.outputDirectory).toBe(".next");
  });

  it("keeps secrets and source visibility out of the build configuration", () => {
    // Source visibility belongs to the Vercel project (publicSource=false),
    // not vercel.json: the provider schema rejects the legacy `public` key.
    expect(Object.keys(config).sort()).toEqual(["$schema", "buildCommand", "framework", "installCommand", "outputDirectory"]);
    expect(config).not.toHaveProperty("env");
    expect(config).not.toHaveProperty("builds");
    expect(config).not.toHaveProperty("crons");
    expect(JSON.stringify(config)).not.toMatch(/content:private|db:seed|worker/);
  });
});
