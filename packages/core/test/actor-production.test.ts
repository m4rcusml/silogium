import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(), createBrowserClient: vi.fn(), createClient: vi.fn(),
  connection: vi.fn(), cookies: vi.fn(), getUser: vi.fn(), serverFrom: vi.fn(), adminFrom: vi.fn()
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient, createBrowserClient: mocks.createBrowserClient }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/server", () => ({ connection: mocks.connection }));

const fakeUser = { id: "real-user", email: "user@example.invalid", user_metadata: { user_name: "real-handle", role: "admin" } };
const request = (authorization?: string) => new Request("https://silogium.example/api/v1/me", { headers: authorization ? { authorization } : {} });
function production() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_only");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_test_only");
}
function profileQuery(data: unknown, error: unknown = null) {
  const builder = { select: vi.fn(() => builder), eq: vi.fn(() => builder), maybeSingle: vi.fn(async () => ({ data, error })) };
  return builder;
}

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "VERCEL_ENV"]) vi.stubEnv(key, undefined);
  vi.stubEnv("NODE_ENV", "test");
  mocks.connection.mockResolvedValue(undefined);
  mocks.cookies.mockResolvedValue({ getAll: () => [], set: vi.fn() });
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mocks.serverFrom.mockReturnValue(profileQuery({ handle: "profile-handle", role: "user" }));
  mocks.createServerClient.mockReturnValue({ auth: { getUser: mocks.getUser }, from: mocks.serverFrom });
  mocks.createClient.mockReturnValue({ from: mocks.adminFrom });
  mocks.createBrowserClient.mockReturnValue({ auth: { signInWithOAuth: vi.fn() } });
  const globals = globalThis as typeof globalThis & { __silogiumTokens?: Map<string, unknown> };
  globals.__silogiumTokens?.clear();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network access forbidden in this test."); }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("getOptionalActor com configuração real e adaptadores de rede simulados", () => {
  it("preserva local-demo admin para dev/test sem Supabase", async () => {
    const { getOptionalActor } = await import("../../../apps/web/lib/actor.js");
    expect(await getOptionalActor(request())).toEqual({ id: "local-demo", handle: "demo", role: "admin" });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it.each([undefined, "Bearer sil_some_token"])("bloqueia produção incompleta antes da autenticação (%s)", async (authorization) => {
    vi.stubEnv("NODE_ENV", "production");
    const { getOptionalActor } = await import("../../../apps/web/lib/actor.js");
    await expect(getOptionalActor(request(authorization))).rejects.toMatchObject({ code: "production_configuration_unavailable", status: 503 });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(mocks.cookies).not.toHaveBeenCalled();
  });

  it("importa sem secrets no build e aguarda request antes de validar um layout", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { getOptionalActor } = await import("../../../apps/web/lib/actor.js");
    mocks.connection.mockRejectedValueOnce(new Error("prerender-suspended"));
    await expect(getOptionalActor()).rejects.toThrow("prerender-suspended");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.createServerClient).not.toHaveBeenCalled();
    await expect(getOptionalActor()).rejects.toMatchObject({ code: "production_configuration_unavailable" });
  });

  it("não concede demo em preview mesmo se NODE_ENV for test", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const { getOptionalActor } = await import("../../../apps/web/lib/actor.js");
    await expect(getOptionalActor(request())).rejects.toMatchObject({ code: "production_configuration_unavailable" });
  });

  it("visitante de produção configurada fica anônimo, nunca admin demo", async () => {
    production();
    const { getOptionalActor, getActor } = await import("../../../apps/web/lib/actor.js");
    expect(await getOptionalActor(request())).toBeUndefined();
    await expect(getActor(request())).rejects.toThrow("Faça login");
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
  });

  it("retorna usuário real e confia no papel do perfil, não no user_metadata", async () => {
    production(); mocks.getUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
    const { getOptionalActor } = await import("../../../apps/web/lib/actor.js");
    expect(await getOptionalActor(request())).toEqual({ id: "real-user", handle: "profile-handle", role: "user" });
    mocks.serverFrom.mockReturnValue(profileQuery({ handle: "administrator", role: "admin" }));
    expect(await getOptionalActor(request())).toMatchObject({ role: "admin", handle: "administrator" });
  });

  it("falha de autenticação não autentica mesmo que o SDK devolva user junto", async () => {
    production(); mocks.getUser.mockResolvedValue({ data: { user: fakeUser }, error: { message: "private SDK diagnostics" } });
    const { getOptionalActor } = await import("../../../apps/web/lib/actor.js");
    expect(await getOptionalActor(request())).toBeUndefined();
    expect(mocks.serverFrom).not.toHaveBeenCalled();
  });

  it("erro de leitura do papel falha sem expor diagnóstico do SDK", async () => {
    production(); mocks.getUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
    mocks.serverFrom.mockReturnValue(profileQuery({ role: "admin" }, { message: "private SDK diagnostics" }));
    const { getOptionalActor } = await import("../../../apps/web/lib/actor.js");
    await expect(getOptionalActor(request())).rejects.toThrow("Não foi possível verificar seu perfil");
  });

  it.each(["Bearer other_token", "Bearer sil_a b", "Basic abc", "Bearer sil_"])("Authorization malformada não cai no cookie nem no demo: %s", async (authorization) => {
    production(); mocks.getUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
    const { getOptionalActor } = await import("../../../apps/web/lib/actor.js");
    await expect(getOptionalActor(request(authorization))).rejects.toThrow("Token da CLI inválido");
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.adminFrom).not.toHaveBeenCalled();
  });

  it("valida Bearer com token persistido sem consultar cookies", async () => {
    production();
    mocks.adminFrom.mockImplementation((table: string) => {
      const data = table === "api_tokens" ? { user_id: "cli-user", expires_at: "2099-01-01T00:00:00Z", revoked_at: null } : { handle: "cli-handle", role: "user" };
      const builder = { ...profileQuery(data), update: vi.fn() };
      builder.update.mockReturnValue(builder);
      return builder;
    });
    const { getOptionalActor } = await import("../../../apps/web/lib/actor.js");
    expect(await getOptionalActor(request("Bearer sil_persisted_token"))).toEqual({ id: "cli-user", handle: "cli-handle", role: "user" });
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.adminFrom).toHaveBeenCalledWith("api_tokens");
  });

  it("token inexistente não assume cookie autenticado", async () => {
    production(); mocks.adminFrom.mockReturnValue(profileQuery(null));
    mocks.getUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
    const { getOptionalActor } = await import("../../../apps/web/lib/actor.js");
    await expect(getOptionalActor(request("Bearer sil_not_found"))).rejects.toThrow("Token da CLI inválido");
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("token real emitido no demo não atravessa a configuração ausente de produção", async () => {
    const { issueToken } = await import("../../../apps/web/lib/tokens.js");
    const { getOptionalActor } = await import("../../../apps/web/lib/actor.js");
    const issued = await issueToken("demo-owner");
    expect(await getOptionalActor(request(`Bearer ${issued.token}`))).toMatchObject({ id: "demo-owner", role: "user" });
    vi.stubEnv("NODE_ENV", "production");
    await expect(getOptionalActor(request(`Bearer ${issued.token}`))).rejects.toMatchObject({ code: "production_configuration_unavailable" });
  });
});

