import { describe, expect, it } from "vitest";
import { CodexAuthoringAdapter, LocalAiAdapter, type CodexStructuredRequest, type CodexStructuredRunner } from "../src/index.js";

const actor = { id: "local-author", handle: "author", role: "user" as const };
const generated = { title: "Contagem revisada", summary: "Contagem com entradas negativas.", tags: ["contagem"], statementMd: "Conte os valores e imprima o total.", starterCode: "console.log(0);", referenceSolution: "console.log(1);",
  visibleCases: [{ name: "exemplo", stdin: "1", expectedStdout: "1" }], hiddenCases: [{ name: "zero", stdin: "", expectedStdout: "0" }, { name: "dois", stdin: "1 2", expectedStdout: "2" }] };
class FakeRunner implements CodexStructuredRunner {
  requests: CodexStructuredRequest[] = [];
  constructor(private responses: unknown[]) {}
  async run<T>(request: CodexStructuredRequest): Promise<T> { this.requests.push(request); return this.responses.shift() as T; }
}

describe("provider de refinamento", () => {
  it("preserva duas linguagens com fixtures comuns e nunca habilita rede", async () => {
    const original = await new LocalAiAdapter().create({ mode: "create", prompt: "uma contagem de itens", runtime: "typescript", format: "classic", difficulty: "easy", visibility: "private" }, actor);
    original.problem.runtimes.push({ language: "python", version: "3.13.11", starterCode: "pass", entrypoint: { kind: "stdio" } });
    original.bundle.referenceSolutions.python = "print(0)";
    const runner = new FakeRunner([generated, { starterCode: "print(0)", referenceSolution: "print(1)" }]);
    const adapter = new CodexAuthoringAdapter(undefined, undefined, { runner });
    const refined = await adapter.refine({ ...original, prompt: "Conte negativos também" }, actor, [{ role: "user", text: "Manter entrada com números <inteiros>" }]);
    expect(refined.problem).toMatchObject({ id: original.problem.id, slug: original.problem.slug, version: original.problem.version, provenance: original.problem.provenance });
    expect(refined.problem.runtimes.map((runtime) => runtime.language)).toEqual(["typescript", "python"]);
    expect(refined.bundle.referenceSolutions).toEqual({ typescript: generated.referenceSolution, python: "print(1)" });
    expect(runner.requests).toHaveLength(2);
    expect(runner.requests.every((request) => !request.allowWebSearch)).toBe(true);
    expect(runner.requests[0]!.prompt).toContain("HISTÓRICO DA CONVERSA");
    expect(runner.requests[0]!.prompt).toContain("\\u003cinteiros\\u003e");
    expect(runner.requests[1]!.prompt).toContain("fixtures fornecidos são imutáveis");
    expect(runner.requests[1]!.prompt).toContain(generated.statementMd);
  });

  it("envia histórico resumido à pesquisa com provedor independente", async () => {
    const runner = new FakeRunner([{ candidates: [] }]);
    const adapter = new CodexAuthoringAdapter(undefined, undefined, { runner });
    await adapter.searchWeb("uma mais difícil", "python", actor, undefined, [{ role: "user", text: "Quero praticar árvores AVL" }]);
    expect(runner.requests[0]!.allowWebSearch).toBe(true);
    expect(runner.requests[0]!.prompt).toContain("árvores AVL");
  });
});
