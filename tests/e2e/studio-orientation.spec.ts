import { expect, test, type Page } from "@playwright/test";

const promptLabel = "Descreva tema, dificuldade ou estilo";
const conversationId = "studio-orientation-conversation";

/** All assistant/history mutations stay inside this browser fixture. No AI,
 * imports, conversations or authored problems are created on the test server.
 */
async function mockStudio(page: Page, withConversation = false) {
  const requests: Array<Record<string, unknown>> = [];
  const conversationWrites: string[] = [];
  const importRequests: string[] = [];
  await page.route("**/api/v1/problems/mine", (route) => route.fulfill({ json: { problems: [] } }));
  await page.route("**/api/v1/conversations**", (route) => {
    if (route.request().method() !== "GET") conversationWrites.push(route.request().method());
    const listing = new URL(route.request().url()).pathname === "/api/v1/conversations";
    return route.fulfill({ json: { items: listing && withConversation ? [{
      id: conversationId, actorId: "local-demo", title: "Treino anterior de intervalos",
      createdAt: "2026-09-09T12:00:00.000Z", updatedAt: "2026-09-09T12:00:00.000Z"
    }] : [] } });
  });
  await page.route("**/api/v1/authoring", (route) => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({ status: 202, json: { jobId: "studio-orientation-job" } });
  });
  await page.route("**/api/v1/jobs/**", (route) => route.fulfill({ json: { status: "completed", result: { kind: "search", candidates: [] } } }));
  await page.route("**/api/v1/imports/**", (route) => {
    importRequests.push(route.request().url());
    return route.fulfill({ status: 400, json: { error: "Importação não faz parte deste teste de orientação." } });
  });
  return { requests, conversationWrites, importRequests };
}

test("modos têm descrições claras e nomes acessíveis, e o guia começa recolhido", async ({ page }) => {
  const activity = await mockStudio(page);
  await page.goto("/studio");
  const modes = page.getByRole("group", { name: "Modo do assistente" });
  const search = modes.getByRole("button", { name: "Pesquisar", exact: true });
  const create = modes.getByRole("button", { name: "Criar", exact: true });
  await expect(search.locator("strong")).toHaveText("Pesquisar");
  await expect(search).toHaveAccessibleDescription("Encontre questões por assunto ou habilidade.");
  await expect(search).toHaveAttribute("aria-pressed", "true");
  await expect(create.locator("strong")).toHaveText("Criar");
  await expect(create).toHaveAccessibleDescription("Peça uma nova questão para praticar.");
  await expect(create).toHaveAttribute("aria-pressed", "false");
  await expect(modes.getByRole("button", { name: "Refinar", exact: true })).toHaveCount(0);
  const guide = page.locator("details.studio-guide");
  await expect(guide).toHaveJSProperty("open", false);
  await expect(guide.locator(".studio-guide-content")).toBeHidden();
  await guide.locator("summary").click();
  await expect(guide).toHaveJSProperty("open", true);
  await expect(guide).toContainText("Para escrever sua solução e testar o código");
  await expect(guide).toContainText("Links externos são resolvidos no site original");
  await expect(guide).toContainText("Publicar no catálogo é opcional e depende de revisão.");
  await expect(guide.getByRole("link", { name: "Abra o catálogo de questões." })).toHaveAttribute("href", "/explorar");
  await guide.locator("summary").click();
  await expect(guide.locator(".studio-guide-content")).toBeHidden();
  expect(activity.requests).toEqual([]);
  expect(activity.importRequests).toEqual([]);
});

test("mostra a fase real e espera de capacidade sem reenviar o pedido", async ({ page }) => {
  const activity = await mockStudio(page);
  let waiting = false;
  await page.route("**/api/v1/jobs/studio-orientation-job", route => route.fulfill({ json: {
    status: "running", progress: { phase: waiting ? "waiting" : "cases", updatedAt: new Date().toISOString(),
      ...(waiting ? { retryAt: new Date(Date.now() + 65000).toISOString() } : {}) }
  } }));
  await page.goto("/studio?mode=create");
  await page.getByRole("textbox", { name: promptLabel }).fill("Uma questão curta sobre mapas e contagem");
  await page.getByRole("button", { name: "Criar e validar", exact: true }).click();
  await expect(page.locator(".authoring-progress")).toContainText("Construindo testes e exemplos");
  waiting = true;
  await expect(page.locator(".authoring-progress")).toContainText("Aguardando capacidade do Groq");
  await expect(page.locator(".authoring-progress")).toContainText("Não é necessário reenviar");
  expect(activity.requests).toHaveLength(1);
});

