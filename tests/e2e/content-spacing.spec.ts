import { expect, test, type Page } from "@playwright/test";

async function expectGap(page: Page, first: string, second: string, minimum: number) {
  await expect(page.locator(first)).toBeVisible();
  await expect(page.locator(second)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const before = await page.locator(first).boundingBox();
  const after = await page.locator(second).boundingBox();
  expect(after!.y - before!.y - before!.height, `${first} → ${second}`).toBeGreaterThanOrEqual(minimum - 1);
}

test("biblioteca e resultados do Studio mantêm separação entre blocos", async ({ page }) => {
  let job: unknown = { status: "completed" };
  await page.route("**/api/v1/jobs/spacing-test", (route) => route.fulfill({ json: job }));
  await page.route("**/api/v1/problems/mine", (route) => route.fulfill({ json: { problems: [] } }));
  await page.route("**/api/v1/authoring", (route) => route.abort());
  await page.addInitScript(() => localStorage.setItem("silogium:studio:job:local-demo", JSON.stringify({ id: "spacing-test", mode: "create", startedAt: Date.now() })));

  await page.goto("/studio?section=mine");
  await expectGap(page, ".studio-header", ".studio-library .library-empty", 24);
  job = { status: "completed", result: { kind: "create", package: {
    problem: { id: "spacing-test", title: "Organize os chamados", slug: "spacing-test", summary: "Implemente uma fila para organizar os chamados e priorizar os mais urgentes.", status: "validated", visibility: "private", provenance: { kind: "native", createdBy: "local-demo", createdByHandle: "demo", assistedByAi: true } },
    validation: { valid: true, checks: [{ name: "Solução de referência", passed: true }] }
  } } };
  await page.goto("/studio?mode=create");
  await expectGap(page, ".created-result-status", ".created-result h2", 16);
  await expectGap(page, ".created-result > details:first-of-type", ".created-result .studio-inline-actions", 16);
  await page.getByText("Ver verificações (1/1)", { exact: true }).click();
  await expectGap(page, ".created-result > details:first-of-type", ".created-result .studio-inline-actions", 16);

  job = { status: "completed", result: { kind: "search", candidates: [1, 2].map((id) => ({
    id: String(id), kind: "catalog", title: `Questão ${id}`, summary: "Uma questão para treinar mapas e ordenação.", url: "/problemas/rede-de-armarios", sourceName: "Silogium", runtime: "typescript", importable: false
  })) } };
  await page.goto("/studio");
  await expectGap(page, ".search-result:nth-of-type(1)", ".search-result:nth-of-type(2)", 16);
});

test("catálogo confortável separa texto e tags e usa cards distintos em telas pequenas", async ({ page }) => {
  await page.route("**/api/v1/executions", (route) => route.fulfill({ json: { executions: [], historyLimit: 100 } }));
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/explorar");
    await page.getByRole("button", { name: "Confortável", exact: true }).click();
    await expectGap(page, ".problem-row:first-of-type .problem-summary", ".problem-row:first-of-type .problem-tags", 8);
    if (width <= 800) {
      await expectGap(page, ".catalog-sidebar", ".problem-row:nth-of-type(1)", 16);
      await expectGap(page, ".problem-row:nth-of-type(1)", ".problem-row:nth-of-type(2)", 12);
    }
  }
});

test("biblioteca preenchida mantém texto e ações afastados das bordas no mobile", async ({ page, request }) => {
  const response = await request.get("/api/v1/problems/rede-de-armarios");
  expect(response.ok()).toBeTruthy();
  const { problem } = await response.json();
  await page.route("**/api/v1/problems/mine", (route) => route.fulfill({ json: { problems: [{ ...problem, status: "validated", visibility: "private" }] } }));
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/studio?section=mine");
  const row = page.locator(".studio-problem-row");
  await expect(row).toBeVisible();
  const inset = await row.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const heading = element.querySelector("h3")!.getBoundingClientRect();
    const actions = element.querySelector(".studio-row-actions")!.getBoundingClientRect();
    return { left: heading.left - bounds.left, right: bounds.right - actions.right, overflow: document.documentElement.scrollWidth - innerWidth };
  });
  expect(inset.left).toBeGreaterThanOrEqual(16);
  expect(inset.right).toBeGreaterThanOrEqual(16);
  expect(inset.overflow).toBeLessThanOrEqual(1);
});
