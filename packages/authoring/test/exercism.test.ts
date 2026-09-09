import { afterEach, describe, expect, it, vi } from "vitest";
import { ExercismAdapter } from "../src/exercism.js";

afterEach(() => vi.restoreAllMocks());

describe("ExercismAdapter", () => {
  it("não apresenta importação quando a licença do track não é confirmada", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/config.json")) {
        return new Response(JSON.stringify({ exercises: { practice: [{ slug: "two-fer", name: "Two Fer", practices: ["strings"] }] } }), { status: 200 });
      }
      if (url.endsWith("/LICENSE")) return new Response("GNU General Public License", { status: 200 });
      return new Response("not found", { status: 404 });
    });
    await expect(new ExercismAdapter().search("strings two fer", "typescript")).resolves.toEqual([]);
  });

  it("preserva autores, contribuidores, repositório, commit e URL da licença", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/LICENSE")) return new Response("MIT License\nPermission is hereby granted", { status: 200 });
      if (url.endsWith("/.docs/instructions.md")) return new Response("Diga duas palavras.", { status: 200 });
      if (url.endsWith("/.meta/config.json")) return new Response(JSON.stringify({ authors: ["autor"], contributors: ["contribuidor"], files: { solution: ["two-fer.ts"], test: ["two-fer.test.ts"] } }), { status: 200 });
      if (url.includes("api.github.com")) return new Response(JSON.stringify([{ sha: "abc123" }]), { status: 200 });
      if (url.endsWith("/two-fer.ts")) return new Response("export function twoFer() {}", { status: 200 });
      if (url.endsWith("/two-fer.test.ts")) return new Response("test('two fer', () => {})", { status: 200 });
      return new Response("not found", { status: 404 });
    });
    const loaded = await new ExercismAdapter().load("two-fer", "typescript");
    expect(loaded).toMatchObject({
      licenseSpdx: "MIT",
      repositoryUrl: "https://github.com/exercism/typescript",
      licenseUrl: "https://github.com/exercism/typescript/blob/main/LICENSE",
      authors: ["autor"],
      contributors: ["contribuidor"],
      commitSha: "abc123"
    });
  });
});
