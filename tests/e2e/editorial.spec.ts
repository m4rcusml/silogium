import { expect, test, type Page } from "@playwright/test";
import type { EditorialView } from "@silogium/authoring";

const slug = "fila-editorial";
const endpoint = `/api/v1/problems/${slug}/editorial`;
const date = "2026-09-09T12:00:00Z";
function draft(): EditorialView {
  return {
    revision: 1, baseVersion: 1, phase: "draft", spoilersRevealed: false, reviews: [],
    problem: {
      schemaVersion: 1, id: "55000000-0000-4000-8000-000000000001", version: 2, slug,
      title: "Fila com prioridade", summary: "Organize chamados e preserve a ordem nos empates.", locale: "pt-BR",
      origin: "native", visibility: "private", status: "draft", format: "classic", executionModel: "stdio", difficulty: "medium", tags: ["filas"],
      stages: [{ number: 1, points: 100, statementMd: "# Fila\n\nLeia um valor e imprima sua prioridade." }],
      runtimes: [{ language: "typescript", version: "22.22.0", starterCode: "console.log(0);", entrypoint: { kind: "stdio" } }],
      examples: [], limits: { timeMs: 2000, memoryMiB: 256, outputBytes: 65536 },
      provenance: { kind: "native", createdBy: "local-demo", createdByHandle: "local", assistedByAi: true, statementLicense: "CC-BY-4.0", codeLicense: "MIT" }, createdAt: date, updatedAt: date
    },
    visibleCases: [{ id: "visible", kind: "stdio", stage: 1, name: "Exemplo", stdin: "1", expectedStdout: "1" }],
    validation: { valid: false, checks: [], warnings: ["Rascunho ainda não validado."] }
  };
}
const privateMaterials = {
  hiddenCases: [{ id: "hidden", kind: "stdio" as const, stage: 1, name: "Limite", stdin: "99", expectedStdout: "99" }],
  referenceSolutions: { typescript: "// GABARITO_PRIVADO\nconsole.log(99);" }
};

async function mockEditor(page: Page, options: { conflict?: boolean; loadError?: boolean; approved?: boolean } = {}) {
  let value = draft();
  if (options.approved) {
    value.phase = "validated"; value.validation.valid = true;
    value.reviews = [{ id: "review-2", problemId: value.problem.id, problemVersion: 2, requestedBy: "local-demo", status: "approved", createdAt: date }];
  }
  const reads: string[] = [];
  const saves: Record<string, unknown>[] = [];
  let failed = false;
  await page.route("**/api/v1/problems/mine", (route) => route.fulfill({ json: { problems: [value.problem] } }));
  await page.route(`**${endpoint}*`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET") {
      reads.push(url.search);
      if (options.loadError && !failed) { failed = true; await route.fulfill({ status: 503, json: { error: "Biblioteca temporariamente indisponível." } }); return; }
      if (url.searchParams.get("revealSpoilers") === "true") { value.revision++; await route.fulfill({ json: { ...value, spoilersRevealed: true, spoilers: privateMaterials } }); return; }
      await route.fulfill({ json: value }); return;
    }
    if (request.method() === "PATCH") {
      const input = request.postDataJSON(); saves.push(input);
      if (options.conflict) { await route.fulfill({ status: 409, json: { error: "O rascunho mudou em outra aba. Recarregue para não sobrescrever alterações." } }); return; }
      value = { ...value, revision: value.revision + 1, problem: { ...value.problem, ...input.content }, visibleCases: input.visibleCases };
      await route.fulfill({ json: value }); return;
    }
    await route.fulfill({ status: 400, json: { error: "Ação não prevista no teste." } });
  });
  await page.goto(`/studio?section=mine&edit=${slug}`);
  return { reads, saves };
}

