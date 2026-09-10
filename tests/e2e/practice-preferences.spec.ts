import { expect, test, type Page } from "@playwright/test";

const workspacePath = "/problemas/rede-de-armarios";

async function codeTab(page: Page, mobile: boolean) {
  if (mobile) await page.getByRole("navigation", { name: "Área da questão" }).getByRole("button", { name: "Código", exact: true }).click();
}

async function customTab(page: Page, mobile: boolean) {
  if (mobile) await page.getByRole("navigation", { name: "Área da questão" }).getByRole("button", { name: "Resultado", exact: true }).click();
  await page.getByRole("button", { name: "Testes próprios", exact: true }).click();
}

test("preferências e testes próprios persistem por linguagem sem apagar o rascunho", async ({ page, request }, testInfo) => {
  const mobile = testInfo.project.name === "mobile";
  const { problem } = await (await request.get("/api/v1/problems/rede-de-armarios")).json();
  const draftKey = `silogium:draft:local-demo:${problem.id}:${problem.version}:typescript`;
  await page.addInitScript(({ draftKey }) => {
    if (localStorage.getItem(draftKey) === null) localStorage.setItem(draftKey, "// meu rascunho preservado");
  }, { draftKey });
  await page.goto(workspacePath);
  await codeTab(page, mobile);
  await page.getByLabel("Tamanho da fonte").selectOption("18");
  await page.getByRole("button", { name: "Quebrar linhas", exact: true }).click();
  if (!mobile) {
    await page.getByRole("separator", { name: "Redimensionar enunciado e editor" }).focus();
    await page.keyboard.press("ArrowRight");
    await page.getByRole("separator", { name: "Redimensionar resultados", exact: true }).focus();
    await page.keyboard.press("ArrowUp");
  }
  await customTab(page, mobile);
  await page.getByLabel("Casos em JSON").fill('[{"rascunho incompleto":');
  await page.reload();
  await codeTab(page, mobile);
  await expect(page.getByLabel("Tamanho da fonte")).toHaveValue("18");
  await expect(page.getByRole("button", { name: "Quebrar linhas", exact: true })).toHaveAttribute("aria-pressed", "false");
  if (!mobile) {
    await expect(page.getByRole("separator", { name: "Redimensionar enunciado e editor" })).toHaveAttribute("aria-valuenow", "44");
    await expect(page.getByRole("separator", { name: "Redimensionar resultados", exact: true })).toHaveAttribute("aria-valuenow", "39");
  }
  await customTab(page, mobile);
  await expect(page.getByLabel("Casos em JSON")).toHaveValue('[{"rascunho incompleto":');
  await page.getByRole("combobox", { name: "Linguagem", exact: true }).selectOption("python");
  await codeTab(page, mobile);
  await expect(page.getByLabel("Tamanho da fonte")).toHaveValue("14");
  await customTab(page, mobile);
  await page.getByLabel("Casos em JSON").fill("");
  await page.getByRole("combobox", { name: "Linguagem", exact: true }).selectOption("typescript");
  await expect(page.getByLabel("Casos em JSON")).toHaveValue('[{"rascunho incompleto":');
  await page.getByRole("combobox", { name: "Linguagem", exact: true }).selectOption("python");
  await expect(page.getByLabel("Casos em JSON")).toHaveValue("");
  expect(await page.evaluate((key) => localStorage.getItem(key), draftKey)).toBe("// meu rascunho preservado");
});

test("preferências corrompidas são isoladas e não apagam dados de outra conta ou versão", async ({ page, request }, testInfo) => {
  const { problem } = await (await request.get("/api/v1/problems/rede-de-armarios")).json();
  const keys = {
    current: `silogium:workspace:v1:local-demo:${problem.id}:${problem.version}:typescript`,
    otherActor: `silogium:workspace:v1:other-user:${problem.id}:${problem.version}:typescript`,
    otherVersion: `silogium:workspace:v1:local-demo:${problem.id}:${problem.version + 1}:typescript`
  };
  await page.addInitScript((keys) => {
    localStorage.setItem(keys.current, "{");
    localStorage.setItem(keys.otherActor, "private-other-user");
    localStorage.setItem(keys.otherVersion, "future-version");
  }, keys);
  await page.goto(workspacePath);
  await codeTab(page, testInfo.project.name === "mobile");
  await expect(page.getByLabel("Tamanho da fonte")).toHaveValue("14");
  await expect(page.getByText(/Algumas preferências salvas não puderam/)).toBeVisible();
  expect(await page.evaluate((keys) => Object.fromEntries(Object.entries(keys).map(([name, key]) => [name, localStorage.getItem(key)])), keys)).toEqual({ current: "{", otherActor: "private-other-user", otherVersion: "future-version" });
});

test("bloqueio do armazenamento mantém controles utilizáveis e avisa sobre testes não salvos", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("Storage blocked", "SecurityError"); } });
  });
  await page.goto(workspacePath);
  await codeTab(page, testInfo.project.name === "mobile");
  await page.getByLabel("Tamanho da fonte").selectOption("16");
  await expect(page.getByLabel("Tamanho da fonte")).toHaveValue("16");
  await expect(page.getByText(/Não foi possível salvar preferências e testes próprios/)).toBeVisible();
});

test("filtros têm URL compartilhável e retomam o cache da conta sem perder a densidade", async ({ page }) => {
  await page.goto("/explorar");
  await page.getByRole("button", { name: "Confortável", exact: true }).click();
  await page.getByLabel("Buscar questões", { exact: true }).fill("armários");
  await page.getByLabel("Filtrar linguagem").selectOption("python");
  await page.getByLabel("Filtrar formato").selectOption("progressive");
  await expect(page).toHaveURL(/q=arm%C3%A1rios/);
  await expect(page).toHaveURL(/runtime=python/);
  await page.reload();
  await expect(page.getByLabel("Buscar questões", { exact: true })).toHaveValue("armários");
  await expect(page.getByLabel("Filtrar linguagem")).toHaveValue("python");
  await page.goto("/perfil");
  await page.goto("/explorar");
  await expect(page.getByLabel("Buscar questões", { exact: true })).toHaveValue("armários");
  await expect(page.getByRole("button", { name: "Confortável", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/explorar?q=reservas&runtime=typescript");
  await expect(page.getByLabel("Buscar questões", { exact: true })).toHaveValue("reservas");
  await expect(page.getByLabel("Filtrar linguagem")).toHaveValue("typescript");
  await expect(page.getByLabel("Filtrar formato")).toHaveValue("");
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("Buscar questões", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Confortável", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("navegação back/forward acompanha filtros e parâmetros inválidos são ignorados", async ({ page }) => {
  await page.goto("/explorar?q=filas&runtime=rust&format=invalid");
  await expect(page.getByLabel("Buscar questões", { exact: true })).toHaveValue("filas");
  await expect(page.getByLabel("Filtrar linguagem")).toHaveValue("");
  await expect(page.getByLabel("Filtrar formato")).toHaveValue("");
  await page.evaluate(() => window.history.pushState(null, "", "/explorar?q=reservas&runtime=python"));
  await expect(page.getByLabel("Buscar questões", { exact: true })).toHaveValue("reservas");
  await page.goBack();
  await expect(page.getByLabel("Buscar questões", { exact: true })).toHaveValue("filas");
  await page.goForward();
  await expect(page.getByLabel("Filtrar linguagem")).toHaveValue("python");
  await page.setViewportSize({ width: 320, height: 568 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
