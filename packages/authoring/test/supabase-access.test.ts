import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { seedProblems, type Actor, type ProblemDefinition } from "@silogium/core";

const data = vi.hoisted(() => ({
  row: {} as Record<string, unknown>, definitions: new Map<number, unknown>(), tables: [] as string[],
  artifact: null as Record<string, unknown> | null, record: null as Record<string, unknown> | null,
  rpcError: null as { message: string } | null,
  rpcs: [] as Array<{ name: string; input: Record<string, unknown> }>,
  writes: [] as Array<{ table: string; operation: string; input: unknown }>
}));
vi.mock("../../../apps/web/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    const client = {
      schema: () => { throw new Error("Private schemas are not exposed through PostgREST."); },
      rpc: async (name: string, input: Record<string, unknown>) => {
        data.rpcs.push({ name, input });
        if (data.rpcError) return { data: null, error: data.rpcError };
        return { data: name === "read_private_editorial_record" ? data.record : name === "read_private_judge_bundle" ? data.artifact : null, error: null };
      },
      from: (table: string) => {
        if (["editorial_records", "judge_bundles"].includes(table)) throw new Error("Private table access must use an RPC.");
        data.tables.push(table);
        const filters: Record<string, unknown> = {};
        const query = {
          select: () => query,
          insert: async (input: unknown) => { data.writes.push({ table, operation: "insert", input }); return { error: null }; },
          update: (input: unknown) => ({ eq: async () => { data.writes.push({ table, operation: "update", input }); return { error: null }; } }),
          delete: () => ({ eq: async () => { data.writes.push({ table, operation: "delete", input: null }); return { error: null }; } }),
          eq: (field: string, value: unknown) => { filters[field] = value; return query; },
          maybeSingle: async () => ({ data: table === "problems" ? data.row
            : { definition: data.definitions.get(Number(filters.version)) }, error: null })
        };
        return query;
      }
    };
    return client;
  }
}));
// Let the web project resolve its own TypeScript aliases; this test uses an in-memory Supabase transport.
const repositoryPath = "../../../apps/web/lib/supabase/authoring-repository.ts";
const { SupabaseAuthoringRepository } = await import(repositoryPath);
const problemId = "65000000-0000-4000-8000-000000000001";
const slug = "persisted-visibility-regression";
const owner: Actor = { id: "owner", handle: "owner", role: "user" };
const stranger: Actor = { id: "stranger", handle: "stranger", role: "user" };
const admin: Actor = { id: "admin", handle: "admin", role: "admin" };
const accessKey = "unlisted-test-key";

function definition(version: number, visibility: ProblemDefinition["visibility"], status: ProblemDefinition["status"]): ProblemDefinition {
  return { ...structuredClone(seedProblems[0]!), id: problemId, slug, version, visibility, status,
    provenance: { kind: "native", createdBy: owner.id, createdByHandle: owner.handle, assistedByAi: false, statementLicense: "CC-BY-4.0", codeLicense: "MIT" } };
}

beforeEach(() => {
  data.tables.length = 0; data.definitions.clear();
  data.rpcs.length = 0; data.writes.length = 0; data.rpcError = null; data.record = null;
  data.artifact = { bundle: { schemaVersion: 1, problemId, problemVersion: 2, visibleCases: [], hiddenCases: [], referenceSolutions: { typescript: "private reference" } }, validation: { valid: true, checks: [] }, checksum: "a".repeat(64) };
  data.row = { id: problemId, slug, owner_id: owner.id, visibility: "public", status: "published", current_version: 1, latest_version: 2,
    unlisted_access_hash: createHash("sha256").update(accessKey).digest("hex") };
  data.definitions.set(1, definition(1, "public", "published"));
  data.definitions.set(2, definition(2, "private", "pending_review"));
});

