import { expect, test, type APIRequestContext } from "@playwright/test";

async function finished(request: APIRequestContext, id: string) {
  let job: Record<string, any> = {};
  await expect.poll(async () => {
    const response = await request.get(`/api/v1/jobs/${id}`);
    expect(response.ok()).toBeTruthy();
    job = await response.json();
    return job.status;
  }, { timeout: 20_000 }).not.toBe("running");
  return job;
}

test("API integra metadados, pausa e confirmação sem expor o bundle", async ({ request }, testInfo) => {
  // Playwright runs a separate server using LocalAiAdapter, never the user's Codex provider.
  const payload = {
    mode: "create", prompt: `reservas e cancelamentos em coworking para ${testInfo.project.name}`,
    runtime: "typescript", format: "progressive", difficulty: "easy", visibility: "private"
  };
  const response = await request.post("/api/v1/authoring", { data: payload });
  expect(response.status()).toBe(202);
  const { jobId } = await response.json();
  const initial = await finished(request, jobId);
  expect(initial).toMatchObject({ status: "needs_confirmation", request: payload, result: { kind: "recommendations" } });
  const recommendation = initial.result.candidates.find((item: { url: string }) => item.url === "/problemas/reservas-de-coworking");
  expect(recommendation.metadata).toMatchObject({ schemaVersion: 1, topics: expect.arrayContaining(["booking"]), inferred: true });
  expect(JSON.stringify(initial.result)).not.toMatch(/hiddenCases|referenceSolutions|starterCode/);
  expect((await finished(request, jobId)).status).toBe("needs_confirmation");
  const confirmations = await Promise.all([
    request.post(`/api/v1/jobs/${jobId}/confirm`, { data: { ...payload, prompt: "não usar este corpo", visibility: "public" } }),
    request.post(`/api/v1/jobs/${jobId}/confirm`)
  ]);
  for (const confirmation of confirmations) {
    expect(confirmation.status()).toBe(202);
    expect(await confirmation.json()).toEqual({ jobId });
  }
  const created = await finished(request, jobId);
  expect(created).toMatchObject({ status: "completed", request: payload, result: { kind: "create", package: { problem: { visibility: "private", status: "validated", metadata: { schemaVersion: 1, inferred: true } } } } });
  expect(created.result.package.problem.summary).toContain(payload.prompt);
  expect(created.result.package).not.toHaveProperty("bundle");
  expect(created.result.package).not.toHaveProperty("hiddenCases");
  expect(JSON.stringify(created.result.package.problem)).not.toMatch(/hiddenCases|referenceSolutions/);
  // Coverage exposes only counts, never hidden fixture inputs/answers or reference code.
  expect(typeof created.result.package.validation.coverage.hiddenCases).toBe("number");
  expect(JSON.stringify(created.result)).not.toMatch(/referenceSolutions|"constructorArgs"|"expected"/);
  expect((await request.post(`/api/v1/jobs/${jobId}/confirm`)).status()).toBe(202);
});
