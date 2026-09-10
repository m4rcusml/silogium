import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { JudgeBundleSchema, seedProblems, type ExecutionRequest, type ExecutionResult, type JudgeCase, type ProblemDefinition } from "@silogium/core";

type Submitted = ExecutionRequest & { visibleCaseIds?: string[]; customCases?: JudgeCase[] };
type Fixture = { problem: ProblemDefinition; visibleCases: JudgeCase[] };
type CustomizeResult = (result: ExecutionResult, request: Submitted, ordinal: number) => ExecutionResult | Promise<ExecutionResult>;
const classicSlug = "pacotes-complementares";
const progressiveSlug = "rede-de-armarios";
const completion = (page: Page) => page.getByRole("dialog", { name: "Questão resolvida!", exact: true });
const completedResult = (page: Page) => page.getByRole("region", { name: "Questão resolvida", exact: true });

function fixture(slug: string): Fixture {
  const problem = seedProblems.find((item) => item.slug === slug);
  if (!problem) throw new Error(`Seed ${slug} não encontrado. Gere o conteúdo antes de executar esta suíte.`);
  const bundle = JudgeBundleSchema.parse(JSON.parse(readFileSync(new URL(`../../content/judge/${slug}.visible.json`, import.meta.url), "utf8")));
  if (bundle.problemId !== problem.id || bundle.problemVersion !== problem.version) throw new Error("Seed e fixtures visíveis divergem.");
  return { problem, visibleCases: bundle.visibleCases };
}

function acceptedResult(value: Fixture, request: Submitted, ordinal: number): ExecutionResult {
  const cases = request.customCases ?? value.visibleCases.filter((item) => request.visibleCaseIds
    ? request.visibleCaseIds.includes(item.id)
    : item.stage <= (request.maxStage ?? Math.max(...value.problem.stages.map((stage) => stage.number))));
  const evaluatedStages = new Set(cases.map((item) => item.stage));
  const maxScore = value.problem.stages.filter((stage) => evaluatedStages.has(stage.number)).reduce((total, stage) => total + stage.points, 0);
  return {
    id: `completion-fixture-${ordinal}`, verdict: "accepted", score: maxScore, maxScore, durationMs: 30 + ordinal,
    cases: cases.map((item) => ({ id: item.id, name: item.name, stage: item.stage, passed: true }))
  };
}

async function setup(page: Page, slug: string, customize: CustomizeResult = (result) => result) {
  const value = fixture(slug);
  const sources = { typescript: "// Rascunho de teste preservado em TypeScript.\n", python: "# Rascunho de teste preservado em Python.\n" };
  await page.addInitScript(({ problemId, version, sources }) => {
    for (const [runtime, source] of Object.entries(sources)) localStorage.setItem(`silogium:draft:local-demo:${problemId}:${version}:${runtime}`, source);
  }, { problemId: value.problem.id, version: value.problem.version, sources });
  const submissions: Submitted[] = [];
  const results: ExecutionResult[] = [];
  // The server never receives the mock source, invokes a judge, or saves a result.
  await page.route("**/api/v1/executions*", async (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ json: { executions: [], total: 0, limit: 50, nextCursor: null } });
    const request = route.request().postDataJSON() as Submitted;
    submissions.push(request);
    const result = await customize(acceptedResult(value, request, submissions.length), request, submissions.length);
    results.push(result);
    await route.fulfill({ json: result });
  });
  await page.route("**/api/v1/personal", (route) => route.fulfill({ json: {
    state: { revision: 0, favorites: [], lists: [], simulations: [], profile: { displayName: "QA", bio: "", website: "", shared: false } },
    mode: "demo", handle: "demo", problems: []
  } }));
  await page.route("**/api/v1/personal/recommendations", (route) => route.fulfill({ json: { recommendations: [] } }));
  await page.route("**/api/v1/personal/simulations", (route) => route.fulfill({ json: { simulations: [] } }));
  await page.route("**/api/v1/practice", (route) => route.fulfill({ json: { mode: "demo", historyScope: "session", historyComplete: true, catalogProgress: [], preferences: { showProgress: false } } }));
  await page.goto(`/problemas/${slug}`);
  await expect(page.getByRole("button", { name: "Submeter", exact: true })).toBeEnabled();
  return { ...value, submissions, results, sources };
}

async function renderSettled(page: Page) {
  // Let native-dialog/useEffect updates reach the screen before negative assertions.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function expectNoCompletion(page: Page, verdict: ExecutionResult["verdict"] = "accepted") {
  await expect(page.locator(".execution-summary")).toContainText(verdict);
  await expect(page.getByRole("button", { name: "Submeter", exact: true })).toBeEnabled();
  await renderSettled(page);
  await expect(completion(page)).not.toBeVisible();
  await expect(completedResult(page)).not.toBeVisible();
}

