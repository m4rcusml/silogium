import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ rpc: vi.fn(async () => ({ data: true, error: null })), create: vi.fn(async () => ({ id: "61000000-0000-4000-8000-000000000001" })), aiFactory: vi.fn() }));
vi.mock("../../../apps/web/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: calls.rpc }) }));
vi.mock("../../../apps/web/lib/conversations", () => ({ getConversationRepository: () => ({ create: calls.create }) }));
vi.mock("@silogium/authoring", async (original) => ({ ...await original<object>(), createAiAuthoringAdapterFromEnv: calls.aiFactory }));
const factoryPath = "../../../apps/web/lib/authoring.ts";
const { getAuthoringModule, getAuthoringWorker } = await import(factoryPath);
const actor = { id: "31000000-0000-4000-8000-000000000001", handle: "owner", role: "user" as const };
const input = { mode: "create", prompt: "trie compacto lexicográfico", runtime: "typescript", format: "classic", difficulty: "medium", visibility: "private" } as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_test");
  vi.stubEnv("SILOGIUM_AUTHORING_ENABLED", "");
  vi.stubEnv("SILOGIUM_AUTHORING_MODE", "");
  vi.stubEnv("SILOGIUM_AI_PROVIDER", "codex");
  const cache = globalThis as unknown as Record<string, unknown>;
  delete cache.__silogiumAuthoringModule; delete cache.__silogiumAuthoringMode; delete cache.__silogiumAuthoringRepository;
});
afterEach(() => vi.unstubAllEnvs());

describe("factory hospedada sem IA real", () => {
  it("web desabilitada não instancia IA nem cria conversa/job/cota", async () => {
    await expect(getAuthoringModule().request(input, actor)).rejects.toThrow("ainda não está habilitado");
    expect(calls.aiFactory).not.toHaveBeenCalled(); expect(calls.create).not.toHaveBeenCalled(); expect(calls.rpc).not.toHaveBeenCalled();
  });
  it("web habilitada só enfileira; a escolha do provedor é do worker", async () => {
    vi.stubEnv("SILOGIUM_AUTHORING_ENABLED", "true"); vi.stubEnv("SILOGIUM_AI_PROVIDER", "not-a-web-provider");
    const result = await getAuthoringModule().request(input, actor);
    expect(result.jobId).toBeTruthy(); expect(calls.create).not.toHaveBeenCalled(); expect(calls.aiFactory).not.toHaveBeenCalled();
    expect(calls.rpc).toHaveBeenCalledWith("authoring_queue", expect.objectContaining({ p_action: "enqueue" }));
    expect(calls.rpc).toHaveBeenCalledTimes(1);
    expect(calls.rpc).toHaveBeenCalledWith("authoring_queue", expect.objectContaining({ p_payload: expect.objectContaining({ newConversation: expect.objectContaining({ actorId: actor.id }) }) }));
  });
  it("desabilitar autoria invalida módulo em cache e guard de banco precede cache", async () => {
    vi.stubEnv("SILOGIUM_AUTHORING_ENABLED", "true"); const active = getAuthoringModule();
    vi.stubEnv("SILOGIUM_AUTHORING_ENABLED", "false"); expect(getAuthoringModule()).not.toBe(active);
    await expect(getAuthoringModule().request(input, actor)).rejects.toThrow("não está habilitado");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); expect(() => getAuthoringModule()).toThrow("Configuração de produção");
  });
  it.each(["local", "codex"])("worker hospedado rejeita %s antes de claim ou cota", (provider) => {
    vi.stubEnv("SILOGIUM_AUTHORING_ENABLED", "true"); vi.stubEnv("SILOGIUM_AI_PROVIDER", provider);
    expect(() => getAuthoringWorker()).toThrow("provedor remoto");
    expect(calls.rpc).not.toHaveBeenCalled(); expect(calls.aiFactory).not.toHaveBeenCalled();
  });
  it("preview também usa fila apesar de NODE_ENV development", async () => {
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("SILOGIUM_AUTHORING_ENABLED", "true");
    await getAuthoringModule().request(input, actor);
    expect(calls.rpc).toHaveBeenCalledWith("authoring_queue", expect.objectContaining({ p_action: "enqueue" }));
    expect(calls.aiFactory).not.toHaveBeenCalled();
  });
  it("desenvolvimento com Supabase também passa pela fila e pela reserva de criação", async () => {
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("VERCEL_ENV", ""); vi.stubEnv("SILOGIUM_AUTHORING_ENABLED", "true");
    await getAuthoringModule().request(input, actor);
    expect(calls.rpc).toHaveBeenCalledWith("authoring_queue", expect.objectContaining({ p_action: "enqueue" }));
    expect(calls.aiFactory).not.toHaveBeenCalled();
  });
});
