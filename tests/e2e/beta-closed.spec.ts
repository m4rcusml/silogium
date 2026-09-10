import { expect, test, type Page } from "@playwright/test";

const reset = "2026-09-12T03:00:00.000Z";
const approved = { state: "approved", isAdmin: false, dailyLimit: 2, remaining: 2, createdToday: 0, reservedToday: 0, resetsAt: reset };
const enabled = { available: true };
const allFeatures = { search: enabled, create: enabled, refine: enabled, import: enabled };

async function fixtures(page: Page, status: unknown) {
  await page.route("**/api/v1/**", route => route.fulfill({ status: 503, json: { error: "Rota fora deste cenário de interface." } }));
  await page.route("**/api/v1/studio/status", route => route.fulfill({ json: status }));
  await page.route("**/api/v1/beta", route => route.fulfill({ json: (status as { beta: unknown }).beta }));
  await page.route("**/api/v1/conversations**", route => route.fulfill({ json: { items: [] } }));
  await page.route("**/api/v1/problems/mine", route => route.fulfill({ json: { problems: [] } }));
}

test("participante pendente entende a espera e consegue consultar suas questões", async ({ page }) => {
  const paused = { available: false, reason: "Seu acesso ao beta aguarda aprovação." };
  await fixtures(page, { beta: { ...approved, state: "pending" }, features: { search: paused, create: paused, refine: paused, import: paused } });
  await page.goto("/studio?mode=create");
  await expect(page.getByRole("region", { name: "Acesso e cota do beta" })).toContainText("Você está na lista de espera");
  await page.getByRole("textbox", { name: "Descreva tema, dificuldade ou estilo" }).fill("Questão sobre intervalos e eventos");
  await expect(page.getByRole("button", { name: "Criar e validar", exact: true })).toBeDisabled();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `.sessions/deploy-20260910/beta-studio-${test.info().project.name}.png`, fullPage: true, style: ".site-header { position: static !important; }" });
  await page.getByRole("button", { name: "Minhas questões", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Minhas questões", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explorar catálogo", exact: true })).toBeVisible();
});

