import { expect, test, type Page, type Route } from "@playwright/test";
import type { ExecutionResult } from "@silogium/core";

type ActivityItem = {
  createdAt: string;
  request: { problemId: string; problemVersion: number; kind: "run" | "submission"; runtime: "typescript" | "python" };
  result: ExecutionResult;
  problem: { id: string; title: string; slug: string; version: number };
};

type Token = {
  id: string;
  prefix: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
};

const fakeSecret = `sil_${"a".repeat(32)}`;
// These existing scenarios exercise the recent-history fallback independently of
// the full account projection. New practice flows have their own successful mock.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/practice", (route) => route.fulfill({ status: 503, json: { error: "Projeção completa indisponível no cenário de histórico recente." } }));
});
const activeToken: Token = {
  id: "profile-active-token", prefix: "sil_active", created_at: "2026-01-01T12:00:00.000Z",
  expires_at: "2099-01-01T12:00:00.000Z", revoked_at: null, last_used_at: null
};

function execution(id: string, problem: "a" | "b" | "c", options: {
  kind?: "run" | "submission"; verdict?: ExecutionResult["verdict"]; version?: number; runtime?: "typescript" | "python";
} = {}): ActivityItem {
  const problemId = `00000000-0000-4000-8000-00000000000${{ a: 1, b: 2, c: 3 }[problem]}`;
  return {
    createdAt: "2026-09-09T12:00:00.000Z",
    request: { problemId, problemVersion: options.version ?? 1, kind: options.kind ?? "submission", runtime: options.runtime ?? "typescript" },
    problem: { id: problemId, title: `Questão ${problem.toUpperCase()}`, slug: `questao-${problem}`, version: 2 },
    result: {
      id, verdict: options.verdict ?? "accepted", score: options.verdict ? 0 : 150, maxScore: 150, durationMs: 10,
      cases: [{ id: `${id}-case`, name: "Caso de exemplo", stage: 1, passed: !options.verdict }]
    }
  };
}

const recentActivity = [
  execution("run-a-v1", "a", { kind: "run" }),
  execution("run-a-v2", "a", { kind: "run", version: 2 }),
  execution("submission-a-v1", "a"),
  execution("submission-a-v2", "a", { version: 2, runtime: "python" }),
  execution("submission-b", "b", { verdict: "wrong_answer", runtime: "python" }),
  execution("system-error-c", "c", { verdict: "system_error" })
];

async function mockActivity(page: Page, executions: ActivityItem[] = []) {
  await page.route("**/api/v1/executions", async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({ json: { executions, historyLimit: 100 } });
  });
}

async function mockTokens(page: Page, initial: Token[] = []) {
  const state = { tokens: [...initial], creates: 0, revokedIds: [] as string[], createError: false, revokeError: false, listError: false };
  await page.route("**/api/v1/tokens", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      return route.fulfill(state.listError
        ? { status: 503, json: { error: "Tokens temporariamente indisponíveis." } }
        : { json: { tokens: state.tokens } });
    }
    if (method === "POST") {
      state.creates += 1;
      if (state.createError) return route.fulfill({ status: 503, json: { error: "Não foi possível criar o token de teste." } });
      const created = { ...activeToken, id: "profile-created-token", prefix: fakeSecret.slice(0, 10) };
      state.tokens = [...state.tokens, created];
      return route.fulfill({ status: 201, json: { token: fakeSecret, id: created.id, prefix: created.prefix, createdAt: created.created_at, expiresAt: created.expires_at } });
    }
    expect(method).toBe("DELETE");
    const { id } = route.request().postDataJSON() as { id: string };
    state.revokedIds.push(id);
    if (state.revokeError) return route.fulfill({ status: 503, json: { error: "Não foi possível revogar o token de teste." } });
    state.tokens = state.tokens.map((token) => token.id === id ? { ...token, revoked_at: "2026-09-09T12:00:00.000Z" } : token);
    return route.fulfill({ status: 204 });
  });
  return state;
}

function metric(page: Page, label: string) {
  return page.locator(".profile-stats > div").filter({ has: page.getByText(label, { exact: true }) }).locator("dd");
}

