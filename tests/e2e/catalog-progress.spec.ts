import { expect, test } from "@playwright/test";
import type { ProblemDefinition } from "@silogium/core";

test("catálogo reconhece solução antiga pelo histórico completo mesmo fora da primeira página", async ({ page, request }) => {
  const { problem } = await (await request.get("/api/v1/problems/rede-de-armarios")).json() as { problem: ProblemDefinition };
  await page.route("**/api/v1/executions*", (route) => route.fulfill({ json: { executions: [], total: 154, limit: 50, nextCursor: "another-page" } }));
  await page.route("**/api/v1/practice", (route) => route.fulfill({ json: {
    historyComplete: true, historyScope: "session", mode: "demo", preferences: { showProgress: false },
    catalogProgress: [{ problemId: problem.id, problemVersion: problem.version, submissions: [{ stages: problem.stages.map((stage) => stage.number), accepted: true, best: { score: 600, maxScore: 600 } }] }]
  } }));
  await page.goto("/explorar");
  await expect(page.getByText(/com base em todo o histórico disponível nesta sessão demo/)).toBeVisible();
  await page.getByRole("combobox", { name: "Filtrar progresso" }).selectOption("solved");
  await expect(page.locator(".problem-card")).toHaveCount(1);
  await expect(page.locator(".problem-card .problem-progress")).toContainText("Resolvida");
  await page.getByRole("combobox", { name: "Filtrar progresso" }).selectOption("not_started");
  await expect(page.locator(".problem-card")).toHaveCount(5);
  await expect(page.locator(".problem-progress").first()).toContainText("Não iniciada nesta versão");
});

test("catálogo identifica fallback recente e recupera solução antiga quando o agregado volta", async ({ page, request }) => {
  const { problem } = await (await request.get("/api/v1/problems/rede-de-armarios")).json() as { problem: ProblemDefinition };
  let recovered = false;
  await page.route("**/api/v1/executions*", (route) => route.fulfill({ json: { executions: [], total: 154, limit: 50, nextCursor: "another-page" } }));
  await page.route("**/api/v1/practice", (route) => recovered
    ? route.fulfill({ json: { historyComplete: true, historyScope: "account", preferences: { showProgress: false }, catalogProgress: [{ problemId: problem.id, problemVersion: problem.version, submissions: [{ stages: problem.stages.map((stage) => stage.number), accepted: true }] }] } })
    : route.fulfill({ status: 503, json: { error: "Temporariamente indisponível" } }));
  await page.goto("/explorar");
  await expect(page.getByText(/O histórico completo está indisponível/)).toBeVisible();
  await expect(page.locator(".problem-progress").first()).toContainText("Sem atividade no recorte recente");
  await page.getByRole("combobox", { name: "Filtrar progresso" }).selectOption("solved");
  await expect(page.locator(".problem-card")).toHaveCount(0);
  recovered = true;
  await page.getByRole("button", { name: "Tentar histórico completo novamente" }).click();
  await expect(page.locator(".problem-card")).toHaveCount(1);
  await expect(page.getByText(/com base em todo o histórico da sua conta/)).toBeVisible();
});
