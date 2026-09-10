import { expect, test } from "@playwright/test";

const overview = {
  mode: "demo", historyScope: "session", historyComplete: true, totalExecutions: 153,
  activity: { problemsPracticed: 12, submissions: 130, acceptedSubmissions: 80, runs: 23, systemErrors: 0, languages: [{ runtime: "typescript", attempts: 153 }] },
  summary: { distinctProblems: 0, byRuntime: { typescript: 0, python: 0 } }, unverifiedSubmissions: 130, completions: [], milestones: [], achievements: [],
  week: { userId: "local-demo", weekStart: "2026-09-07", startsAt: "2026-09-07T03:00:00.000Z", endsAt: "2026-09-14T03:00:00.000Z", timeZone: "America/Sao_Paulo", goalDays: null, days: [], progressDays: 0, status: "disabled" },
  weeks: [], preferences: { preferences: { timeZone: "America/Sao_Paulo", goalDays: null }, showProgress: true, weeks: [] }
};

test("perfil usa totais completos e permite meta opt-in sem premiar o histórico demo", async ({ page }) => {
  await page.route("**/api/v1/executions", (route) => route.fulfill({ json: { executions: [], total: 153, limit: 50, nextCursor: null } }));
  let payload: unknown;
  await page.route("**/api/v1/practice", async (route) => {
    if (route.request().method() === "PATCH") payload = route.request().postDataJSON();
    await route.fulfill({ json: overview });
  });
  await page.goto("/perfil");
  const summary = page.getByRole("region", { name: "Sua prática", exact: true });
  await expect(summary).toContainText("Todas as execuções preservadas nesta sessão local.");
  await expect(summary.locator(".profile-stats > div").filter({ hasText: "Questões praticadas" }).locator("dd")).toHaveText("12");
  const practice = page.getByRole("region", { name: "Progresso no seu ritmo" });
  await expect(practice).toContainText("não geram conclusões ou conquistas oficiais");
  await expect(practice.getByLabel("Meta semanal", { exact: true })).toHaveValue("off");
  await practice.getByLabel("Meta semanal", { exact: true }).selectOption("3");
  await practice.getByRole("button", { name: "Salvar preferências de prática" }).click();
  await expect(practice.getByRole("status")).toContainText("Preferências salvas");
  expect(payload).toEqual({ goalDays: 3, timeZone: "America/Sao_Paulo", showProgress: true });
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test("histórico pagina sem expor o código antes de abrir detalhes", async ({ page }) => {
  const item = (id: string) => ({ actorId: "local-demo", createdAt: "2026-09-09T12:00:00.000Z", request: { kind: "submission", problemId: "p1", problemVersion: 1, runtime: "typescript" },
    problem: { id: "p1", title: "Questão de histórico", slug: "historico", version: 1 }, codeAvailable: true, verification: "demo",
    result: { id, verdict: "accepted", score: 100, maxScore: 100, durationMs: 10, cases: [] } });
  await page.route("**/api/v1/executions*", (route) => route.fulfill({ json: {
    executions: new URL(route.request().url()).searchParams.has("cursor") ? [item("second")] : [item("first")],
    total: 2, limit: 1, nextCursor: new URL(route.request().url()).searchParams.has("cursor") ? null : "next"
  } }));
  await page.route("**/api/v1/submissions/first", (route) => route.fulfill({ json: { ...item("first"), source: "const minhaSolucao = 42;", reopenUrl: "/problemas/historico?version=1&submission=first&runtime=typescript" } }));
  await page.goto("/explorar?view=activity");
  await expect(page.locator(".activity-entry")).toHaveCount(1);
  await expect(page.locator("main")).not.toContainText("minhaSolucao");
  await page.getByRole("button", { name: "Carregar mais atividades" }).click();
  await expect(page.locator(".activity-entry")).toHaveCount(2);
  await page.locator(".activity-entry").first().locator("summary").click();
  await page.getByRole("button", { name: "Ver meu código" }).first().click();
  await expect(page.locator("pre")).toContainText("const minhaSolucao = 42;");
  await expect(page.getByRole("link", { name: "Reabrir código nesta versão" })).toHaveAttribute("href", /version=1&submission=first/);
});
