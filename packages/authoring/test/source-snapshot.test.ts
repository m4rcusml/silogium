import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExercismAdapter } from "../src/exercism.js";
import { CodexAuthoringAdapter, type CodexStructuredRequest, type CodexStructuredRunner } from "../src/codex.js";
import { EXERCISM_SNAPSHOT_LIMITS } from "../src/source-snapshot.js";
import { MIT_TEXT, SOURCE_PREFIX, SOURCE_SHA, mockSnapshot } from "./fixtures/exercism-source.js";

afterEach(() => vi.restoreAllMocks());

describe("snapshot licenciado do Exercism", () => {
  it("fixa o commit antes de ler conteúdo e captura todos os arquivos declarados, notices e hashes", async () => {
    const { fetchMock, files } = mockSnapshot({
      metadata: { authors: ["autor", "autor"], contributors: ["contribuidor"], files: {
        solution: ["two-fer.ts", "lib/labels.ts"], test: ["two-fer.test.ts", "extra.test.ts"],
        support: ["data/cases.json"], example: [".meta/example.ts"]
      } },
      extraFiles: {
        NOTICE: "Additional root attribution notice — preserve this text.",
        [`${SOURCE_PREFIX}COPYRIGHT.txt`]: "Copyright exercise authors — preserve this too.",
        [`${SOURCE_PREFIX}.docs/instructions.append.md`]: "Requisito adicional: preserve acentos.",
        [`${SOURCE_PREFIX}lib/labels.ts`]: "export const label = 'ação';",
        [`${SOURCE_PREFIX}extra.test.ts`]: "test('segundo teste', () => {});",
        [`${SOURCE_PREFIX}data/cases.json`]: "[\"José\", \"ação\"]",
        [`${SOURCE_PREFIX}.meta/example.ts`]: "// solução upstream — não publicar no starter"
      }
    });
    const source = await new ExercismAdapter().load("two-fer", "typescript");
    const requested = fetchMock.mock.calls.map(([input]) => String(input));
    expect(requested[0]).toBe("https://api.github.com/repos/exercism/typescript/git/ref/heads/main");
    expect(requested.filter((url) => url.includes("raw.githubusercontent.com")).every((url) => url.includes(`/${SOURCE_SHA}/`))).toBe(true);
    expect(requested.indexOf(`https://raw.githubusercontent.com/exercism/typescript/${SOURCE_SHA}/LICENSE`)).toBeLessThan(requested.indexOf(`https://raw.githubusercontent.com/exercism/typescript/${SOURCE_SHA}/${SOURCE_PREFIX}.meta/config.json`));
    expect(source).toMatchObject({ commitSha: SOURCE_SHA, licenseText: MIT_TEXT, licenseUrl: `https://github.com/exercism/typescript/blob/${SOURCE_SHA}/LICENSE`, authors: ["autor"], contributors: ["contribuidor"] });
    expect(source.snapshot.files).toHaveLength(files.size);
    for (const file of source.snapshot.files) {
      expect(file.content).toBe(files.get(file.path));
      expect(file.bytes).toBe(Buffer.byteLength(file.content, "utf8"));
      expect(file.sha256).toBe(createHash("sha256").update(file.content).digest("hex"));
      expect(file.roles.length).toBeGreaterThan(0);
    }
    expect(source.snapshot.totalBytes).toBe(source.snapshot.files.reduce((total, file) => total + file.bytes, 0));
    expect(source.snapshot.files.find((file) => file.path.endsWith(".meta/example.ts"))?.roles).toEqual(["example"]);
    expect(source.snapshot.files.find((file) => file.path === "NOTICE")?.roles).toEqual(["notice"]);
    expect(source.starterCode).toContain("lib/labels.ts");
    expect(source.sourceTests).toContain("segundo teste");
    expect(source.instructions.indexOf("Diga duas palavras.")).toBeLessThan(source.instructions.indexOf("Requisito adicional"));
  });

  it.each([{ object: { sha: "abc123", type: "commit" } }, { object: { sha: SOURCE_SHA, type: "tag" } }, {}])("interrompe sem SHA imutável válido: %j", async (ref) => {
    const { fetchMock } = mockSnapshot({ ref });
    await expect(new ExercismAdapter().load("two-fer", "typescript")).rejects.toThrow(/commit imutável/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("não importa árvore parcial", async () => {
    const { fetchMock } = mockSnapshot({ truncated: true });
    await expect(new ExercismAdapter().load("two-fer", "typescript")).rejects.toThrow(/listagem.*incompleta/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("confere licenças específicas antes de ler código ou enunciado", async () => {
    const { fetchMock } = mockSnapshot({ extraFiles: { [`${SOURCE_PREFIX}LICENSE`]: "GNU General Public License" } });
    await expect(new ExercismAdapter().load("two-fer", "typescript")).rejects.toThrow(/licença.*não foi confirmada como MIT/i);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("instructions.md") || String(url).endsWith("two-fer.ts"))).toBe(false);
  });

  it.each([
    `${MIT_TEXT}\nNoncommercial use only.`,
    `MIT License\nCopyright (c) 2026 Authors — commercial use prohibited\n${MIT_TEXT.slice(MIT_TEXT.indexOf("Permission"))}`,
    `MIT License\nPermission is hereby granted to view only. Copyright notice. Permission notice. AS IS. Without warranty.`,
    `${MIT_TEXT}\nAlternatively licensed under GPL.`,
    MIT_TEXT.replace("without restriction", "for educational purposes only")
  ])("não reconhece fragmentos ou MIT com restrições extras como importável", async (license) => {
    mockSnapshot({ extraFiles: { LICENSE: license } });
    await expect(new ExercismAdapter().load("two-fer", "typescript")).rejects.toThrow(/não foi confirmada como MIT/i);
  });

  it("aceita corpo MIT completo com copyright, atribuição e normalização tipográfica legítimos", async () => {
    const license = `The MIT License (MIT)\r\nCopyright © 2013–2026 Legitimate Authors\r\nAttribution: Exercism contributors\r\nSPDX-License-Identifier: MIT\r\n\r\n${MIT_TEXT.slice(MIT_TEXT.indexOf("Permission")).replaceAll('"', "“").replaceAll("\n", "\r\n")}`;
    mockSnapshot({ extraFiles: { LICENSE: license } });
    expect((await new ExercismAdapter().load("two-fer", "typescript")).licenseText).toBe(license);
  });

  it.each(["Use is noncommercial only.", "Alternatively licensed under GPL."])("aviso legal adicional ambíguo exige revisão manual: %s", async (notice) => {
    mockSnapshot({ extraFiles: { NOTICE: notice } });
    await expect(new ExercismAdapter().load("two-fer", "typescript")).rejects.toThrow(/aviso legal.*termos adicionais ou ambíguos/i);
  });

  it.each(["../../secret.ts", "../secret.ts", "/secret.ts", "C:\\secret.ts", "data\\secret.ts", "%2e%2e/secret.ts", "https://outside.test/code.ts", "file.ts?raw=1"])("rejeita caminho declarado inseguro: %s", async (path) => {
    const { fetchMock } = mockSnapshot({ metadata: { files: { solution: [path], test: ["two-fer.test.ts"] } } });
    await expect(new ExercismAdapter().load("two-fer", "typescript")).rejects.toThrow(/caminho de arquivo inválido/i);
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("outside.test"))).toBe(true);
  });

  it("rejeita symlink mesmo quando declarado como solução", async () => {
    mockSnapshot({ modes: { [`${SOURCE_PREFIX}two-fer.ts`]: "120000" } });
    await expect(new ExercismAdapter().load("two-fer", "typescript")).rejects.toThrow(/arquivo regular.*Links simbólicos/i);
  });

  it("falha se um arquivo declarado estiver ausente, sem importar só o primeiro", async () => {
    mockSnapshot({ metadata: { files: { solution: ["two-fer.ts", "missing.ts"], test: ["two-fer.test.ts"] } } });
    await expect(new ExercismAdapter().load("two-fer", "typescript")).rejects.toThrow(/missing.ts.*não existe/i);
  });

  it("não trunca um arquivo que excede o limite mesmo sem tamanho anunciado", async () => {
    const path = `${SOURCE_PREFIX}two-fer.ts`;
    mockSnapshot({ extraFiles: { [path]: "a".repeat(EXERCISM_SNAPSHOT_LIMITS.fileBytes + 1) }, sizes: { [path]: undefined } });
    await expect(new ExercismAdapter().load("two-fer", "typescript")).rejects.toThrow(/excede o limite.*Nenhum conteúdo foi truncado/i);
  });

  it("rejeita o excesso anunciado antes de ler o corpo do arquivo", async () => {
    const path = `${SOURCE_PREFIX}two-fer.ts`;
    mockSnapshot({ contentLengths: { [path]: EXERCISM_SNAPSHOT_LIMITS.fileBytes + 1 }, sizes: { [path]: undefined } });
    await expect(new ExercismAdapter().load("two-fer", "typescript")).rejects.toThrow(/excede o limite.*Nenhum conteúdo foi truncado/i);
  });

  it("falha explicitamente quando muitos arquivos ou bytes impedem uma captura completa", async () => {
    const support = Array.from({ length: 38 }, (_, index) => `data/file-${index}.txt`);
    mockSnapshot({ metadata: { files: { solution: ["two-fer.ts"], test: ["two-fer.test.ts"], support } }, extraFiles: Object.fromEntries(support.map((path) => [`${SOURCE_PREFIX}${path}`, "apoio"])) });
    await expect(new ExercismAdapter().load("two-fer", "typescript")).rejects.toThrow(/limite de 40 arquivos/i);
    vi.restoreAllMocks();
    const large = Array.from({ length: 6 }, (_, index) => `data/large-${index}.txt`);
    mockSnapshot({ metadata: { files: { solution: ["two-fer.ts"], test: ["two-fer.test.ts"], support: large } }, extraFiles: Object.fromEntries(large.map((path) => [`${SOURCE_PREFIX}${path}`, "x".repeat(100 * 1024)])) });
    await expect(new ExercismAdapter().load("two-fer", "typescript")).rejects.toThrow(/snapshot excede.*Nenhum arquivo foi truncado/i);
  });

  it("não converte silenciosamente fixtures binárias ou autoria inválida", async () => {
    mockSnapshot({ extraFiles: { [`${SOURCE_PREFIX}two-fer.ts`]: new Uint8Array([255]) } });
    await expect(new ExercismAdapter().load("two-fer", "typescript")).rejects.toThrow(/binário.*UTF-8/i);
    vi.restoreAllMocks();
    mockSnapshot({ metadata: { authors: [{ name: "forjado" }], files: { solution: ["two-fer.ts"], test: ["two-fer.test.ts"] } } });
    await expect(new ExercismAdapter().load("two-fer", "typescript")).rejects.toThrow(/metadados de autoria/i);
  });

  it("captura Python sem inferir a linguagem por nomes de arquivo", async () => {
    mockSnapshot({ runtime: "python", metadata: { files: { solution: ["two_fer.py"], test: ["two_fer_test.py"], exemplar: [".meta/exemplar.py"] } }, extraFiles: {
      [`${SOURCE_PREFIX}two_fer.py`]: "def two_fer(name): pass", [`${SOURCE_PREFIX}two_fer_test.py`]: "assert True", [`${SOURCE_PREFIX}.meta/exemplar.py`]: "def two_fer(name): return name"
    } });
    const source = await new ExercismAdapter().load("two-fer", "python");
    expect(source.runtime).toBe("python");
    expect(source.snapshot.files.find((file) => file.path.endsWith("exemplar.py"))?.roles).toEqual(["example"]);
    expect(source.starterCode).toBe("def two_fer(name): pass");
  });

  it("envia todos os artefatos e avisos ao adaptador sem executar a fonte, ainda gerando um entrypoint", async () => {
    mockSnapshot({ metadata: { files: { solution: ["two-fer.ts"], test: ["two-fer.test.ts", "edge.test.ts"], example: [".meta/example.ts"] } }, extraFiles: {
      NOTICE: "Nota legal integral — não descartar", [`${SOURCE_PREFIX}edge.test.ts`]: "// caso adicional importante", [`${SOURCE_PREFIX}.meta/example.ts`]: "// implementação completa upstream"
    } });
    const source = await new ExercismAdapter().load("two-fer", "typescript");
    const requests: CodexStructuredRequest[] = [];
    const runner: CodexStructuredRunner = { run: async <T>(request: CodexStructuredRequest): Promise<T> => {
      requests.push(request);
      return { title: "Duas palavras", summary: "Leia uma palavra e forme uma saudação.", tags: ["strings"], statementMd: "Leia e imprima.", starterCode: "console.log('');", referenceSolution: "console.log('ok');", visibleCases: [{ name: "básico", stdin: "a", expectedStdout: "ok" }], hiddenCases: [{ name: "outro", stdin: "b", expectedStdout: "ok" }] } as T;
    } };
    const result = await new CodexAuthoringAdapter(undefined, undefined, { runner }).importLicensed(source, { id: "user", handle: "user", role: "user" });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.allowWebSearch).toBe(false);
    expect(requests[0]?.prompt).toContain("edge.test.ts");
    expect(requests[0]?.prompt).toContain("caso adicional importante");
    expect(requests[0]?.prompt).toContain("Nota legal integral");
    expect(requests[0]?.prompt).toContain("implementação completa upstream");
    expect(requests[0]?.prompt).toContain("um único arquivo de solução");
    expect(result.problem.runtimes).toHaveLength(1);
    expect(result.problem.runtimes[0]?.entrypoint.kind).toBe("stdio");
    expect(result.problem.runtimes[0]?.starterCode).not.toContain("implementação completa upstream");
    expect(result.problem.provenance).toMatchObject({ commitSha: SOURCE_SHA, licenseUrl: source.licenseUrl });
  });
});
