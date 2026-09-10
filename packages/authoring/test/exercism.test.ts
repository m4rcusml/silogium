import { afterEach, describe, expect, it, vi } from "vitest";
import { ExercismAdapter } from "../src/exercism.js";
import { SOURCE_SHA, mockSnapshot } from "./fixtures/exercism-source.js";

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
    mockSnapshot();
    const loaded = await new ExercismAdapter().load("two-fer", "typescript");
    expect(loaded).toMatchObject({
      licenseSpdx: "MIT",
      repositoryUrl: "https://github.com/exercism/typescript",
      licenseUrl: `https://github.com/exercism/typescript/blob/${SOURCE_SHA}/LICENSE`,
      authors: ["autor"],
      contributors: ["contribuidor"],
      commitSha: SOURCE_SHA
    });
  });
});