for (const example of [
  { mode: "search", name: "Arrays e mapas", value: "Quero praticar arrays e mapas em uma questão fácil, com contagem de frequências.", action: "Encontrar questões" },
  { mode: "create", name: "Agenda de reuniões", value: "Crie uma questão sobre conflitos em uma agenda de reuniões, com intervalos e casos de borda.", action: "Criar e validar" }
] as const) {
  test(`exemplo de ${example.mode} apenas preenche e foca o pedido, sem enviar`, async ({ page }) => {
    const activity = await mockStudio(page);
    await page.goto(`/studio?mode=${example.mode}`);
    await page.getByRole("button", { name: example.name, exact: true }).click();
    await expect(page.getByRole("textbox", { name: promptLabel })).toHaveValue(example.value);
    await expect(page.getByRole("textbox", { name: promptLabel })).toBeFocused();
    await expect(page.getByRole("button", { name: example.action, exact: true })).toBeEnabled();
    await expect(page.locator(".studio-examples")).toHaveCount(0);
    await expect(page.locator(".authoring-progress")).toHaveCount(0);
    expect(activity.requests).toEqual([]);
    expect(activity.importRequests).toEqual([]);
  });
}

test("formato e acesso explicam o efeito e publicação exige consentimento renovado", async ({ page }) => {
  const activity = await mockStudio(page);
  await page.goto("/studio?mode=create");
  const prompt = page.getByRole("textbox", { name: promptLabel });
  await prompt.fill("Uma questão sobre contagem de eventos e desempate.");
  await expect(page.getByLabel("Linguagem", { exact: true })).toHaveValue("typescript");
  await expect(page.getByLabel("Dificuldade", { exact: true })).toHaveValue("medium");
  const format = page.getByLabel("Formato", { exact: true });
  await expect(format).toHaveValue("classic");
  await expect(format).toHaveAccessibleDescription("Um enunciado, uma solução. Todos os requisitos disponíveis desde o início.");
  await format.selectOption("progressive");
  await expect(format).toHaveAccessibleDescription("Um mesmo desafio em níveis. Cada etapa acrescenta requisitos à sua solução.");
  await format.selectOption("classic");
  await expect(page.locator("#format-help")).toContainText("Todos os requisitos disponíveis desde o início.");
  const visibility = page.getByLabel("Visibilidade", { exact: true });
  const submit = page.getByRole("button", { name: "Criar e validar", exact: true });
  await expect(visibility).toHaveValue("private");
  await expect(visibility).toHaveAccessibleDescription("Somente você e a administração têm acesso. Pode solicitar publicação depois.");
  await expect(submit).toBeEnabled();
  await visibility.selectOption("unlisted");
  await expect(visibility).toHaveAccessibleDescription(/Fora do catálogo.*CLI é exclusivo do proprietário/);
  await expect(page.getByRole("checkbox", { name: /Aceito publicar/ })).toHaveCount(0);
  await visibility.selectOption("public");
  await expect(visibility).toHaveAccessibleDescription("Vai para revisão após a validação. Só aparece no catálogo quando aprovada.");
  const consent = page.getByRole("checkbox", { name: /Aceito publicar o enunciado sob CC BY 4.0/ });
  await expect(consent).not.toBeChecked();
  await expect(submit).toBeDisabled();
  await consent.check();
  await expect(submit).toBeEnabled();
  await visibility.selectOption("private");
  await visibility.selectOption("public");
  await expect(consent).not.toBeChecked();
  await expect(submit).toBeDisabled();
  await expect(page.locator(".authoring-submit-row")).toContainText("Primeiro verificamos questões parecidas.");
  await expect(page.locator(".authoring-submit-row")).toContainText("A criação não pesquisa a web");
  expect(activity.requests).toEqual([]);
});