describe("clientes Supabase sem fallback em produção", () => {
  it("admin valida configuração antes de qualquer retorno em cache", async () => {
    const { createSupabaseAdminClient } = await import("../../../apps/web/lib/supabase/admin.js");
    expect(createSupabaseAdminClient()).toBeNull();
    production();
    const client = createSupabaseAdminClient();
    expect(client).not.toBeNull();
    expect(createSupabaseAdminClient()).toBe(client);
    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);
    expect(() => createSupabaseAdminClient()).toThrow("Configuração de produção indisponível");
  });

  it("cliente SSR incompleto bloqueia inclusive chamada direta", async () => {
    production(); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);
    const { createSupabaseServerClient } = await import("../../../apps/web/lib/supabase/server.js");
    await expect(createSupabaseServerClient()).rejects.toMatchObject({ code: "production_configuration_unavailable" });
    expect(mocks.cookies).not.toHaveBeenCalled();
  });

  it("browser não fabrica sessão sem configuração e nunca recebe service role", async () => {
    const { createSupabaseBrowserClient } = await import("../../../apps/web/lib/supabase/client.js");
    vi.stubEnv("NODE_ENV", "production");
    expect(createSupabaseBrowserClient()).toBeNull();
    expect(mocks.createBrowserClient).not.toHaveBeenCalled();
    production();
    expect(createSupabaseBrowserClient()).not.toBeNull();
    expect(mocks.createBrowserClient).toHaveBeenLastCalledWith("https://example.supabase.co", "sb_publishable_test_only");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_secret_accidentally_public");
    expect(createSupabaseBrowserClient()).toBeNull();
    expect(mocks.createBrowserClient).toHaveBeenCalledTimes(1);
  });
});
