import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { ExecutionResult, JudgeCase, ProblemDefinition } from "@silogium/core";

const workspacePath = "/problemas/rede-de-armarios";

async function getProblem(request: APIRequestContext) {
  const response = await request.get("/api/v1/problems/rede-de-armarios");
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<{ problem: ProblemDefinition; visibleCases: JudgeCase[] }>;
}

function acceptedResult(cases: JudgeCase[] = []): ExecutionResult {
  return { id: "mock-execution", verdict: "accepted", score: 150, maxScore: 150, durationMs: 12, cases: cases.map((item) => ({ id: item.id, name: item.name, stage: item.stage, passed: true })) };
}

async function mockExecutions(page: Page, result: ExecutionResult) {
  const submitted: Array<Record<string, unknown>> = [];
  await page.route("**/api/v1/executions", async (route) => {
    if (route.request().method() === "POST") {
      submitted.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ json: { ...result, id: `${result.id}-${submitted.length}` } });
    } else await route.fulfill({ json: { executions: [], historyLimit: 100 } });
  });
  return submitted;
}

async function waitForJob(request: APIRequestContext, jobId: string) {
  let body: Record<string, unknown> = {};
  await expect.poll(async () => {
    const response = await request.get(`/api/v1/jobs/${jobId}`);
    expect(response.ok()).toBeTruthy();
    body = await response.json() as Record<string, unknown>;
    return body.status;
  }, { timeout: 10_000 }).not.toBe("running");
  return body;
}

test("o catálogo contém apenas questões resolvíveis no Silogium", async ({ page }) => {
  await page.goto("/explorar");
  await expect(page.getByRole("heading", { name: "Praticar", exact: true })).toBeVisible();
  await expect(page.locator(".problem-card")).toHaveCount(6);
  await expect(page.getByText("Link externo")).toHaveCount(0);
});

test("catálogo oferece três clássicas e preserva as três progressivas", async ({ page }) => {
  await page.route("**/api/v1/executions*", (route) => route.fulfill({ json: { executions: [], historyLimit: 100 } }));
  await page.route("**/api/v1/practice", (route) => route.fulfill({ status: 503, json: { error: "Histórico não faz parte deste teste de catálogo." } }));
  await page.goto("/explorar");
  await expect(page.locator(".problem-card")).toHaveCount(6);
  await page.getByRole("combobox", { name: "Filtrar formato" }).selectOption("classic");
  await expect(page.locator(".problem-card")).toHaveCount(3);
  for (const [slug, title] of [["pacotes-complementares", "Pacotes complementares"], ["janelas-de-manutencao", "Janelas de manutenção"], ["rotas-da-estacao", "Rotas da estação"]]) {
    await expect(page.locator(`.problem-card[href="/problemas/${slug}"]`)).toContainText(title!);
  }
  await page.getByRole("combobox", { name: "Filtrar formato" }).selectOption("progressive");
  await expect(page.locator(".problem-card")).toHaveCount(3);
  await expect(page.locator('.problem-card[href="/problemas/rede-de-armarios"]')).toBeVisible();
  await expect(page.locator(".problem-card [data-label='Formato']")).toHaveText(["4 níveis", "4 níveis", "4 níveis"]);
  await page.getByRole("combobox", { name: "Filtrar formato" }).selectOption("");
  await expect(page.locator(".problem-card")).toHaveCount(6);
});