test("submissão clássica completa confirma 100/100, preserva código e deixa o resultado acessível", async ({ page }, testInfo) => {
  const activity = await setup(page, classicSlug);
  await page.getByRole("button", { name: "Submeter", exact: true }).click();
  const dialog = completion(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveJSProperty("open", true);
  await expect(dialog).toContainText("100/100");
  await expect(dialog).toContainText(activity.problem.title);
  await expect(dialog.getByRole("button", { name: "Ver resultado", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Continuar editando", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Fechar confirmação", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("completion.png"), animations: "disabled" });
  expect(activity.submissions).toHaveLength(1);
  expect(activity.submissions[0]).toMatchObject({ kind: "submission", runtime: "typescript", maxStage: 1, source: activity.sources.typescript });
  await dialog.getByRole("button", { name: "Ver resultado", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(completedResult(page)).toBeVisible();
  await expect(page.getByRole("region", { name: "Resultado da avaliação", exact: true })).toContainText("100/100");
  await expect(page.getByRole("region", { name: "Resultado da avaliação", exact: true })).toBeFocused();
  await expect(completedResult(page).getByRole("button", { name: "Ver conclusão", exact: true })).toBeVisible();
});

test("submissão progressiva completa confirma 600/600 e quatro níveis sem mudar a solução", async ({ page }, testInfo) => {
  const activity = await setup(page, progressiveSlug);
  await page.getByRole("button", { name: "Submeter", exact: true }).click();
  const dialog = completion(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("600/600");
  for (const number of [1, 2, 3, 4]) await expect(dialog).toContainText(`Nível ${number}`);
  await page.screenshot({ path: testInfo.outputPath("completion.png"), animations: "disabled" });
  expect(activity.submissions[0]).toMatchObject({ kind: "submission", maxStage: 4, source: activity.sources.typescript });
  await dialog.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".editor-pane")).toBeVisible();
  await expect(page.locator(".workspace")).toHaveAttribute("data-mobile-tab", "code");
  await expect.poll(() => page.getByRole("region", { name: "Editor de código", exact: true }).evaluate((element) => element.contains(document.activeElement))).toBe(true);
  expect(activity.submissions).toHaveLength(1);
});

test("Executar aceito na clássica explica os testes visíveis e oferece Submeter solução", async ({ page }) => {
  const activity = await setup(page, classicSlug);
  await page.getByRole("button", { name: "Executar", exact: true }).click();
  await expectNoCompletion(page);
  await expect(page.getByText("Testes visíveis passaram", { exact: true })).toBeVisible();
  const submit = page.getByRole("button", { name: "Submeter solução", exact: true });
  await expect(submit).toBeVisible();
  expect(activity.submissions[0]?.kind).toBe("run");
  await submit.click();
  await expect(completion(page)).toBeVisible();
  expect(activity.submissions.map((item) => item.kind)).toEqual(["run", "submission"]);
});

test("Executar aceito no primeiro nível oferece avançar sem declarar a questão concluída", async ({ page }) => {
  const activity = await setup(page, progressiveSlug);
  await page.getByRole("button", { name: "Executar", exact: true }).click();
  await expectNoCompletion(page);
  await expect(page.getByText("Testes visíveis passaram", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Avançar para o nível 2", exact: true }).click();
  await expect(page.getByRole("button", { name: "Nível 2, 150 pontos", exact: true })).toHaveAttribute("aria-current", "step");
  await expect(page.locator(".statement-meta")).toContainText("Nível 2 de 4");
  await expect(completion(page)).not.toBeVisible();
  expect(activity.submissions).toHaveLength(1);
  expect(activity.submissions[0]).toMatchObject({ kind: "run", maxStage: 1 });
});

test("repetir apenas um caso visível aceito não abre confirmação de conclusão", async ({ page }) => {
  const activity = await setup(page, classicSlug);
  await page.getByRole("button", { name: "Executar", exact: true }).click();
  await expectNoCompletion(page);
  await page.getByRole("button", { name: "Executar este caso", exact: true }).click();
  await expect.poll(() => activity.submissions.length).toBe(2);
  await expectNoCompletion(page);
  await expect(page.locator(".results-header")).toContainText("Caso visível selecionado");
  expect(activity.submissions[1]).toMatchObject({ kind: "run", visibleCaseIds: [activity.visibleCases[0]!.id] });
});

test("testes próprios aceitos não concluem uma questão nem alteram o código", async ({ page }) => {
  const activity = await setup(page, classicSlug);
  const mobileTabs = page.getByRole("navigation", { name: "Área da questão" });
  if (await mobileTabs.isVisible()) await mobileTabs.getByRole("button", { name: "Resultado", exact: true }).click();
  await page.getByRole("navigation", { name: "Testes e resultados" }).getByRole("button", { name: "Testes próprios", exact: true }).click();
  const custom = { ...activity.visibleCases[0]!, id: "completion-custom", name: "Meu caso de teste" };
  await page.getByRole("textbox", { name: "Casos em JSON" }).fill(JSON.stringify([custom]));
  await page.getByRole("button", { name: "Executar meus testes", exact: true }).click();
  await expectNoCompletion(page);
  await expect(page.locator(".results-header")).toContainText("Testes próprios");
  expect(activity.submissions[0]).toMatchObject({ kind: "run", source: activity.sources.typescript, customCases: [custom] });
});

for (const verdict of ["wrong_answer", "system_error"] as const) {
  test(`submissão ${verdict} não apresenta confirmação de sucesso`, async ({ page }) => {
    const activity = await setup(page, classicSlug, (result) => ({ ...result, verdict, score: 0,
      cases: verdict === "system_error" ? [] : result.cases.map((item, index) => ({ ...item, passed: index !== 0 })),
      message: verdict === "system_error" ? "Falha de infraestrutura simulada; código preservado." : "Revise o resultado do primeiro caso." }));
    await page.getByRole("button", { name: "Submeter", exact: true }).click();
    await expectNoCompletion(page, verdict);
    await expect(page.locator(".result-message")).toBeVisible();
    expect(activity.submissions).toHaveLength(1);
    expect(activity.submissions[0]?.source).toBe(activity.sources.typescript);
  });
}

for (const incomplete of ["missing-stage", "partial-score", "failed-case"] as const) {
  test(`accepted contraditório (${incomplete}) não conta como conclusão completa`, async ({ page }) => {
    const activity = await setup(page, progressiveSlug, (result) => {
      if (incomplete === "missing-stage") return { ...result, cases: result.cases.filter((item) => item.stage !== 4) };
      if (incomplete === "partial-score") return { ...result, score: 450 };
      return { ...result, cases: result.cases.map((item, index) => ({ ...item, passed: index !== 0 })) };
    });
    await page.getByRole("button", { name: "Submeter", exact: true }).click();
    await expectNoCompletion(page);
    expect(activity.submissions[0]).toMatchObject({ kind: "submission", maxStage: 4 });
  });
}

test("reenvio aceito na mesma linguagem atualiza o banner e só reabre por ação explícita", async ({ page }) => {
  const activity = await setup(page, classicSlug);
  await page.getByRole("button", { name: "Submeter", exact: true }).click();
  await completion(page).getByRole("button", { name: "Ver resultado", exact: true }).click();
  await expect(completedResult(page)).toBeVisible();
  await page.getByRole("button", { name: "Submeter", exact: true }).click();
  await expect.poll(() => activity.submissions.length).toBe(2);
  await expect(completedResult(page)).toBeVisible();
  await expect(page.locator(".execution-summary")).toContainText("32 ms");
  await renderSettled(page);
  await expect(completion(page)).not.toBeVisible();
  expect(activity.submissions[1]?.source).toBe(activity.sources.typescript);
  await completedResult(page).getByRole("button", { name: "Ver conclusão", exact: true }).click();
  await expect(completion(page)).toBeVisible();
  await expect(completion(page)).toContainText("100/100");
  await completion(page).getByRole("button", { name: "Fechar confirmação", exact: true }).click();
  await expect(completion(page)).not.toBeVisible();
  await expect(completedResult(page)).toBeVisible();
  expect(activity.submissions).toHaveLength(2);
});

test("primeira solução em outra linguagem abre confirmação sem repetir a da linguagem anterior", async ({ page }) => {
  const activity = await setup(page, classicSlug);
  await page.getByRole("button", { name: "Submeter", exact: true }).click();
  await completion(page).getByRole("button", { name: "Fechar confirmação", exact: true }).click();
  await page.getByRole("combobox", { name: "Linguagem", exact: true }).selectOption("python");
  await page.getByRole("button", { name: "Submeter", exact: true }).click();
  await expect(completion(page)).toBeVisible();
  expect(activity.submissions[1]).toMatchObject({ runtime: "python", source: activity.sources.python });
  await completion(page).getByRole("button", { name: "Ver resultado", exact: true }).click();
  await page.getByRole("combobox", { name: "Linguagem", exact: true }).selectOption("typescript");
  await page.getByRole("button", { name: "Submeter", exact: true }).click();
  await expect.poll(() => activity.submissions.length).toBe(3);
  await expect(completedResult(page)).toBeVisible();
  await renderSettled(page);
  await expect(completion(page)).not.toBeVisible();
  expect(activity.submissions[2]).toMatchObject({ runtime: "typescript", source: activity.sources.typescript });
});

test("dialog retém foco, bloqueia atalhos de execução e Escape fecha somente a confirmação", async ({ page }) => {
  const activity = await setup(page, classicSlug);
  const mobileTabs = page.getByRole("navigation", { name: "Área da questão" });
  if (await mobileTabs.isVisible()) await mobileTabs.getByRole("button", { name: "Código", exact: true }).click();
  await page.getByRole("button", { name: "Modo foco", exact: true }).click();
  await page.getByRole("button", { name: "Submeter", exact: true }).click();
  const dialog = completion(page);
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  for (let index = 0; index < 7; index++) {
    await page.keyboard.press("Tab");
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  for (let index = 0; index < 7; index++) {
    await page.keyboard.press("Shift+Tab");
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  // Keep modified Enter off the navigation link while exercising the real
  // keyboard shortcut path; native dialogs must own focus and keyboard input.
  await dialog.getByRole("button", { name: "Ver resultado", exact: true }).focus();
  await page.keyboard.press("Control+Shift+Enter");
  await page.keyboard.press("Control+Enter");
  await dialog.getByRole("link", { name: "Escolher outra questão", exact: true }).focus();
  await page.keyboard.press("Meta+Enter");
  await page.keyboard.press("Control+Shift+Enter");
  await renderSettled(page);
  await expect(dialog).toBeVisible();
  expect(activity.submissions).toHaveLength(1);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".workspace")).toHaveAttribute("data-focus", "true");
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest("dialog[open]")))).toBe(false);
  expect(activity.submissions[0]?.source).toBe(activity.sources.typescript);
  expect(activity.submissions).toHaveLength(1);
});

test("confirmação cabe em 320 pixels e Escolher outra questão leva ao catálogo sem novo envio", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const activity = await setup(page, progressiveSlug);
  await page.getByRole("button", { name: "Submeter", exact: true }).click();
  const dialog = completion(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("600/600");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(321);
  expect(await dialog.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  await page.screenshot({ path: testInfo.outputPath("completion.png"), animations: "disabled" });
  const next = dialog.getByRole("link", { name: "Escolher outra questão", exact: true });
  await expect(next).toHaveAttribute("href", "/explorar?runtime=typescript");
  await next.click();
  await expect(page).toHaveURL(/\/explorar\?runtime=typescript$/);
  await expect(page.getByRole("heading", { name: "Praticar", exact: true })).toBeVisible();
  expect(activity.submissions).toHaveLength(1);
});

test("submissão em andamento desabilita o terminal e não empilha dois dialogs", async ({ page }) => {
  let releaseReply!: () => void;
  const waiting = new Promise<void>((resolve) => { releaseReply = resolve; });
  let received = false;
  const activity = await setup(page, progressiveSlug, async (result) => {
    received = true;
    await waiting;
    return result;
  });
  try {
    await page.getByRole("button", { name: "Submeter", exact: true }).click();
    await expect.poll(() => received).toBe(true);
    await expect(page.getByRole("button", { name: "Resolver no terminal", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Submeter", exact: true })).toBeDisabled();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
  } finally {
    releaseReply();
  }
  await expect(completion(page)).toBeVisible();
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  await expect(page.getByRole("dialog", { name: "Resolver pelo terminal", exact: true })).not.toBeVisible();
  expect(activity.submissions).toHaveLength(1);
});

test("viewport landscape baixo abre a confirmação no topo com foco no título", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 640, height: 360 });
  const activity = await setup(page, progressiveSlug);
  await page.getByRole("button", { name: "Submeter", exact: true }).click();
  const dialog = completion(page);
  const title = dialog.getByRole("heading", { name: "Questão resolvida!", exact: true });
  await expect(dialog).toBeVisible();
  await expect(title).toHaveAttribute("tabindex", "-1");
  await expect(title).toBeFocused();
  await expect(title).toBeInViewport();
  await expect(dialog).toHaveJSProperty("scrollTop", 0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  const bounds = await title.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(360);
  await page.screenshot({ path: testInfo.outputPath("short-completion.png"), animations: "disabled" });
  expect(activity.submissions).toHaveLength(1);
});
