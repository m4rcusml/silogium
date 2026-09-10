import { expect, test, type Page } from "@playwright/test";

const initialPrompt = "uma central de chamados com fila de prioridade";
const snapshot = { mode: "create", prompt: initialPrompt, runtime: "typescript", format: "progressive", difficulty: "medium", visibility: "private" };
const candidates = [
  { id: "existing-local", kind: "catalog", title: "Central de atendimento", summary: "Organize chamados por prioridade e mantenha o histórico de atendimento.", url: "/problemas/central-de-atendimento", sourceName: "Silogium · @autora + IA", importable: false, runtime: "typescript", metadata: { concepts: ["fila de prioridade"], skills: ["ordenar registros"] }, matchReasons: ["Mesmo conceito: fila de prioridade", "Formato progressivo"] },
  { id: "external-queue", kind: "external_link", title: "Priority queue practice", summary: "Sugestão externa para praticar estruturas de dados ordenadas.", url: "https://practice.example.org/priority-queue", sourceName: "Practice", importable: false, runtime: "typescript", metadata: { concepts: ["fila de prioridade"], skills: [] }, matchReasons: ["Tema relacionado"] }
];

async function mockDiscovery(page: Page, options: { rejectOnce?: boolean; stallOnce?: boolean } = {}) {
  const requests: Record<string, unknown>[] = [];
  const confirmations: Array<{ jobId: string; body: string | null }> = [];
  let consultations = 0;
  let completed = false;
  await page.route("**/api/v1/authoring", async (route) => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>);
    completed = false;
    await route.fulfill({ status: 202, json: { jobId: `discovery-job-${requests.length}` } });
  });
  await page.route("**/api/v1/jobs/discovery-job-*", async (route) => {
    consultations += 1;
    const request = requests.at(-1) ?? snapshot;
    await route.fulfill({ json: completed ? {
      status: "completed", request,
      result: { kind: "create", package: { problem: { id: "generated-example", slug: "nova-central", title: "Nova questão confirmada", summary: "Questão criada após a confirmação explícita do usuário.", visibility: "private", status: "validated", provenance: { kind: "native", createdByHandle: "local", assistedByAi: true } }, validation: { valid: true, checks: [{ name: "Referência", passed: true }] } } }
    } : { status: "needs_confirmation", request, result: { kind: "recommendations", candidates } } });
  });
  await page.route("**/api/v1/jobs/discovery-job-*/confirm", async (route) => {
    const jobId = new URL(route.request().url()).pathname.split("/").at(-2)!;
    confirmations.push({ jobId, body: route.request().postData() });
    if (options.rejectOnce && confirmations.length === 1) {
      await route.fulfill({ status: 503, json: { error: "Confirmação indisponível temporariamente." } });
      return;
    }
    if (options.stallOnce && confirmations.length === 1) return;
    completed = true;
    await route.fulfill({ status: 202, json: { jobId } });
  });
  return { requests, confirmations, consultations: () => consultations };
}

async function requestCreate(page: Page) {
  await page.goto("/studio?mode=create");
  await page.getByLabel("Descreva tema, dificuldade ou estilo").fill(initialPrompt);
  await page.getByLabel("Formato", { exact: true }).selectOption("progressive");
  await page.getByRole("button", { name: "Criar e validar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Encontramos questões parecidas", exact: true })).toBeVisible();
}

