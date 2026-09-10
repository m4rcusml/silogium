import { describe, expect, it, vi } from "vitest";
import { GroqAuthoringAdapter } from "../src/groq.js";
import { ProblemDefinitionSchema, JudgeBundleSchema } from "@silogium/core";

const actor = { id: "author", handle: "author", role: "user" as const };
const input = { mode: "create", prompt: "Conte valores inteiros", runtime: "typescript", format: "classic", difficulty: "easy", visibility: "private" } as const;
const definition = { title: "Contagem de sinais", summary: "Conte os números fornecidos na entrada.", tags: ["arrays"], statementMd: "Leia um array JSON de inteiros e imprima seu tamanho." };
const codes = { starterCode: 'console.log(0);', referenceSolution: 'import {readFileSync} from "node:fs"; console.log(JSON.parse(readFileSync(0,"utf8")).length);' };
const cases = { visibleCases: [{ name: "dois", stdin: "[1,2]", expectedStdout: "2" }], hiddenCases: [{ name: "vazio", stdin: "[]", expectedStdout: "0" }, { name: "negativo", stdin: "[-3]", expectedStdout: "1" }] };
function server(responses: unknown[]) {
  return vi.fn(async (_url: string, init: RequestInit) => {
    expect(JSON.parse(init.body as string).tools).toBeUndefined();
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(responses.shift()) } }] });
  });
}
describe("autoria Groq por etapas", () => {
  it("cria um pacote válido e usa os testes visíveis como fonte dos exemplos", async () => {
    const adapter = new GroqAuthoringAdapter({ apiKey: "test-only", fetch: server([definition, codes, cases]) });
    const result = await adapter.create(input, actor);
    expect(ProblemDefinitionSchema.safeParse(result.problem).success).toBe(true);
    expect(JudgeBundleSchema.safeParse(result.bundle).success).toBe(true);
    expect(result.problem.stages[0]!.statementMd).toContain("[1,2]");
    expect(result.bundle.hiddenCases[1]).toMatchObject({ stdin: "[-3]", expectedStdout: "1" });
    expect(result.problem.stages[0]!.statementMd).not.toContain("[-3]");
    expect(result.problem.provenance).toMatchObject({ createdBy: actor.id });
  });
  it("a correção conserva identidade e contrato e deriva novamente os exemplos", async () => {
    const http = server([definition, codes, cases, codes, { ...cases, visibleCases: [{ name: "três", stdin: "[1,2,3]", expectedStdout: "3" }] }]);
    const adapter = new GroqAuthoringAdapter({ apiKey: "test-only", fetch: http });
    const previous = await adapter.create(input, actor);
    const repaired = await adapter.repair(input, actor, previous, { valid: false, checks: [{ name: "referência", passed: false }] });
    expect(repaired.problem.id).toBe(previous.problem.id);
    expect(repaired.problem.provenance).toEqual(previous.problem.provenance);
    expect(repaired.problem.stages[0]!.statementMd).toContain("[1,2,3]");
    expect(repaired.problem.stages[0]!.statementMd).not.toContain("[1,2]");
    expect(http).toHaveBeenCalledTimes(5);
  });
  it("remove uma seção de exemplos independente sem remover regras seguintes", async () => {
    const adapter = new GroqAuthoringAdapter({ apiKey: "test", fetch: server([
      { ...definition, statementMd: definition.statementMd + "\n\n### Exemplos\n\n[3,4] → 999\n\n### Limites\n\nAté 100 elementos." }, codes, cases]) });
    const value = await adapter.create(input, actor);
    expect(value.problem.stages[0]!.statementMd).not.toContain("999");
    expect(value.problem.stages[0]!.statementMd).toContain("Até 100 elementos");
  });
  it("corrige uma resposta estrutural inválida uma vez, sem retry de autenticação", async () => {
    let calls = 0;
    const http = server([definition, codes, cases]);
    const adapter = new GroqAuthoringAdapter({ apiKey: "test", fetch: async (url, init) => {
      if (++calls === 1) return Response.json({ error: { code: "json_validate_failed" } }, { status: 400 });
      return http(url, init);
    } });
    expect((await adapter.create(input, actor)).bundle.visibleCases).toHaveLength(1);
    expect(calls).toBe(4);
  });

  it.each(["valid", "future", "arguments", "duplicate-stage"])("verifica contrato progressivo: %s", async (failure) => {
    const progressive = { title: "Central de filas", summary: "Organize uma central com quatro operações.", tags: ["filas"], symbol: "Central",
      stages: [1, 2, 3, 4].map((number) => ({ number: failure === "duplicate-stage" ? 1 : number, statementMd: `Nível ${number}: implemente m${number}.` })),
      constructorParameters: [], methods: [1, 2, 3, 4].map((stage) => ({ name: `m${stage}`, stage, parameters: [] })) };
    const fixture = (stage: number) => ({ name: `nível ${stage}`, stage, constructorArgsJson: "[]", calls: [{ method: failure === "future" ? "m4" : `m${stage}`, argsJson: failure === "arguments" ? "{}" : "[]", expectedJson: "0" }] });
    const adapter = new GroqAuthoringAdapter({ apiKey: "test-only", fetch: server([progressive, { starterCode: "export class Central {}", referenceSolution: "export class Central {}" }, { visibleCases: [1, 2, 3, 4].map(fixture), hiddenCases: [1, 2, 3, 4].map(fixture) }]) });
    if (failure === "valid") {
      const value = await adapter.create({ ...input, format: "progressive" }, actor);
      expect(value.bundle.authoringContract?.methods[3]).toEqual({ name: "m4", stage: 4, parameters: [] });
      expect(value.problem.stages[3]!.statementMd).toContain("m4()");
    } else await expect(adapter.create({ ...input, format: "progressive" }, actor)).rejects.toMatchObject({ code: "invalid_output" });
  });
});