test("editor exige opt-in para revelar materiais privados e não o mantém no reload", async ({ page }) => {
  const api = await mockEditor(page);
  const editor = page.getByRole("region", { name: "Editar questão", exact: true });
  await expect(editor.getByLabel("Título", { exact: true })).toHaveValue("Fila com prioridade");
  await expect(editor.getByLabel("Solução de referência · typescript")).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "Revelar material de autoria" })).toBeDisabled();
  expect(api.reads).toEqual([""]);
  await editor.getByRole("checkbox", { name: /Entendo o spoiler/ }).check();
  await editor.getByRole("button", { name: "Revelar material de autoria" }).click();
  await expect(editor.getByLabel("Solução de referência · typescript")).toHaveValue(/GABARITO_PRIVADO/);
  expect(api.reads).toEqual(["", "?revealSpoilers=true"]);
  await page.reload();
  await expect(editor.getByLabel("Título", { exact: true })).toHaveValue("Fila com prioridade");
  await expect(editor.getByLabel("Solução de referência · typescript")).toHaveCount(0);
  expect(api.reads.at(-1)).toBe("");
});

test("conflito editorial preserva o formulário e não reenvia ou revela materiais", async ({ page }) => {
  const api = await mockEditor(page, { conflict: true });
  const editor = page.getByRole("region", { name: "Editar questão", exact: true });
  await editor.getByLabel("Título", { exact: true }).fill("Minha alteração ainda não salva");
  await editor.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("mudou em outra aba");
  await expect(editor.getByLabel("Título", { exact: true })).toHaveValue("Minha alteração ainda não salva");
  expect(api.saves).toHaveLength(1);
  expect(api.saves[0]).toMatchObject({ expectedRevision: 1, content: { title: "Minha alteração ainda não salva" } });
  expect(api.saves[0]).not.toHaveProperty("spoilers");
  expect(api.reads).toEqual([""]);
});

test("edição cabe em 320px e versão aprovada não oferece republicação", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockEditor(page, { approved: true });
  const editor = page.getByRole("region", { name: "Editar questão", exact: true });
  await expect(editor.getByLabel("Título", { exact: true })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Enviar versão para revisão" })).toHaveCount(0);
  await expect(editor.getByText("Versão 2 · Aprovada", { exact: true })).toBeVisible();
  const dimensions = await editor.evaluate((element) => ({
    width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
    fits: Array.from(element.querySelectorAll("input,textarea,select,.button")).every((item) => { const rect = item.getBoundingClientRect(); return rect.left >= 0 && rect.right <= document.documentElement.clientWidth + 1; })
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1);
  expect(dimensions.fits).toBe(true);
});

test("revisão inspeciona versão fixa e exige justificativa de rejeição", async ({ page }) => {
  const value = draft(); value.problem.status = "pending_review"; value.validation = { valid: true, checks: [{ name: "referência", passed: true }] };
  const review = { id: "review-editorial", problemId: value.problem.id, problemVersion: 2, requestedBy: "local-demo", status: "pending", createdAt: date };
  const decisions: Record<string, unknown>[] = [];
  await page.route("**/api/v1/reviews", (route) => route.fulfill({ json: { reviews: decisions.length ? [] : [{ problem: value.problem, validation: value.validation, review }] } }));
  await page.route("**/api/v1/reviews/review-editorial", async (route) => {
    if (route.request().method() === "PATCH") { decisions.push(route.request().postDataJSON()); await route.fulfill({ json: { problem: value.problem, validation: value.validation } }); return; }
    await route.fulfill({ json: { problem: value.problem, validation: value.validation, review, previous: null, bundle: { schemaVersion: 1, problemId: value.problem.id, problemVersion: 2, visibleCases: value.visibleCases, ...privateMaterials } } });
  });
  await page.goto("/admin/revisao");
  await page.getByRole("button", { name: "Inspecionar versão 2", exact: true }).click();
  const inspection = page.getByRole("region", { name: "Inspeção editorial", exact: true });
  await expect(inspection.getByText("Testes ocultos (1)", { exact: true })).toBeVisible();
  await expect(inspection.getByRole("button", { name: "Rejeitar e orientar" })).toBeDisabled();
  await inspection.getByRole("checkbox", { name: /Revisei clareza/ }).check();
  await expect(inspection.getByRole("button", { name: "Rejeitar e orientar" })).toBeDisabled();
  await inspection.getByLabel("Orientação ao autor (obrigatória para rejeitar)").fill("Explique o limite permitido na entrada.");
  await inspection.getByRole("button", { name: "Rejeitar e orientar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "rejeitada com orientação" })).toBeVisible();
  expect(decisions).toEqual([{ decision: "reject", reason: "Explique o limite permitido na entrada." }]);
});