for (const classic of [
  { slug: "pacotes-complementares", title: "Pacotes complementares" },
  { slug: "janelas-de-manutencao", title: "Janelas de manutenção" },
  { slug: "rotas-da-estacao", title: "Rotas da estação" }
]) {
  test(`clássica ${classic.slug} mostra enunciado completo e permite TypeScript e Python`, async ({ page }, info) => {
    const submissions = await mockExecutions(page, acceptedResult());
    await page.route("**/api/v1/personal", (route) => route.fulfill({ status: 503, json: { error: "Biblioteca pessoal não faz parte deste teste de enunciado." } }));
    await page.goto(`/problemas/${classic.slug}`);
    await expect(page.getByRole("heading", { name: classic.title, exact: true })).toBeVisible();
    await expect(page.locator(".statement-meta")).toContainText("Questão clássica");
    await expect(page.locator(".statement-meta")).toContainText("100 pontos");
    await expect(page.getByRole("navigation", { name: "Níveis da questão" })).toHaveCount(0);
    const statement = page.locator(".statement-pane article.markdown").first();
    for (const heading of ["Entrada", "Saída", "Exemplo 1", "Exemplo 2", "Implementação"]) {
      await expect(statement.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }
    await expect(statement).toContainText("100000");
    const runtime = page.getByRole("combobox", { name: "Linguagem", exact: true });
    await expect(runtime).toHaveValue("typescript");
    await expect(runtime.locator("option")).toHaveText(["TypeScript", "Python"]);
    if (info.project.name === "mobile") await page.getByRole("navigation", { name: "Área da questão" }).getByRole("button", { name: "Código", exact: true }).click();
    await expect(page.locator(".editor-toolbar")).toContainText("solucao.ts");
    await runtime.selectOption("python");
    await expect(runtime).toHaveValue("python");
    await expect(page.locator(".editor-toolbar")).toContainText("solucao.py");
    await runtime.selectOption("typescript");
    await expect(page.locator(".editor-toolbar")).toContainText("solucao.ts");
    expect(submissions).toEqual([]);
  });
}

test("uma questão pode ser aberta e executada", async ({ page }, testInfo) => {
  await page.goto("/problemas/rede-de-armarios");
  await expect(page.getByText("Rede de armários de encomendas").first()).toBeVisible();
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Código", exact: true }).click();
  }
  await page.getByRole("button", { name: "Executar", exact: true }).click();
  if (testInfo.project.name === "mobile") {
    await page.getByRole("navigation", { name: "Área da questão" }).getByRole("button", { name: "Resultado", exact: true }).click();
  }
  await expect(page.locator(".results-pane")).toContainText(/wrong_answer|accepted/, { timeout: 20_000 });
});