async function expectNoOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.body).toBeLessThanOrEqual(widths.viewport + 1);
}

test("perfil local usa atividade real sem somar runs como submissões nem duplicar questões por versão", async ({ page }) => {
  await mockActivity(page, recentActivity);
  await mockTokens(page);
  await page.goto("/perfil");
  await expect(page.getByRole("heading", { name: "@demo", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sua prática recente", exact: true })).toBeVisible();
  await expect(metric(page, "Questões praticadas")).toHaveText("2");
  await expect(metric(page, "Submissões")).toHaveText("3");
  await expect(metric(page, "Submissões aceitas")).toHaveText("2");
  await expect(page.getByRole("region", { name: "Sua prática recente", exact: true })).toContainText("Recorte das últimas 100 execuções carregadas.");
  await expect(page.locator(".profile-languages li").filter({ hasText: "TypeScript" })).toContainText("3 tentativas");
  await expect(page.locator(".profile-languages li").filter({ hasText: "Python" })).toContainText("2 tentativas");
  await expect(page.getByText("O link abre a versão atual (2).", { exact: true }).first()).toBeVisible();
  await expect(page.locator("main")).toContainText(/memória|reinici/i);
  await expect(page.locator('main a[href="/explorar?view=activity"]')).toBeVisible();
  await expect(page.locator('main a[href="/studio?section=mine"]')).toBeVisible();
});

test("perfil distingue carregamento de histórico realmente vazio", async ({ page }) => {
  let pending: Route | undefined;
  await page.route("**/api/v1/executions", (route) => { pending = route; });
  await mockTokens(page);
  await page.goto("/perfil");
  await expect(page.getByRole("status").filter({ hasText: "Carregando seu resumo…" })).toBeVisible();
  await expect(page.locator(".profile-stats")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Sua primeira tentativa começa aqui", exact: true })).toHaveCount(0);
  await expect.poll(() => Boolean(pending)).toBe(true);
  await pending!.fulfill({ json: { executions: [], historyLimit: 100 } });
  await expect(metric(page, "Questões praticadas")).toHaveText("0");
  await expect(metric(page, "Submissões")).toHaveText("0");
  await expect(metric(page, "Submissões aceitas")).toHaveText("0");
  await expect(page.getByRole("heading", { name: "Sua primeira tentativa começa aqui", exact: true })).toBeVisible();
});

test("falha no histórico não vira estatística zero e permite consultar novamente", async ({ page }) => {
  let failing = true;
  await page.route("**/api/v1/executions", (route) => route.fulfill(failing
    ? { status: 503, json: { error: "Histórico temporariamente indisponível." } }
    : { json: { executions: recentActivity, historyLimit: 100 } }));
  await mockTokens(page);
  await page.goto("/perfil");
  const practice = page.getByRole("region", { name: "Sua prática recente", exact: true });
  await expect(practice.getByRole("alert")).toContainText("Histórico temporariamente indisponível.");
  await expect(page.locator(".profile-stats")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Sua primeira tentativa começa aqui", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Criar token", exact: true })).toBeEnabled();
  failing = false;
  await practice.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(metric(page, "Questões praticadas")).toHaveText("2");
  await expect(practice.getByRole("alert")).toHaveCount(0);
});

test("token pode ser copiado sem persistir o segredo no navegador", async ({ page }) => {
  await mockActivity(page);
  const tokens = await mockTokens(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => { Object.assign(window, { __profileCopiedToken: text }); } }
    });
  });
  await page.goto("/perfil");
  await page.getByRole("button", { name: "Criar token", exact: true }).click();
  await expect(page.locator("code.token-secret-value")).toHaveText(fakeSecret);
  await page.getByRole("button", { name: "Copiar token", exact: true }).click();
  await expect(page.getByRole("button", { name: "Token copiado", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { __profileCopiedToken?: string }).__profileCopiedToken)).toBe(fakeSecret);
  const browserStorage = await page.evaluate(() => JSON.stringify({
    local: Object.entries(localStorage), session: Object.entries(sessionStorage), cookies: document.cookie
  }));
  expect(browserStorage).not.toContain(fakeSecret);
  await page.reload();
  await expect(page.locator("code.token-secret-value")).toHaveCount(0);
  await expect(page.locator(".token-item")).toContainText(fakeSecret.slice(0, 10));
  await expect(page.locator("main")).not.toContainText(fakeSecret);
  expect(tokens.creates).toBe(1);
});