describe.each(["id", "slug"] as const)("visibilidade atual do Supabase por %s", (lookup) => {
  const read = (actor?: Actor, key?: string) => {
    const repository = new SupabaseAuthoringRepository();
    return lookup === "id" ? repository.getPackageById(problemId, actor, key) : repository.getPackageBySlug(slug, actor, key);
  };

  it("revogação para privado bloqueia snapshot antes público antes de consultar definição/bundle", async () => {
    data.row.visibility = "private";
    expect(await read()).toBeNull();
    expect(await read(stranger)).toBeNull();
    expect(data.tables).toEqual(["problems", "problems"]);
    expect(data.rpcs).toEqual([]);
  });

  it("estado não publicado no parent bloqueia snapshot publicado antigo", async () => {
    data.row.status = "rejected";
    expect(await read(stranger)).toBeNull();
    expect(data.tables).toEqual(["problems"]);
  });

  it("chave antiga de link não reabre questão tornada privada", async () => {
    data.row.visibility = "private";
    expect(await read(stranger, accessKey)).toBeNull();
    expect(data.tables).toEqual(["problems"]);
  });

  it("dono e administrador preservam acesso à última versão privada", async () => {
    data.row.visibility = "private"; data.row.status = "rejected";
    expect((await read(owner))?.problem.version).toBe(2);
    expect((await read(admin))?.problem.version).toBe(2);
  });

  it("parent público continua entregando current publicado e não latest em revisão", async () => {
    expect((await read())?.problem).toMatchObject({ version: 1, status: "published" });
    expect((await read(stranger))?.problem.version).toBe(1);
    expect((await read(owner))?.problem.version).toBe(2);
  });

  it("link não listado válido continua autorizado; inválido ou status draft não passa", async () => {
    data.row.visibility = "unlisted"; data.row.status = "validated";
    data.definitions.set(2, definition(2, "unlisted", "validated"));
    expect((await read(stranger, accessKey))?.problem.version).toBe(2);
    data.tables.length = 0;
    expect(await read(stranger, "wrong-key")).toBeNull();
    expect(data.tables).toEqual(["problems"]);
    data.row.status = "draft"; data.tables.length = 0;
    expect(await read(stranger, accessKey)).toBeNull();
    expect(data.tables).toEqual(["problems"]);
  });
});

describe("artefatos privados por RPC restrita", () => {
  it("lê registro editorial sem solicitar o schema private", async () => {
    data.record = { problemId, revision: 4, phase: "draft", package: { bundle: "private" } };
    expect(await new SupabaseAuthoringRepository().getEditorialRecord(problemId)).toEqual(data.record);
    expect(data.rpcs).toEqual([{ name: "read_private_editorial_record", input: { p_problem_id: problemId } }]);
    expect(data.tables).toEqual([]);
  });

  it("lê bundle e relatório pelo mesmo RPC depois da autorização", async () => {
    const value = await new SupabaseAuthoringRepository().getPackageById(problemId, owner);
    expect(value?.validation).toEqual({ valid: true, checks: [] });
    expect(value?.bundle.referenceSolutions.typescript).toBe("private reference");
    expect(data.rpcs).toEqual([{ name: "read_private_judge_bundle", input: { p_problem_id: problemId, p_problem_version: 2 } }]);
    expect(value).not.toHaveProperty("checksum");
  });

  it("seed consulta RPC e conserva fallback local quando não existe bundle persistido", async () => {
    data.artifact = null;
    const seed = seedProblems[0]!;
    const value = await new SupabaseAuthoringRepository().getPackageById(seed.id);
    expect(value?.problem.id).toBe(seed.id);
    expect(value?.bundle).toMatchObject({ visibleCases: [], hiddenCases: [], referenceSolutions: {} });
    expect(data.rpcs).toEqual([{ name: "read_private_judge_bundle", input: { p_problem_id: seed.id, p_problem_version: seed.version } }]);
    expect(data.tables).toEqual([]);
  });

  it("novos pacotes usam INSERT privado com validação e checksum", async () => {
    const problem = definition(1, "private", "validated");
    const bundle = { schemaVersion: 1, problemId, problemVersion: 1, visibleCases: [], hiddenCases: [], referenceSolutions: {} };
    const validation = { valid: true, checks: [{ name: "referência", passed: true }] };
    await new SupabaseAuthoringRepository().savePackage({ problem, bundle, validation });
    expect(data.rpcs).toEqual([{ name: "insert_private_judge_bundle", input: { p_problem_id: problemId, p_problem_version: 1, p_bundle: bundle, p_validation: validation, p_checksum: createHash("sha256").update(JSON.stringify(bundle)).digest("hex") } }]);
    expect(data.writes.map(({ table, operation }) => [table, operation])).toEqual([["problems", "insert"], ["problem_versions", "insert"]]);
  });

  it("revisão legada insere bundle de nova versão sem sobrescrever a publicada", async () => {
    const problem = definition(3, "private", "validated");
    const bundle = { schemaVersion: 1, problemId, problemVersion: 3, visibleCases: [], hiddenCases: [], referenceSolutions: {} };
    await new SupabaseAuthoringRepository().saveRevision({ problem, bundle, validation: { valid: true, checks: [] } }, owner);
    expect(data.rpcs[0]).toMatchObject({ name: "insert_private_judge_bundle", input: { p_problem_id: problemId, p_problem_version: 3, p_bundle: bundle } });
    expect(data.writes).toContainEqual({ table: "problems", operation: "update", input: { latest_version: 3, updated_at: problem.updatedAt } });
    expect(data.writes.some(({ input }) => Boolean(input && typeof input === "object" && "current_version" in input))).toBe(false);
  });

  it("RPC ausente falha com instrução de migração, sem fallback para schema privado", async () => {
    data.rpcError = { message: "function missing" };
    await expect(new SupabaseAuthoringRepository().getEditorialRecord(problemId)).rejects.toThrow(/202609090009/);
    expect(data.tables).toEqual([]);
  });
});