test("cota de criação esgotada mostra renovação em Brasília sem bloquear pesquisa", async ({ page }) => {
  await fixtures(page, { beta: { ...approved, remaining: 0, createdToday: 1, reservedToday: 1 }, features: allFeatures });
  await page.goto("/studio?mode=create");
  await expect(page.getByRole("region", { name: "Acesso e cota do beta" })).toContainText("0 de 2 criações disponíveis hoje");
  await expect(page.getByRole("region", { name: "Acesso e cota do beta" })).toContainText("Brasília");
  await expect(page.getByRole("region", { name: "Acesso e cota do beta" })).toContainText("1 em andamento");
  await page.getByRole("textbox", { name: "Descreva tema, dificuldade ou estilo" }).fill("Questão sobre intervalos e eventos");
  await expect(page.getByRole("button", { name: "Criar e validar", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Pesquisar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Encontrar questões", exact: true })).toBeEnabled();
});

test("limite compartilhado não é confundido com cota pessoal e há caminho ao catálogo", async ({ page }) => {
  const capacity = { available: false, reason: "Capacidade do Groq temporariamente esgotada." };
  await fixtures(page, { beta: approved, features: { search: { available: false, reason: "A pesquisa assistida está pausada. Continue buscando no catálogo em Explorar." }, create: capacity, refine: capacity, import: capacity } });
  await page.goto("/studio?mode=create");
  await expect(page.getByRole("region", { name: "Acesso e cota do beta" })).toContainText("2 de 2 criações disponíveis");
  await expect(page.locator(".studio-feature-notice")).toContainText("Capacidade do Groq temporariamente esgotada");
  await page.getByRole("textbox", { name: "Descreva tema, dificuldade ou estilo" }).fill("Questão sobre mapas e prioridades");
  await expect(page.getByRole("button", { name: "Criar e validar", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Pesquisar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Encontrar questões", exact: true })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Continuar no catálogo", exact: true })).toHaveAttribute("href", "/explorar");
});

test("pedido pausado pode consultar retomada e cancelar sem criar outro job", async ({ page }) => {
  await fixtures(page, { beta: approved, features: allFeatures });
  let creates = 0; let resumes = 0; let cancels = 0; let cancelled = false;
  await page.route("**/api/v1/authoring", route => { creates++; return route.fulfill({ status: 202, json: { jobId: "beta-test-job" } }); });
  await page.route("**/api/v1/jobs/beta-test-job", route => route.fulfill({ json: cancelled ? { status: "failed", error: "Pedido cancelado pelo usuário.", progress: { phase: "waiting", reason: "cancelled", updatedAt: new Date().toISOString() } } : { status: "running", progress: { phase: "waiting", reason: "capacity", updatedAt: new Date().toISOString() } } }));
  await page.route("**/api/v1/jobs/beta-test-job/resume", route => { resumes++; return route.fulfill({ json: { jobId: "beta-test-job", action: "resume" } }); });
  await page.route("**/api/v1/jobs/beta-test-job/cancel", route => { cancels++; cancelled = true; return route.fulfill({ json: { jobId: "beta-test-job", action: "cancel" } }); });
  await page.goto("/studio?mode=create");
  await page.getByRole("textbox", { name: "Descreva tema, dificuldade ou estilo" }).fill("Uma questão curta sobre contagem de frequências");
  await page.getByRole("button", { name: "Criar e validar", exact: true }).click();
  await expect(page.locator(".authoring-progress")).toContainText("Aguardando capacidade para continuar");
  await expect(page.locator(".authoring-progress")).toContainText("Não é necessário reenviar");
  await page.getByRole("button", { name: "Verificar retomada" }).click();
  await expect.poll(() => resumes).toBe(1);
  await page.getByRole("button", { name: "Cancelar pedido", exact: true }).click();
  expect(cancels).toBe(0);
  await page.getByRole("button", { name: "Confirmar cancelamento", exact: true }).click();
  await expect(page.locator(".authoring-results")).toContainText("Pedido cancelado");
  expect(creates).toBe(1); expect(cancels).toBe(1);
});

test("espera por cota usa consultas espaçadas e para ao ocultar a página", async ({ page }) => {
  await page.clock.install();
  await fixtures(page, { beta: approved, features: allFeatures });
  let polls = 0;
  await page.route("**/api/v1/authoring", route => route.fulfill({ status: 202, json: { jobId: "beta-wait-job" } }));
  await page.route("**/api/v1/jobs/beta-wait-job", route => {
    polls++;
    return route.fulfill({ json: { status: "running", progress: { phase: "waiting", reason: "quota", retryAt: reset, updatedAt: new Date().toISOString() } } });
  });
  await page.goto("/studio?mode=create");
  await page.getByRole("textbox", { name: "Descreva tema, dificuldade ou estilo" }).fill("Uma questão curta sobre contagem de frequências");
  await page.getByRole("button", { name: "Criar e validar", exact: true }).click();
  await expect(page.locator(".authoring-progress")).toContainText("Aguardando renovação da cota de criação");
  await expect(page.locator(".authoring-progress")).toContainText("sujeita à capacidade disponível");
  const initialPolls = polls;
  await page.clock.fastForward(10_000);
  expect(polls).toBe(initialPolls);
  await page.clock.fastForward(21_000);
  await expect.poll(() => polls).toBe(initialPolls + 1);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(13 * 60_000);
  expect(polls).toBe(initialPolls + 1);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => polls).toBe(initialPolls + 2);
  await expect(page.locator(".authoring-progress")).toContainText("Aguardando renovação da cota de criação");
  await expect(page.getByText("O pedido está demorando mais que o esperado.", { exact: false })).toHaveCount(0);
});

test("falha ao consultar capacidade não impede ler novamente um pedido confirmado", async ({ page }) => {
  await fixtures(page, { beta: approved, features: allFeatures });
  let unavailable = false;
  const snapshot = { mode: "create", prompt: "Questão sobre contagem de eventos", runtime: "typescript", format: "classic", difficulty: "medium", visibility: "private" };
  await page.route("**/api/v1/studio/status", route => route.fulfill(unavailable ? { status: 503, json: { error: "Consulta de capacidade indisponível." } } : { json: { beta: approved, features: allFeatures } }));
  await page.route("**/api/v1/authoring", route => route.fulfill({ status: 202, json: { jobId: "beta-confirm-job" } }));
  await page.route("**/api/v1/jobs/beta-confirm-job", route => route.fulfill({ json: { status: "needs_confirmation", request: snapshot, result: { kind: "recommendations", candidates: [] } } }));
  await page.route("**/api/v1/jobs/beta-confirm-job/confirm", route => route.fulfill({ status: 503, json: { error: "Confirmação indisponível temporariamente." } }));
  await page.goto("/studio?mode=create");
  await page.getByRole("textbox", { name: "Descreva tema, dificuldade ou estilo" }).fill(snapshot.prompt);
  await page.getByRole("button", { name: "Criar e validar", exact: true }).click();
  await page.getByRole("button", { name: "Criar nova mesmo assim", exact: true }).click();
  await expect(page.locator(".similar-problems").getByRole("alert")).toContainText("Confirmação indisponível");
  unavailable = true;
  await page.getByRole("button", { name: "Atualizar acesso e saldo", exact: true }).click();
  await expect(page.getByRole("region", { name: "Acesso e cota do beta" })).toContainText("Consulta de capacidade indisponível");
  await expect(page.getByRole("button", { name: "Consultar este pedido", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Criar nova mesmo assim", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Ajustar pedido", exact: true })).toBeEnabled();
  unavailable = false;
  await page.getByRole("button", { name: "Consultar este pedido", exact: true }).click();
  await expect(page.getByRole("button", { name: "Criar nova mesmo assim", exact: true })).toBeEnabled();
});

test("admin aprova, revoga e pré-aprova GitHub na mesma área editorial", async ({ page }) => {
  await fixtures(page, { beta: { ...approved, isAdmin: true }, features: allFeatures });
  let person = { userId: "beta-person", handle: "nome-editavel", githubId: "12345", githubHandle: "testadora", state: "pending", role: "user", requestedAt: "2026-09-10T12:00:00Z", updatedAt: "2026-09-10T12:00:00Z" };
  let invitations: { githubId: string; githubHandle: string; createdAt: string }[] = [];
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/v1/admin/beta", route => {
    if (route.request().method() === "PATCH") {
      const payload = route.request().postDataJSON(); writes.push(payload);
      person = { ...person, state: payload.action === "approve" ? "approved" : payload.action === "revoke" ? "revoked" : person.state };
      if (payload.action === "invite") invitations = [{ githubId: "67890", githubHandle: "convidada", createdAt: "2026-09-10T12:00:00Z" }];
      if (payload.action === "revoke_invite") invitations = [];
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { participants: [person], invitations } });
  });
  await page.route("**/api/v1/admin/capacity", route => route.fulfill({ json: { groq: enabled, modal: enabled } }));
  await page.route("**/api/v1/reviews", route => route.fulfill({ json: { reviews: [] } }));
  await page.route("**/api/v1/community/review", route => route.fulfill({ json: { posts: [] } }));
  await page.goto("/admin/revisao");
  await expect(page.getByRole("heading", { name: "Quem pode participar" })).toBeVisible();
  await page.getByRole("button", { name: "Aprovar @testadora", exact: true }).click();
  expect(writes).toHaveLength(0);
  await page.getByRole("button", { name: "Confirmar decisão" }).click();
  await page.getByLabel("Mostrar participantes").selectOption("approved");
  await page.getByRole("button", { name: "Revogar @testadora", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar decisão" }).click();
  await expect(page.getByRole("region", { name: "Quem pode participar" })).toContainText("Decisão de acesso salva");
  await page.getByLabel("Pré-aprovar uma conta do GitHub").fill("@convidada");
  await page.getByRole("button", { name: "Pré-aprovar conta", exact: true }).click();
  await expect(page.getByRole("region", { name: "Quem pode participar" })).toContainText("nenhum e-mail foi enviado");
  await page.getByText("Contas pré-aprovadas (1)", { exact: true }).click();
  await page.getByRole("button", { name: "Remover pré-aprovação de @convidada", exact: true }).click();
  await expect(page.getByRole("region", { name: "Quem pode participar" })).toContainText("Pré-aprovação removida");
  expect(writes.map(input => input.action)).toEqual(["approve", "revoke", "invite", "revoke_invite"]);
  expect(writes[3]).toEqual({ action: "revoke_invite", githubId: "67890" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `.sessions/deploy-20260910/beta-admin-${test.info().project.name}.png`, fullPage: true, style: ".site-header { position: static !important; }" });
});

test("admin remove pausa sem prometer crédito nem habilitar serviço sem saldo", async ({ page }) => {
  await fixtures(page, { beta: { ...approved, isAdmin: true }, features: allFeatures });
  const writes: unknown[] = [];
  const unavailable = { available: false, reason: "Crédito gratuito ainda não confirmado; proteção de custo ativa." };
  await page.route("**/api/v1/admin/capacity", route => {
    if (route.request().method() === "PATCH") writes.push(route.request().postDataJSON());
    return route.fulfill({ json: { groq: enabled, modal: unavailable } });
  });
  await page.route("**/api/v1/admin/beta", route => route.fulfill({ json: { participants: [], invitations: [] } }));
  await page.route("**/api/v1/reviews", route => route.fulfill({ json: { reviews: [] } }));
  await page.route("**/api/v1/community/review", route => route.fulfill({ json: { posts: [] } }));
  await page.goto("/admin/revisao");
  await page.getByRole("button", { name: "Remover pausa de execuções", exact: true }).click();
  await expect(page.getByRole("region", { name: "Disponibilidade dos serviços" })).toContainText("proteção de custo ativa");
  await expect(page.getByRole("region", { name: "Disponibilidade dos serviços" })).toContainText("Cotas, créditos e verificações de segurança continuam obrigatórios");
  expect(writes).toEqual([{ service: "modal", paused: false }]);
});

test("perfil orienta participante pendente e não depende de abrir o Studio primeiro", async ({ page }) => {
  await fixtures(page, { beta: { ...approved, state: "pending" }, features: allFeatures });
  await page.goto("/perfil");
  const notice = page.getByRole("region", { name: "Seu acesso ao beta" });
  await expect(notice).toContainText("Você está na lista de espera do beta");
  await expect(notice.getByRole("link", { name: "Consultar no Studio" })).toHaveAttribute("href", "/studio");
});