test("Studio sugere questões e só cria ao confirmar o pedido original", async ({ page }, testInfo) => {
  await page.clock.install();
  const api = await mockDiscovery(page);
  await requestCreate(page);
  expect(api.requests).toHaveLength(1);
  expect(api.requests[0]).toMatchObject(snapshot);
  expect(api.confirmations).toHaveLength(0);
  const gate = page.getByRole("region", { name: "Encontramos questões parecidas" });
  await page.screenshot({ path: testInfo.outputPath("recommendations.png"), fullPage: true });
  await expect(gate.locator(".similar-candidate")).toHaveCount(2);
  await expect(gate.locator(".similar-request")).toContainText(initialPrompt);
  await expect(gate.locator(".similar-request")).toContainText("Progressiva");
  await expect(gate.locator(".similar-tags").first()).toContainText("ordenar registros");
  await expect(gate.locator(".similar-reasons").first()).toContainText("Mesmo conceito");
  await expect(gate.getByRole("link", { name: "Resolver", exact: true })).toHaveAttribute("href", "/problemas/central-de-atendimento");
  const external = gate.locator(".similar-candidate").nth(1);
  await expect(external.getByRole("link", { name: "Ver na fonte" })).toHaveAttribute("href", candidates[1]!.url);
  await expect(external.getByRole("link", { name: "Ver na fonte" })).toHaveAttribute("target", "_blank");
  await expect(external.getByRole("link", { name: "Resolver", exact: true })).toHaveCount(0);
  await page.context().route(candidates[1]!.url, (route) => route.fulfill({ contentType: "text/html", body: "<html><body>Fonte externa de prática</body></html>" }));
  const opened = page.waitForEvent("popup");
  await external.getByRole("link", { name: "Ver na fonte" }).click();
  const sourcePage = await opened;
  await expect(sourcePage).toHaveURL(candidates[1]!.url);
  await sourcePage.close();
  const consultCount = api.consultations();
  await page.clock.fastForward(5_000);
  expect(api.consultations()).toBe(consultCount);
  expect(api.confirmations).toHaveLength(0);
  await gate.getByRole("button", { name: "Criar nova mesmo assim", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nova questão confirmada", exact: true })).toBeVisible();
  expect(api.confirmations).toEqual([{ jobId: "discovery-job-1", body: null }]);
  expect(api.requests).toHaveLength(1);
});

test("alterações não mudam silenciosamente a confirmação e ajustar restaura o pedido", async ({ page }) => {
  const api = await mockDiscovery(page);
  await requestCreate(page);
  await page.getByLabel("Descreva tema, dificuldade ou estilo").fill("quero praticar árvores binárias agora");
  await page.getByLabel("Linguagem", { exact: true }).selectOption("python");
  await expect(page.locator(".similar-edited")).toContainText("Confirmar aqui mantém o pedido original");
  await expect(page.locator(".similar-request")).toContainText(initialPrompt);
  await expect(page.locator(".similar-request")).toContainText("TypeScript");
  await page.getByRole("button", { name: "Ajustar pedido", exact: true }).click();
  await expect(page.getByLabel("Descreva tema, dificuldade ou estilo")).toHaveValue(initialPrompt);
  await expect(page.getByLabel("Descreva tema, dificuldade ou estilo")).toBeFocused();
  await expect(page.getByLabel("Linguagem", { exact: true })).toHaveValue("typescript");
  await expect(page.locator(".similar-problems")).toHaveCount(0);
  expect(api.confirmations).toHaveLength(0);
  await page.getByLabel("Descreva tema, dificuldade ou estilo").fill("fila de prioridade com notificações diferentes");
  await page.getByRole("button", { name: "Criar e validar", exact: true }).click();
  await expect(page.locator(".similar-request")).toContainText("notificações diferentes");
  expect(api.requests).toHaveLength(2);
  expect(api.confirmations).toHaveLength(0);
});

test("a confirmação pendente sobrevive ao reload sem criar um novo pedido", async ({ page }) => {
  const api = await mockDiscovery(page);
  await requestCreate(page);
  await page.reload();
  await expect(page.locator(".similar-request")).toContainText(initialPrompt);
  await expect(page.getByRole("button", { name: "Criar nova mesmo assim", exact: true })).toBeEnabled();
  expect(api.requests).toHaveLength(1);
  expect(api.confirmations).toHaveLength(0);
  await page.getByRole("button", { name: "Criar nova mesmo assim", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nova questão confirmada", exact: true })).toBeVisible();
  expect(api.confirmations).toEqual([{ jobId: "discovery-job-1", body: null }]);
});

test("falha de confirmação mantém sugestões e repete somente o mesmo job", async ({ page }) => {
  const api = await mockDiscovery(page, { rejectOnce: true });
  await requestCreate(page);
  await page.getByRole("button", { name: "Criar nova mesmo assim", exact: true }).click();
  await expect(page.locator(".similar-problems").getByRole("alert")).toContainText("Confirmação indisponível temporariamente.");
  await expect(page.locator(".similar-candidate")).toHaveCount(2);
  await page.getByRole("button", { name: "Criar nova mesmo assim", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nova questão confirmada", exact: true })).toBeVisible();
  expect(api.requests).toHaveLength(1);
  expect(api.confirmations).toEqual([{ jobId: "discovery-job-1", body: null }, { jobId: "discovery-job-1", body: null }]);
});

test("timeout de confirmação oferece consulta sem reenviar o formulário", async ({ page }) => {
  await page.clock.install();
  const api = await mockDiscovery(page, { stallOnce: true });
  await requestCreate(page);
  await page.getByRole("button", { name: "Criar nova mesmo assim", exact: true }).click();
  await expect.poll(() => api.confirmations.length).toBe(1);
  await page.clock.fastForward(30_001);
  await expect(page.locator(".similar-problems").getByRole("alert")).toContainText("A confirmação demorou a responder.");
  await page.getByRole("button", { name: "Consultar este pedido", exact: true }).click();
  await expect(page.getByRole("button", { name: "Criar nova mesmo assim", exact: true })).toBeEnabled();
  expect(api.requests).toHaveLength(1);
  expect(api.confirmations).toHaveLength(1);
});

test("sugestões mantêm cards, textos e ações separados em 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockDiscovery(page);
  await requestCreate(page);
  const dimensions = await page.locator(".similar-problems").evaluate((element) => {
    const cards = Array.from(element.querySelectorAll(".similar-candidate")).map((card) => card.getBoundingClientRect());
    return {
      width: document.documentElement.clientWidth,
      contentWidth: document.documentElement.scrollWidth,
      gap: cards[1]!.top - cards[0]!.bottom,
      innerFits: Array.from(element.querySelectorAll("h2,h3,p,dd,.button")).every((item) => {
        const bounds = item.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= document.documentElement.clientWidth + 1 && item.scrollWidth <= item.clientWidth + 1;
      })
    };
  });
  expect(dimensions.contentWidth).toBeLessThanOrEqual(dimensions.width + 1);
  expect(dimensions.gap).toBeGreaterThanOrEqual(12);
  expect(dimensions.innerFits).toBe(true);
});

test("a busca também mostra metadados e mantém links externos fora do judge", async ({ page }) => {
  await page.route("**/api/v1/authoring", (route) => route.fulfill({ status: 202, json: { jobId: "metadata-search" } }));
  await page.route("**/api/v1/jobs/metadata-search", (route) => route.fulfill({ json: { status: "completed", result: { kind: "search", candidates } } }));
  await page.goto("/studio");
  await page.getByLabel("Descreva tema, dificuldade ou estilo").fill("treinar fila de prioridade");
  await page.getByRole("button", { name: "Encontrar questões", exact: true }).click();
  const results = page.getByRole("region", { name: "Questões encontradas" });
  await expect(results.locator(".search-result")).toHaveCount(2);
  await expect(results.locator(".similar-tags").first()).toContainText("fila de prioridade");
  await expect(results.locator(".similar-reasons").first()).toContainText("Formato progressivo");
  await expect(results.locator(".search-result").nth(1).getByRole("link", { name: "Resolver", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Criar nova mesmo assim", exact: true })).toHaveCount(0);
});