test("revogação pede confirmação e preserva token ativo quando o servidor falha", async ({ page }) => {
  await mockActivity(page);
  const expired = { ...activeToken, id: "profile-expired", prefix: "sil_expire", expires_at: "2000-01-01T12:00:00.000Z" };
  const revoked = { ...activeToken, id: "profile-revoked", prefix: "sil_revoke", revoked_at: "2026-01-02T12:00:00.000Z" };
  const tokens = await mockTokens(page, [activeToken, expired, revoked]);
  await page.goto("/perfil");
  const activeRow = page.locator(".token-item").filter({ hasText: activeToken.prefix });
  const expiredRow = page.locator(".token-item").filter({ hasText: expired.prefix });
  const revokedRow = page.locator(".token-item").filter({ hasText: revoked.prefix });
  await expect(activeRow).toContainText("Ativo");
  await expect(expiredRow).toContainText("Expirado");
  await expect(revokedRow).toContainText("Revogado");
  await expect(revokedRow.getByRole("button", { name: /Revogar/ })).toHaveCount(0);
  await activeRow.getByRole("button", { name: `Revogar token ${activeToken.prefix}`, exact: true }).click();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(tokens.revokedIds).toEqual([]);
  await expect(activeRow).toContainText("Ativo");
  tokens.revokeError = true;
  await activeRow.getByRole("button", { name: `Revogar token ${activeToken.prefix}`, exact: true }).click();
  await page.getByRole("button", { name: "Revogar acesso", exact: true }).click();
  await expect(page.locator("#terminal-access").getByRole("alert")).toContainText("Não foi possível revogar o token de teste.");
  await expect(activeRow).toContainText("Ativo");
  tokens.revokeError = false;
  await page.getByRole("button", { name: "Revogar acesso", exact: true }).click();
  await expect(activeRow).toContainText("Revogado");
  await expect(activeRow.getByRole("button", { name: /Revogar token/ })).toHaveCount(0);
  expect(tokens.revokedIds).toEqual([activeToken.id, activeToken.id]);
});

test("falha ao criar token não mostra segredo e permite uma nova tentativa", async ({ page }) => {
  await mockActivity(page);
  const tokens = await mockTokens(page);
  tokens.createError = true;
  await page.goto("/perfil");
  await page.getByRole("button", { name: "Criar token", exact: true }).click();
  await expect(page.locator("#terminal-access").getByRole("alert")).toContainText("Não foi possível criar o token de teste.");
  await expect(page.locator("code.token-secret-value")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Criar token", exact: true })).toBeEnabled();
  tokens.createError = false;
  await page.getByRole("button", { name: "Criar token", exact: true }).click();
  await expect(page.locator("code.token-secret-value")).toHaveText(fakeSecret);
  await expect(page.locator("#terminal-access").getByRole("alert")).toHaveCount(0);
  expect(tokens.creates).toBe(2);
});

test("perfil mantém cartões, segredo e confirmação dentro de uma tela de 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await mockActivity(page, recentActivity);
  await mockTokens(page, [activeToken]);
  await page.goto("/perfil");
  await expect(metric(page, "Questões praticadas")).toHaveText("2");
  await expectNoOverflow(page);
  await page.getByRole("button", { name: "Criar token", exact: true }).click();
  await expect(page.locator("code.token-secret-value")).toHaveText(fakeSecret);
  await expectNoOverflow(page);
  await page.getByRole("button", { name: "Já guardei", exact: true }).click();
  await expect(page.locator("code.token-secret-value")).toHaveCount(0);
  await page.getByRole("button", { name: `Revogar token ${activeToken.prefix}`, exact: true }).click();
  await expect(page.getByRole("button", { name: "Revogar acesso", exact: true })).toBeVisible();
  await expectNoOverflow(page);
});