test("o layout móvel oferece Questão, Código e Resultado", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Cenário exclusivo do viewport móvel");
  await page.goto("/problemas/rede-de-armarios");
  await expect(page.getByRole("button", { name: "Questão", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Código", exact: true }).click();
  await expect(page.locator(".editor-pane")).toBeVisible();
  await page.getByRole("navigation", { name: "Área da questão" }).getByRole("button", { name: "Resultado", exact: true }).click();
  await expect(page.locator(".results-pane")).toBeVisible();
});

test("a criação pública exige aceite explícito das licenças", async ({ page }) => {
  await page.goto("/assistente");
  await page.getByRole("button", { name: "Criar", exact: true }).click();
  await page.getByLabel("Descreva tema, dificuldade ou estilo").fill("uma questão sobre janelas deslizantes");
  await page.getByLabel("Visibilidade").selectOption("public");
  await expect(page.getByRole("button", { name: "Criar e validar" })).toBeDisabled();
  await page.getByRole("checkbox", { name: /Aceito publicar o enunciado/ }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Criar e validar" })).toBeEnabled();
});

test("tokens da CLI são exibidos uma vez, autenticam e podem ser revogados", async ({ request }) => {
  const created = await request.post("/api/v1/tokens");
  expect(created.ok()).toBeTruthy();
  const body = await created.json() as { token: string; id: string };
  expect(body.token).toMatch(/^sil_/);

  const authenticated = await request.get("/api/v1/problems/mine", { headers: { authorization: `Bearer ${body.token}` } });
  expect(authenticated.ok()).toBeTruthy();

  const revoked = await request.delete("/api/v1/tokens", { data: { id: body.id } });
  expect(revoked.ok()).toBeTruthy();
  const denied = await request.get("/api/v1/problems/mine", { headers: { authorization: `Bearer ${body.token}` } });
  expect(denied.ok()).toBeFalsy();
});

test("a API recusa pedido público sem licença aceita", async ({ request }, testInfo) => {
  const payload = {
    mode: "create",
    prompt: `questão editorial de prefixos ${testInfo.project.name}`,
    runtime: "typescript",
    format: "classic",
    difficulty: "medium",
    visibility: "public"
  };
  const denied = await request.post("/api/v1/authoring", { data: payload });
  expect(denied.status()).toBe(400);

  const accepted = await request.post("/api/v1/authoring", { data: { ...payload, licensesAccepted: true } });
  expect(accepted.status()).toBe(202);
  const { jobId } = await accepted.json() as { jobId: string };
  const initial = await waitForJob(request, jobId);
  if (initial.status === "needs_confirmation") {
    const confirmed = await request.post(`/api/v1/jobs/${jobId}/confirm`);
    expect(confirmed.status()).toBe(202);
  }
  await expect(waitForJob(request, jobId)).resolves.toMatchObject({
    status: "completed",
    result: { kind: "create", package: { problem: { status: "pending_review" } } }
  });
});

test("as rotas antigas levam às áreas consolidadas", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await expect(page).toHaveURL(/\/explorar$/);
  await page.goto("/assistente");
  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.getByRole("heading", { name: "Descobrir ou criar", exact: true })).toBeVisible();
  await page.goto("/minhas-questoes");
  await expect(page).toHaveURL(/\/studio\?section=mine$/);
  await expect(page.getByRole("heading", { name: "Minhas questões", exact: true })).toBeVisible();
  await page.goto("/submissoes");
  await expect(page).toHaveURL(/\/explorar\?view=activity$/);
  await expect(page.getByRole("tab", { name: "Minha atividade" })).toHaveAttribute("aria-selected", "true");
});

test("busca, filtros e densidade do catálogo funcionam e a preferência persiste", async ({ page }) => {
  await page.goto("/explorar");
  await page.getByRole("button", { name: "Confortável", exact: true }).click();
  await expect(page.locator(".problem-list")).toHaveClass(/density-comfortable/);
  await page.reload();
  await expect(page.getByRole("button", { name: "Confortável", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("textbox", { name: "Buscar questões" }).fill("armários");
  await expect(page.locator(".problem-card")).toHaveCount(1);
  await expect(page.locator(".problem-card")).toContainText("Rede de armários de encomendas");
  await page.getByRole("combobox", { name: "Filtrar formato" }).selectOption("classic");
  await expect(page.getByText("Nenhuma questão corresponde aos filtros.")).toBeVisible();
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await expect(page.locator(".problem-card")).toHaveCount(6);
  await page.getByRole("link", { name: "Criar questão", exact: true }).click();
  await expect(page).toHaveURL(/\/studio\?mode=create$/);
  await expect(page.getByRole("button", { name: "Criar", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("progresso exige submissão aceita de todos os níveis da versão atual", async ({ page, request }) => {
  const { problem, visibleCases } = await getProblem(request);
  // This scenario specifically exercises the explicitly labelled recent-history fallback.
  await page.route("**/api/v1/practice", (route) => route.fulfill({ status: 503, json: { error: "Complete history unavailable for this fallback test" } }));
  let kind = "run";
  await page.route("**/api/v1/executions", (route) => route.fulfill({ json: { historyLimit: 100, executions: [{
    createdAt: new Date().toISOString(), request: { kind, problemId: problem.id, problemVersion: problem.version, runtime: "typescript" }, result: acceptedResult(visibleCases)
  }] } }));
  await page.goto("/explorar");
  await page.getByRole("combobox", { name: "Filtrar progresso" }).selectOption("solved");
  await expect(page.locator(".problem-card")).toHaveCount(0);
  await page.getByRole("combobox", { name: "Filtrar progresso" }).selectOption("in_progress");
  await expect(page.locator(".problem-card")).toHaveCount(1);
  kind = "submission";
  await page.reload();
  await page.getByRole("combobox", { name: "Filtrar progresso" }).selectOption("solved");
  await expect(page.locator(".problem-card")).toHaveCount(1);
  await expect(page.locator(".problem-progress")).toContainText("Resolvida");
});

test("rascunhos vazio e preenchido são restaurados separadamente por linguagem", async ({ page, request }) => {
  const { problem } = await getProblem(request);
  const tsKey = `silogium:draft:local-demo:${problem.id}:${problem.version}:typescript`;
  const pyKey = `silogium:draft:local-demo:${problem.id}:${problem.version}:python`;
  const pythonSource = "# meu rascunho Python\nclass Solucao:\n    pass\n";
  await page.addInitScript(({ tsKey, pyKey, pythonSource }) => {
    if (localStorage.getItem(tsKey) === null) localStorage.setItem(tsKey, "");
    if (localStorage.getItem(pyKey) === null) localStorage.setItem(pyKey, pythonSource);
  }, { tsKey, pyKey, pythonSource });
  const submitted = await mockExecutions(page, acceptedResult());
  await page.goto(workspacePath);
  await page.getByRole("button", { name: "Executar", exact: true }).click();
  await expect.poll(() => submitted.length).toBe(1);
  expect(submitted[0]).toMatchObject({ runtime: "typescript", source: "" });
  await expect(page.getByRole("button", { name: "Executar", exact: true })).toBeEnabled();
  await page.getByRole("combobox", { name: "Linguagem", exact: true }).selectOption("python");
  await page.getByRole("button", { name: "Executar", exact: true }).click();
  await expect.poll(() => submitted.length).toBe(2);
  expect(submitted[1]).toMatchObject({ runtime: "python", source: pythonSource });
  await page.reload();
  await page.getByRole("button", { name: "Executar", exact: true }).click();
  await expect.poll(() => submitted.length).toBe(3);
  expect(submitted[2]).toMatchObject({ runtime: "typescript", source: "" });
  expect(await page.evaluate((key) => localStorage.getItem(key), pyKey)).toBe(pythonSource);
});

test("níveis preservam requisitos anteriores e submeter sempre avalia todos", async ({ page }) => {
  const submitted = await mockExecutions(page, acceptedResult());
  await page.goto(workspacePath);
  await page.getByRole("button", { name: "Nível 2, 150 pontos", exact: true }).click();
  await expect(page.getByText("Novo neste nível", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Requisitos acumulados", exact: true })).toBeVisible();
  const previous = page.locator(".previous-requirements details").first();
  await previous.locator("summary").click();
  await expect(previous.locator("article")).toBeVisible();
  await page.getByRole("button", { name: "Executar", exact: true }).click();
  await expect.poll(() => submitted.length).toBe(1);
  expect(submitted[0]).toMatchObject({ kind: "run", maxStage: 2 });
  await page.getByRole("button", { name: "Submeter", exact: true }).click();
  await expect.poll(() => submitted.length).toBe(2);
  expect(submitted[1]).toMatchObject({ kind: "submission", maxStage: 4 });
  await expect(page.locator(".results-header")).toContainText("Submissão · avaliação completa");
});

test("resultado abre a primeira falha, mostra o diff e permite repetir o caso", async ({ page, request }) => {
  const { visibleCases } = await getProblem(request);
  const result = acceptedResult(visibleCases.slice(0, 2));
  result.verdict = "wrong_answer";
  result.cases[1] = { ...result.cases[1]!, passed: false, message: 'topLockers: esperado ["B(8)","A(4)"], recebido ["A(4)","B(8)"]', mismatch: { method: "topLockers", expected: ["B(8)", "A(4)"], actual: ["A(4)", "B(8)"] } };
  const submitted = await mockExecutions(page, result);
  await page.goto(workspacePath);
  await page.getByRole("button", { name: "Nível 2, 150 pontos", exact: true }).click();
  await page.getByRole("button", { name: "Executar", exact: true }).click();
  await expect(page.locator(".test-case-list button").nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".value-diff")).toContainText("Esperado");
  await expect(page.locator(".value-diff")).toContainText("Recebido");
  await page.getByRole("button", { name: "Nível 1, 150 pontos", exact: true }).click();
  await page.getByRole("button", { name: "Executar este caso", exact: true }).click();
  await expect.poll(() => submitted.length).toBe(2);
  expect(submitted[1]?.visibleCaseIds).toEqual([visibleCases[1]!.id]);
  expect(submitted[1]?.maxStage).toBeGreaterThanOrEqual(visibleCases[1]!.stage);
  await page.getByRole("button", { name: "Usar como teste próprio", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Casos em JSON" })).toHaveValue(new RegExp(visibleCases[1]!.id));
  await page.getByRole("textbox", { name: "Casos em JSON" }).fill("{ inválido");
  await page.getByRole("button", { name: "Executar meus testes", exact: true }).click();
  await expect(page.locator(".custom-test-editor").getByRole("alert")).toContainText("JSON inválido");
  expect(submitted).toHaveLength(2);
  await page.getByRole("textbox", { name: "Casos em JSON" }).fill(JSON.stringify([visibleCases[1]]));
  await page.getByRole("button", { name: "Executar meus testes", exact: true }).click();
  await expect.poll(() => submitted.length).toBe(3);
  expect((submitted[2]?.customCases as JudgeCase[])[0]?.id).toBe(visibleCases[1]!.id);
  await expect(page.locator(".execution-summary")).toBeVisible();
  await expect(page.getByRole("button", { name: "Executar este caso", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Usar como teste próprio", exact: true })).toHaveCount(0);
});

test("histórico do workspace filtra questão e versão e abre detalhes na tela", async ({ page, request }) => {
  const { problem, visibleCases } = await getProblem(request);
  const item = { createdAt: new Date().toISOString(), request: { problemId: problem.id, problemVersion: problem.version, kind: "submission", runtime: "typescript" }, result: acceptedResult(visibleCases), problem };
  await page.route("**/api/v1/executions*", (route) => route.fulfill({ json: { historyLimit: 100, executions: [
    item,
    { ...item, result: { ...item.result, id: "old-version" }, request: { ...item.request, problemVersion: problem.version + 1 } },
    { ...item, result: { ...item.result, id: "other-problem" }, request: { ...item.request, problemId: "00000000-0000-4000-8000-000000000001" } }
  ] } }));
  await page.goto(workspacePath);
  await page.getByRole("button", { name: "Histórico", exact: true }).click();
  await expect(page.locator(".activity-entry")).toHaveCount(1);
  await page.locator(".activity-entry summary").click();
  await expect(page.locator(".activity-details")).toBeVisible();
  await expect(page.locator(".activity-details")).toContainText(visibleCases[0]!.name);
  await expect(page).toHaveURL(new RegExp(`${workspacePath}$`));
});

test("falha de rede aparece no resultado e libera uma nova tentativa", async ({ page }) => {
  await page.route("**/api/v1/executions", (route) => route.request().method() === "POST" ? route.abort("failed") : route.fulfill({ json: { executions: [] } }));
  await page.goto(workspacePath);
  await page.getByRole("button", { name: "Executar", exact: true }).click();
  await expect(page.locator(".execution-summary")).toContainText("system_error");
  await expect(page.locator(".result-message")).toBeVisible();
  await expect(page.getByRole("button", { name: "Executar", exact: true })).toBeEnabled();
});

test("API executa teste próprio e recusa usá-lo como submissão oficial", async ({ request }) => {
  const { problem, visibleCases } = await getProblem(request);
  const runtime = problem.runtimes.find((item) => item.language === "typescript")!;
  expect(runtime.entrypoint.kind).toBe("class");
  if (runtime.entrypoint.kind !== "class") throw new Error("Este cenário exige o exercício de armários.");
  const first = visibleCases[0]!;
  expect(first.kind).toBe("call-sequence");
  if (first.kind !== "call-sequence") throw new Error("Este cenário exige chamadas de métodos.");
  const call = first.calls[0]!;
  const payload = {
    kind: "run", problemId: problem.id, problemVersion: problem.version, runtime: "typescript", maxStage: 1,
    source: `export class ${runtime.entrypoint.symbol} { ${call.method}(..._args: unknown[]) { return true; } }`,
    customCases: [{ ...first, id: "my-own-case", name: "Meu caso próprio", calls: [call] }]
  };
  const execution = await request.post("/api/v1/executions", { data: payload });
  expect(execution.ok()).toBeTruthy();
  const result = await execution.json() as ExecutionResult;
  expect(result.verdict).toBe("accepted");
  expect(result.cases).toHaveLength(1);
  expect(result.cases[0]?.id).toBe("my-own-case");
  const denied = await request.post("/api/v1/executions", { data: { ...payload, kind: "submission" } });
  expect(denied.status()).toBe(400);
  expect((await denied.json() as ExecutionResult).verdict).toBe("system_error");
});

test("Studio retoma um pedido após recarregar sem criar outro pedido", async ({ page }) => {
  let completed = false;
  let requests = 0;
  let consultations = 0;
  const jobId = "studio-reload-job";
  await page.route("**/api/v1/authoring", async (route) => {
    requests += 1;
    expect(route.request().postDataJSON()).toMatchObject({ mode: "search", runtime: "typescript" });
    await route.fulfill({ status: 202, json: { jobId } });
  });
  await page.route(`**/api/v1/jobs/${jobId}`, async (route) => {
    consultations += 1;
    await route.fulfill({ json: completed ? {
      status: "completed", result: { kind: "search", candidates: [{
        id: "catalog-armarios", kind: "catalog", title: "Questão retomada de armários", summary: "Treine estruturas de dados com uma rede de armários.",
        url: workspacePath, sourceName: "Silogium", importable: false, runtime: "typescript"
      }] }
    } : { status: "running" } });
  });
  await page.goto("/studio");
  await page.getByRole("textbox", { name: "Descreva tema, dificuldade ou estilo" }).fill("questão progressiva de armários");
  await page.getByRole("button", { name: "Encontrar questões", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Pesquisando questões…" })).toBeVisible();
  await expect.poll(() => consultations).toBeGreaterThan(0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("silogium:studio:job:local-demo") ?? "null"));
  expect(stored).toMatchObject({ id: jobId, mode: "search" });
  completed = true;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Questão retomada de armários", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Resolver", exact: true })).toHaveAttribute("href", workspacePath);
  expect(consultations).toBeGreaterThan(1);
  expect(requests).toBe(1);
});

test("Studio explica uma resposta HTML de erro e permite consultar o mesmo pedido novamente", async ({ page }) => {
  let requests = 0;
  let consultations = 0;
  const jobId = "studio-retry-job";
  await page.route("**/api/v1/authoring", async (route) => {
    requests += 1;
    await route.fulfill({ status: 202, json: { jobId } });
  });
  await page.route(`**/api/v1/jobs/${jobId}`, async (route) => {
    consultations += 1;
    if (consultations === 1) await route.fulfill({ status: 503, contentType: "text/html", body: "<html><body>Gateway unavailable</body></html>" });
    else await route.fulfill({ json: { status: "completed", result: { kind: "search", candidates: [] } } });
  });
  await page.goto("/studio");
  await page.getByRole("textbox", { name: "Descreva tema, dificuldade ou estilo" }).fill("questão de busca em largura");
  await page.getByRole("button", { name: "Encontrar questões", exact: true }).click();
  await expect(page.getByText("Não foi possível consultar o pedido (HTTP 503).", { exact: true })).toBeVisible();
  await expect(page.getByText("Gateway unavailable", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "Consultar novamente", exact: true }).click();
  await expect(page.getByText("Nenhuma questão encontrada. Tente outro tema ou uma descrição mais ampla.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Consultar novamente", exact: true })).toHaveCount(0);
  expect(consultations).toBe(2);
  expect(requests).toBe(1);
});

test("modo foco pode ser encerrado por Escape e painéis podem ser redimensionados por teclado", async ({ page }, testInfo) => {
  await page.goto(workspacePath);
  if (testInfo.project.name === "mobile") {
    await page.getByRole("navigation", { name: "Área da questão" }).getByRole("button", { name: "Código", exact: true }).click();
  } else {
    const statementResizer = page.getByRole("separator", { name: "Redimensionar enunciado e editor" });
    await statementResizer.focus();
    await statementResizer.press("ArrowRight");
    await expect(statementResizer).toHaveAttribute("aria-valuenow", "44");
    const resultResizer = page.getByRole("separator", { name: "Redimensionar resultados" });
    await resultResizer.focus();
    await resultResizer.press("ArrowUp");
    await expect(resultResizer).toHaveAttribute("aria-valuenow", "39");
  }
  await page.getByRole("button", { name: "Modo foco", exact: true }).click();
  await expect(page.locator(".workspace")).toHaveAttribute("data-focus", "true");
  await expect(page.locator(".site-header")).toBeHidden();
  await expect(page.locator(".statement-pane")).toBeHidden();
  await expect(page.getByRole("button", { name: "Executar", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".workspace")).toHaveAttribute("data-focus", "false");
  await expect(page.locator(".site-header")).toBeVisible();
});

test("execução sem resposta expira com aviso e recupera os controles", async ({ page }) => {
  await page.clock.install();
  let requested = false;
  await page.route("**/api/v1/executions", async (route) => {
    if (route.request().method() === "POST") {
      requested = true;
      return;
    }
    await route.fulfill({ json: { executions: [], historyLimit: 100 } });
  });
  await page.goto(workspacePath);
  await page.getByRole("button", { name: "Executar", exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await expect(page.getByRole("button", { name: "Executar", exact: true })).toBeDisabled();
  await page.clock.fastForward(90_001);
  await expect(page.locator(".result-message")).toContainText("O servidor demorou demais para responder.");
  await expect(page.locator(".result-message")).toContainText("Consulte o Histórico");
  await expect(page.getByRole("button", { name: "Executar", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Submeter", exact: true })).toBeEnabled();
});