test("Nova questão em Minhas questões abre de fato o modo de criação", async ({ page }) => {
  const activity = await mockStudio(page);
  await page.goto("/studio?mode=create");
  await page.getByRole("textbox", { name: promptLabel }).fill("Pedido anterior de questão pública.");
  await page.getByLabel("Visibilidade", { exact: true }).selectOption("public");
  await page.getByRole("checkbox", { name: /Aceito publicar/ }).check();
  await page.getByRole("navigation", { name: "Áreas do Studio" }).getByRole("button", { name: "Minhas questões", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Minhas questões", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Nova questão", exact: true }).click();
  await expect(page).toHaveURL(/\/studio\?mode=create$/);
  await expect(page.getByRole("button", { name: "Criar", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Pesquisar", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("heading", { name: "Descreva sua nova questão", exact: true })).toBeVisible();
  await expect(page.getByLabel("Formato", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: promptLabel })).toHaveValue("");
  await expect(page.getByLabel("Visibilidade", { exact: true })).toHaveValue("private");
  await page.getByLabel("Visibilidade", { exact: true }).selectOption("public");
  await expect(page.getByRole("checkbox", { name: /Aceito publicar/ })).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Criar e validar", exact: true })).toBeDisabled();
  expect(activity.requests).toEqual([]);
});

test("falha de abertura do refinamento permite recuperar sem criar um pedido", async ({ page }) => {
  const activity = await mockStudio(page);
  let consultations = 0;
  await page.route("**/api/v1/problems/fila/editorial", (route) => {
    consultations += 1;
    return consultations === 1
      ? route.fulfill({ status: 503, json: { error: "Consulta indisponível." } })
      : route.fulfill({ json: { revision: 2, phase: "draft", problem: { slug: "fila", title: "Fila de eventos" } } });
  });
  await page.goto("/studio?mode=refine&slug=fila");
  await expect(page.getByRole("alert").filter({ hasText: "Consulta indisponível." })).toBeVisible();
  await expect(page.getByText("Carregando rascunho…", { exact: false })).toHaveCount(0);
  await page.getByRole("textbox", { name: "O que deve mudar nesta questão?" }).fill("Esclareça o desempate.");
  await expect(page.getByRole("button", { name: "Refinar com IA", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Tentar abrir rascunho novamente" }).click();
  await expect(page.getByText("Refinando “Fila de eventos”, revisão 2.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refinar com IA", exact: true })).toBeEnabled();
  expect(activity.requests).toEqual([]);
  expect(consultations).toBe(2);
});

test("importação impede troca de contexto até a confirmação do recebimento", async ({ page }) => {
  await mockStudio(page, true);
  let releaseImport!: () => void;
  const importReady = new Promise<void>((resolve) => { releaseImport = resolve; });
  let importing = false;
  await page.route("**/api/v1/authoring", (route) => route.fulfill({ status: 202, json: { jobId: "import-search", conversationId } }));
  await page.route("**/api/v1/jobs/import-search", (route) => route.fulfill({ json: { status: "completed", request: { mode: "search", conversationId }, result: { kind: "search", candidates: [{ id: "two-fer", kind: "licensed_import", title: "Two Fer", summary: "Treine strings.", url: "https://github.com/exercism/typescript/tree/main/exercises/practice/two-fer", sourceName: "Exercism", runtime: "typescript", licenseSpdx: "MIT", importable: true }] } } }));
  await page.route("**/api/v1/imports/exercism", async (route) => { importing = true; await importReady; await route.fulfill({ status: 202, json: { jobId: "import-accepted", conversationId } }); });
  await page.route("**/api/v1/jobs/import-accepted", (route) => route.fulfill({ json: { status: "running", request: { mode: "import", conversationId } } }));
  await page.goto("/studio");
  await page.getByRole("textbox", { name: promptLabel }).fill("Questões de strings");
  await page.getByRole("button", { name: "Encontrar questões", exact: true }).click();
  await page.getByRole("button", { name: "Importar e validar", exact: true }).click();
  await expect.poll(() => importing).toBe(true);
  await expect(page.getByRole("button", { name: "Começar outro assunto", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Nova conversa", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Criar", exact: true })).toBeDisabled();
  await page.getByRole("navigation", { name: "Áreas do Studio" }).getByRole("button", { name: "Minhas questões", exact: true }).click();
  await expect(page.getByRole("button", { name: "Nova questão", exact: true })).toBeDisabled();
  releaseImport();
  await expect(page.getByRole("status").filter({ hasText: "Importando e validando…" })).toBeVisible();
});

test("biblioteca vazia orienta a criar ou pesquisar e distingue favoritos de autoria", async ({ page }) => {
  const activity = await mockStudio(page);
  await page.goto("/studio?section=mine");
  await expect(page.getByRole("heading", { name: "Você ainda não criou ou importou uma questão.", exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Da criação à resolução" })).toContainText("Não é preciso publicar para praticar.");
  await expect(page.locator(".library-orientation")).toContainText("criou ou importou");
  await expect(page.getByRole("link", { name: "Praticar → Sua biblioteca e simulados" })).toHaveAttribute("href", "/explorar");
  await expect(page.locator(".library-empty")).toContainText("Um link externo, sem importação, não aparece nesta lista.");
  const create = page.locator(".library-empty").getByRole("link", { name: "Criar questão", exact: true });
  const search = page.locator(".library-empty").getByRole("link", { name: "Pesquisar questões", exact: true });
  await expect(create).toHaveAttribute("href", "/studio?mode=create");
  await expect(search).toHaveAttribute("href", "/studio?mode=search");
  await search.click();
  await expect(page.getByRole("button", { name: "Pesquisar", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Encontre o que quer praticar", exact: true })).toBeVisible();
  expect(activity.requests).toEqual([]);
});

test("Começar outro assunto remove só o contexto e preserva o pedido em edição", async ({ page }) => {
  const activity = await mockStudio(page, true);
  await page.goto("/studio");
  await page.getByRole("textbox", { name: promptLabel }).fill("Quero praticar ordenação de intervalos sem usar o contexto anterior.");
  const history = page.getByRole("region", { name: "Histórico do assistente" });
  await expect(history.locator("summary")).toContainText("Conversas anteriores (1)");
  await history.locator("summary").click();
  await history.getByRole("button", { name: /Treino anterior de intervalos/ }).click();
  await expect(page.locator(".studio-context")).toContainText("A pesquisa externa usa somente o pedido atual e a linguagem");
  await page.getByRole("button", { name: "Começar outro assunto", exact: true }).click();
  await expect(page.locator(".studio-context")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: promptLabel })).toHaveValue("Quero praticar ordenação de intervalos sem usar o contexto anterior.");
  await expect(history.getByRole("button", { name: /Treino anterior de intervalos/ })).toHaveAttribute("aria-pressed", "false");
  expect(activity.requests).toEqual([]);
  expect(activity.conversationWrites).toEqual([]);
  await page.getByRole("button", { name: "Encontrar questões", exact: true }).click();
  await expect.poll(() => activity.requests.length).toBe(1);
  expect(activity.requests[0]).toMatchObject({ mode: "search", runtime: "typescript", prompt: "Quero praticar ordenação de intervalos sem usar o contexto anterior." });
  expect(activity.requests[0]).not.toHaveProperty("conversationId");
});

test("pedido antigo não encontrado pode ser dispensado sem reenviar ou apagar dados", async ({ page }) => {
  const activity = await mockStudio(page);
  const storageKey = "silogium:studio:job:local-demo";
  const jobId = "orientation-missing-job";
  await page.addInitScript(({ storageKey, jobId }) => localStorage.setItem(storageKey, JSON.stringify({ id: jobId, mode: "search", startedAt: Date.now() })), { storageKey, jobId });
  let consultations = 0;
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/") && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) mutations.push(request.method());
  });
  await page.route(`**/api/v1/jobs/${jobId}`, (route) => {
    consultations += 1;
    return route.fulfill({ status: 404, json: { error: "Pedido não encontrado" } });
  });
  await page.goto("/studio");
  await expect(page.locator(".authoring-progress")).toContainText("Não encontramos este pedido na sua sessão.");
  await expect(page.locator(".authoring-progress")).toContainText("Dispensar apenas fecha este aviso; não cancela nem reenvia o pedido.");
  await expect(page.getByRole("button", { name: "Conferir minhas questões", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: promptLabel }).fill("Um novo pedido ainda não enviado.");
  await page.getByRole("button", { name: "Dispensar acompanhamento", exact: true }).click();
  await expect(page.locator(".authoring-progress")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: promptLabel })).toHaveValue("Um novo pedido ainda não enviado.");
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();
  expect(consultations).toBe(1);
  expect(activity.requests).toEqual([]);
  expect(activity.conversationWrites).toEqual([]);
  expect(mutations).toEqual([]);
});

test("orientação, formulário e biblioteca vazia cabem em 320 pixels", async ({ page }) => {
  const activity = await mockStudio(page);
  await page.setViewportSize({ width: 320, height: 740 });
  const noHorizontalOverflow = async () => {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  };
  await page.goto("/studio");
  await page.locator("details.studio-guide summary").click();
  await expect(page.locator(".studio-guide-content")).toBeVisible();
  await noHorizontalOverflow();
  await page.getByRole("button", { name: "Criar", exact: true }).click();
  await page.getByRole("textbox", { name: promptLabel }).fill("Quero uma questão progressiva de agendamento com empates, cancelamentos e horários de início e fim.");
  await page.getByLabel("Formato", { exact: true }).selectOption("progressive");
  await page.getByLabel("Visibilidade", { exact: true }).selectOption("public");
  await expect(page.getByRole("checkbox", { name: /Aceito publicar/ })).toBeVisible();
  await noHorizontalOverflow();
  await page.getByRole("navigation", { name: "Áreas do Studio" }).getByRole("button", { name: "Minhas questões", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Você ainda não criou ou importou uma questão.", exact: true })).toBeVisible();
  await noHorizontalOverflow();
  expect(activity.requests).toEqual([]);
});
