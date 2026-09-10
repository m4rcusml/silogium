import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const slug = "rede-de-armarios";
async function problem(request: APIRequestContext) { return (await (await request.get(`/api/v1/problems/${slug}`)).json()).problem; }
async function mutate(request: APIRequestContext, action: unknown) {
  const { state } = await (await request.get("/api/v1/personal")).json();
  const response = await request.patch("/api/v1/personal", { data: { expectedRevision: state.revision, action } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).state;
}
async function mobileTab(page: Page, mobile: boolean, name: "Questão" | "Código") {
  if (mobile) await page.getByRole("navigation", { name: "Área da questão" }).getByRole("button", { name, exact: true }).click();
}

test("biblioteca guarda favoritos e trilhas, e simulado fixa a versão", async ({ page, request }, info) => {
  const selected = await problem(request);
  const name = `Trilha QA ${info.project.name}`;
  await mutate(request, { kind: "favorite", problemId: selected.id, saved: true });
  await page.goto("/explorar");
  await page.getByText("Sua biblioteca e simulados", { exact: true }).click();
  const library = page.getByRole("region", { name: "Biblioteca pessoal e sugestões" });
  await expect(library.getByRole("button", { name: `Remover favorito ${selected.title}` })).toBeVisible();
  await library.getByLabel("Nome da seleção").fill(name);
  await library.getByLabel("Organização").selectOption("track");
  await library.getByRole("checkbox", { name: selected.title, exact: true }).check();
  await library.getByRole("button", { name: "Salvar seleção", exact: true }).click();
  await expect(library.getByText("Lista salva.", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByText("Sua biblioteca e simulados", { exact: true }).click();
  await library.locator("summary").filter({ hasText: name }).click();
  await library.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(library.getByLabel("Organização")).toHaveValue("track");
  await library.getByRole("button", { name: "Iniciar simulado", exact: true }).click();
  await expect(library.getByText("Simulado iniciado. Abra uma das questões abaixo.", { exact: true })).toBeVisible();
  await expect(library.getByRole("link", { name: `${selected.title} · v${selected.version}`, exact: true })).toHaveAttribute("href", `/problemas/${slug}?version=${selected.version}`);
  await expect(library.getByRole("button", { name: "Iniciar simulado", exact: true })).toBeDisabled();
  await library.getByRole("button", { name: "Encerrar simulado", exact: true }).click();
  await expect(library.getByRole("button", { name: "Encerrar simulado", exact: true })).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.accept());
  await library.getByRole("button", { name: "Remover lista", exact: true }).click();
  await expect(library.locator("summary").filter({ hasText: `${name} · Trilha` })).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("perfil só compartilha apresentação com consentimento revogável", async ({ page, request }, info) => {
  const name = `Pessoa QA ${info.project.name}`;
  await page.goto("/perfil");
  const form = page.getByRole("region", { name: "Seu perfil", exact: true });
  await expect(form.getByRole("button", { name: "Salvar perfil" })).toBeEnabled();
  await form.getByRole("textbox", { name: "Nome de exibição", exact: true }).fill(name);
  await form.getByRole("textbox", { name: "Apresentação", exact: true }).fill("Praticando estruturas de dados.");
  await form.getByRole("textbox", { name: "Site pessoal (HTTPS)", exact: true }).fill("https://example.org");
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "Salvar perfil", exact: true }).click();
  await expect(form.getByRole("link", { name: "Ver perfil compartilhado" })).toBeVisible();
  await page.goto("/p/demo");
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page.getByText("Praticando estruturas de dados.", { exact: true })).toBeVisible();
  await expect(page.getByText("Sua biblioteca e simulados", { exact: true })).toHaveCount(0);
  await page.goto("/perfil");
  await expect(form.getByRole("button", { name: "Salvar perfil" })).toBeEnabled();
  await form.getByRole("checkbox").uncheck();
  await form.getByRole("button", { name: "Salvar perfil", exact: true }).click();
  await expect(form.getByRole("link", { name: "Ver perfil compartilhado" })).toHaveCount(0);
  expect((await request.get("/p/demo")).status()).toBe(404);
});

test("contribuição passa pela revisão e dica exige revelação explícita", async ({ page, request }, info) => {
  const selected = await problem(request);
  const title = `Dica QA ${info.project.name}`;
  const text = `Spoiler controlado da revisão ${info.project.name}.`;
  await page.goto(`/problemas/${slug}`);
  await page.getByRole("button", { name: "Dicas e comunidade", exact: true }).click();
  await page.getByText("Contribuir com esta questão", { exact: true }).click();
  await page.getByLabel("Tipo de contribuição").selectOption("hint");
  await page.getByLabel("Título", { exact: true }).fill(title);
  await page.getByLabel("Texto em Markdown").fill(text);
  await page.getByRole("button", { name: "Enviar para revisão", exact: true }).click();
  await expect(page.getByText("Contribuição salva. Ela ficará pública depois da revisão administrativa.", { exact: true })).toBeVisible();
  const { posts } = await (await request.get(`/api/v1/community/${selected.id}?version=${selected.version}`)).json();
  const post = posts.find((post: { title: string }) => post.title === title);
  expect(post.status).toBe("pending");
  const approval = await request.patch("/api/v1/community/review", { data: { postId: post.id, decision: "approve", reason: "", expectedUpdatedAt: post.updatedAt } });
  expect(approval.ok(), await approval.text()).toBeTruthy();
  await page.reload();
  await page.getByRole("button", { name: "Dicas e comunidade", exact: true }).click();
  await expect(page.getByText(text, { exact: true })).not.toBeVisible();
  await page.locator("summary").filter({ hasText: title }).click();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  const card = page.locator(".community-post").filter({ hasText: title });
  page.once("dialog", (dialog) => dialog.accept());
  await card.getByRole("button", { name: "Remover contribuição", exact: true }).click();
  await expect(page.locator("summary").filter({ hasText: title })).toHaveCount(0);
});

test("revisão antiga não aprova nem sobrescreve uma contribuição alterada", async ({ request }, info) => {
  const selected = await problem(request);
  const endpoint = `/api/v1/community/${selected.id}`;
  const content = { kind: "discussion", title: `CAS QA ${info.project.name}`, body: "Texto A lido na primeira aba." };
  const created = await request.post(endpoint, { data: { version: selected.version, content } });
  expect(created.status()).toBe(201);
  const old = await created.json();
  const edited = await request.post(endpoint, { data: { version: selected.version, postId: old.id, expectedUpdatedAt: old.updatedAt, content: { ...content, body: "Texto B salvo na segunda aba." } } });
  expect(edited.status()).toBe(201);
  const current = await edited.json();
  expect((await request.patch("/api/v1/community/review", { data: { postId: old.id, decision: "approve", expectedUpdatedAt: old.updatedAt } })).status()).toBe(409);
  expect((await request.post(endpoint, { data: { version: selected.version, postId: old.id, content } })).status()).toBe(409);
  const { posts } = await (await request.get(`${endpoint}?version=${selected.version}`)).json();
  expect(posts.find((post: { id: string }) => post.id === old.id)).toMatchObject({ status: "pending", body: "Texto B salvo na segunda aba." });
  expect((await request.post(endpoint, { data: { version: selected.version, action: "remove", postId: old.id, expectedUpdatedAt: current.updatedAt } })).ok()).toBeTruthy();
});

test("sincronização exige confirmação e não executa ou submete código", async ({ page, request }, info) => {
  const selected = await problem(request);
  const identity = { problemId: selected.id, version: selected.version, runtime: "typescript" };
  const get = await request.get(`/api/v1/drafts?${new URLSearchParams({ ...identity, version: String(identity.version) })}`);
  const saved = (await get.json()).draft;
  const snapshot = { source: `// rascunho sincronizado ${info.project.name}`, preferences: { fontSize: 18, wordWrap: false, split: 40, resultHeight: 30, customTests: "[]" } };
  expect((await request.put("/api/v1/drafts", { data: { ...identity, expectedRevision: saved?.revision ?? 0, snapshot } })).ok()).toBeTruthy();
  expect((await request.put("/api/v1/drafts", { data: { ...identity, expectedRevision: saved?.revision ?? 0, snapshot } })).status()).toBe(409);
  const key = `silogium:draft:local-demo:${selected.id}:${selected.version}:typescript`;
  await page.addInitScript(({ key }) => localStorage.setItem(key, "// rascunho local não substituído"), { key });
  let executions = 0;
  page.on("request", (request) => { if (request.url().includes("/api/v1/executions") && request.method() === "POST") executions++; });
  await page.goto(`/problemas/${slug}`);
  await page.getByText("Sincronizar rascunho entre dispositivos", { exact: true }).click();
  await page.getByRole("button", { name: "Consultar rascunho salvo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Restaurar rascunho salvo", exact: true })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe("// rascunho local não substituído");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Restaurar rascunho salvo", exact: true }).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe("// rascunho local não substituído");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Restaurar rascunho salvo", exact: true }).click();
  await mobileTab(page, info.project.name === "mobile", "Código");
  await expect(page.getByLabel("Tamanho da fonte")).toHaveValue("18");
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), key)).toBe(snapshot.source);
  expect(executions).toBe(0);
});
