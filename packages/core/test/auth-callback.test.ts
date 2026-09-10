import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: vi.fn(), exchange: vi.fn() }));
vi.mock("../../../apps/web/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.client }));
const routePath = "../../../apps/web/app/auth/callback/route.ts";
const { GET } = await import(routePath);
const origin = "https://silogium.example";

function callback(next?: string, code: string | null = "synthetic-auth-code") {
  const url = new URL("/auth/callback", origin);
  if (next !== undefined) url.searchParams.set("next", next);
  if (code) url.searchParams.set("code", code);
  return GET(new Request(url));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockResolvedValue({ auth: { exchangeCodeForSession: mocks.exchange } });
  mocks.exchange.mockResolvedValue({ data: {}, error: null });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden in auth callback tests."); }));
});
afterEach(() => vi.unstubAllGlobals());

describe("callback real de OAuth: destino interno seguro", () => {
  it.each([
    [undefined, "/explorar"], ["/", "/"], ["/studio?mode=create#composer", "/studio?mode=create#composer"],
    ["/questoes/exemplo?runtime=typescript&tag=hash%20map#codigo", "/questoes/exemplo?runtime=typescript&tag=hash%20map#codigo"],
    ["/perfil#estat%C3%ADsticas", "/perfil#estat%C3%ADsticas"], ["/old/../explorar?level=easy", "/explorar?level=easy"],
    ["/explorar?q=https%3A%2F%2Fexternal.example", "/explorar?q=https%3A%2F%2Fexternal.example"],
    ["/%2F%2Fevil.example", "/%2F%2Fevil.example"]
  ])("preserva/canonicaliza o destino permitido %s", async (next, expected) => {
    const response = await callback(next);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${origin}${expected}`);
    expect(mocks.exchange).toHaveBeenCalledExactlyOnceWith("synthetic-auth-code");
  });

  it.each([
    "//evil.example/path", "///evil.example", "/\\evil.example", "/\\\\evil.example/path",
    "/\t/evil.example", "/\r\n/evil.example", "/studio\u0000?mode=create", "/studio\u007f",
    "https://evil.example/", "https://silogium.example/studio", "javascript:alert(1)", "data:text/html,x",
    "studio", "", "//silogium.example@evil.example", "//evil.example:443", "//[invalid", "%2F%2Fevil.example"
  ])("recusa destino malicioso/inválido %j sem abandonar a origem", async (next) => {
    const response = await callback(next);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${origin}/explorar`);
    expect(mocks.exchange).toHaveBeenCalledExactlyOnceWith("synthetic-auth-code");
  });

  it("não inicia troca sem código", async () => {
    const response = await callback("/perfil", null);
    expect(response.headers.get("location")).toBe(`${origin}/perfil`);
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it("mantém o comportamento de cliente ausente e ainda restringe o destino", async () => {
    mocks.client.mockResolvedValue(null);
    const response = await callback("//evil.example");
    expect(response.headers.get("location")).toBe(`${origin}/explorar`);
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
});
