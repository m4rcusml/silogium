import { expect, test } from "@playwright/test";

test("o catálogo contém apenas questões resolvíveis no Silogium", async ({ page }) => {
  await page.goto("/explorar");
  await expect(page.getByRole("heading", { name: "Encontre uma questão." })).toBeVisible();
  await expect(page.locator(".problem-card")).toHaveCount(3);
  await expect(page.getByText("Link externo")).toHaveCount(0);
});

test("uma questão pode ser aberta e executada", async ({ page }, testInfo) => {
  await page.goto("/problemas/rede-de-armarios");
  await expect(page.getByText("Rede de armários de encomendas").first()).toBeVisible();
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Código", exact: true }).click();
  }
  await page.getByRole("button", { name: "Executar" }).click();
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Resultado", exact: true }).click();
  }
  await expect(page.locator(".results-pane")).toContainText(/wrong_answer|accepted/, { timeout: 20_000 });
});

test("o layout móvel oferece Questão, Código e Resultado", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Cenário exclusivo do viewport móvel");
  await page.goto("/problemas/rede-de-armarios");
  await expect(page.getByRole("button", { name: "Questão", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Código", exact: true }).click();
  await expect(page.locator(".editor-pane")).toBeVisible();
  await page.getByRole("button", { name: "Resultado", exact: true }).click();
  await expect(page.locator(".results-pane")).toBeVisible();
});

test("a criação pública exige aceite explícito das licenças", async ({ page }) => {
  await page.goto("/assistente");
  await page.getByRole("button", { name: "Criar" }).click();
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
  const job = await request.get(`/api/v1/jobs/${jobId}`);
  expect(job.ok()).toBeTruthy();
  await expect(job.json()).resolves.toMatchObject({
    status: "completed",
    result: { kind: "create", package: { problem: { status: "pending_review" } } }
  });
});
