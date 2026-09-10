import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./apps/web", import.meta.url)) } },
  test: {
    include: ["packages/**/test/**/*.test.ts"],
    coverage: { reporter: ["text", "json-summary"] }
  }
});
