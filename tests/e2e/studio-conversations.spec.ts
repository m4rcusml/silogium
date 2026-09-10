import { expect, test, type Page } from "@playwright/test";

const conversationId = "44000000-0000-4000-8000-000000000001";
const conversation = { id: conversationId, title: "Filas de prioridade", createdAt: "2026-09-09T12:00:00Z", updatedAt: "2026-09-09T12:00:00Z" };
async function history(page: Page) {
  const deleted: string[] = [];
  await page.route("**/api/v1/conversations**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (route.request().method() === "DELETE") { deleted.push(pathname); await route.fulfill({ status: 204 }); return; }
    if (pathname === "/api/v1/conversations") { await route.fulfill({ json: { items: deleted.length ? [] : [conversation] } }); return; }
    await route.fulfill({ json: { conversation, items: [{ id: "history-job", jobId: "history-job", conversationId, mode: "search", userText: "Quero praticar filas de prioridade", assistantText: "Duas sugestões encontradas.", status: "completed", createdAt: conversation.createdAt, updatedAt: conversation.updatedAt }] } });
  });
  return deleted;
}

test("continua uma conversa e recupera o mesmo pedido após reload, sem novo envio", async ({ page }) => {
  const deleted = await history(page);
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/v1/authoring", async (route) => { requests.push(route.request().postDataJSON()); await route.fulfill({ status: 202, json: { jobId: "conversation-job", conversationId } }); });
  await page.route("**/api/v1/jobs/conversation-job", (route) => route.fulfill({ json: { status: "completed", request: { mode: "search", prompt: "agora uma mais difícil", runtime: "typescript", conversationId }, result: { kind: "search", candidates: [] } } }));
  await page.goto("/studio");
  await page.getByText("Conversas anteriores (1)", { exact: true }).click();
  await page.getByRole("button", { name: /Filas de prioridade/ }).click();
  await expect(page.locator(".conversation-turns")).toContainText("Quero praticar filas de prioridade");
  await page.getByLabel("Descreva tema, dificuldade ou estilo").fill("agora uma mais difícil");
  await page.getByRole("button", { name: "Encontrar questões", exact: true }).click();
  await expect(page.getByRole("region", { name: "Questões encontradas" })).toBeVisible();
  expect(requests[0]!.conversationId).toBe(conversationId);
  await page.reload();
  await expect(page.getByRole("region", { name: "Questões encontradas" })).toBeVisible();
  expect(requests).toHaveLength(1);
  await page.getByRole("button", { name: "Excluir conversa", exact: true }).click();
  await expect(page.getByText("Excluir somente o histórico? Questões e pedidos em execução serão mantidos.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Confirmar exclusão", exact: true }).click();
  expect(deleted).toEqual([`/api/v1/conversations/${conversationId}`]);
  await expect(page.locator(".conversation-turns")).toHaveCount(0);
});

test("importação cria job recuperável e não mantém uma requisição longa aberta", async ({ page }) => {
  await history(page);
  const imports: Record<string, unknown>[] = [];
  await page.route("**/api/v1/authoring", (route) => route.fulfill({ status: 202, json: { jobId: "search-import", conversationId } }));
  await page.route("**/api/v1/jobs/search-import", (route) => route.fulfill({ json: { status: "completed", request: { mode: "search", conversationId }, result: { kind: "search", candidates: [{ id: "two-fer", kind: "licensed_import", title: "Two Fer", summary: "Pratique strings.", url: "https://github.com/exercism/typescript/tree/main/exercises/practice/two-fer", sourceName: "Exercism", runtime: "typescript", licenseSpdx: "MIT", importable: true }] } } }));
  await page.route("**/api/v1/imports/exercism", async (route) => { imports.push(route.request().postDataJSON()); await route.fulfill({ status: 202, json: { jobId: "import-job", conversationId } }); });
  await page.route("**/api/v1/jobs/import-job", (route) => route.fulfill({ json: { status: "running", request: { mode: "import", sourceName: "Exercism", slug: "two-fer", runtime: "typescript", conversationId } } }));
  await page.goto("/studio");
  await page.getByLabel("Descreva tema, dificuldade ou estilo").fill("exercícios de strings");
  await page.getByRole("button", { name: "Encontrar questões", exact: true }).click();
  await page.getByRole("button", { name: "Importar e validar", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Importando e validando…" })).toBeVisible();
  expect(imports).toEqual([{ slug: "two-fer", runtime: "typescript", async: true, conversationId }]);
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "Importando e validando…" })).toBeVisible();
  expect(imports).toHaveLength(1);
});

test("refinamento envia a revisão e oferece editor sem publicar automaticamente", async ({ page }) => {
  await history(page);
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/v1/problems/fila/editorial", (route) => route.fulfill({ json: { revision: 3, phase: "draft", problem: { slug: "fila", title: "Fila auditável" } } }));
  await page.route("**/api/v1/authoring", async (route) => { requests.push(route.request().postDataJSON()); await route.fulfill({ status: 202, json: { jobId: "refine-job", conversationId } }); });
  await page.route("**/api/v1/jobs/refine-job", (route) => route.fulfill({ json: { status: "completed", request: { mode: "refine", slug: "fila", prompt: "Esclareça o desempate", expectedRevision: 3, conversationId }, result: { kind: "refine", slug: "fila", title: "Fila auditável revisada", revision: 4, validation: { valid: true, checks: [{ name: "schema", passed: true }], warnings: ["Revisão humana ainda necessária."] } } } }));
  await page.goto("/studio?mode=refine&slug=fila");
  await expect(page.getByText("Refinando “Fila auditável”, revisão 3.", { exact: false })).toBeVisible();
  await page.getByLabel("O que deve mudar nesta questão?").fill("Esclareça o desempate");
  await page.getByRole("button", { name: "Refinar com IA", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fila auditável revisada", exact: true })).toBeVisible();
  expect(requests[0]).toMatchObject({ mode: "refine", slug: "fila", prompt: "Esclareça o desempate", expectedRevision: 3 });
  await expect(page.getByRole("link", { name: "Revisar e validar no editor", exact: true })).toHaveAttribute("href", "/studio?section=mine&edit=fila");
  await expect(page.getByRole("link", { name: "Resolver agora", exact: true })).toHaveCount(0);
});

test("refinamento aguarda validação em andamento sem enviar pedido de IA", async ({ page }) => {
  await history(page);
  const requests: unknown[] = [];
  await page.route("**/api/v1/problems/fila/editorial", (route) => route.fulfill({ json: { revision: 4, phase: "validating", problem: { slug: "fila", title: "Fila auditável" } } }));
  await page.route("**/api/v1/authoring", async (route) => { requests.push(route.request().postDataJSON()); await route.fulfill({ status: 400, json: { error: "Não deve enviar durante validação" } }); });
  await page.goto("/studio?mode=refine&slug=fila");
  await page.getByLabel("O que deve mudar nesta questão?").fill("Esclareça o desempate");
  await expect(page.getByRole("status").filter({ hasText: "A validação deste rascunho está em andamento." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refinar com IA", exact: true })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Consultar rascunho no editor", exact: true })).toHaveAttribute("href", "/studio?section=mine&edit=fila");
  expect(requests).toEqual([]);
});
