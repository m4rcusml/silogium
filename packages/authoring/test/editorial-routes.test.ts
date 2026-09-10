import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: { id: "owner", handle: "owner", role: "user" as "user" | "admin" },
  open: vi.fn(), saveDraft: vi.fn(), validateDraft: vi.fn(), submitPublication: vi.fn(), moderate: vi.fn(),
  listPending: vi.fn(), getPackageVersion: vi.fn()
}));
vi.mock("@/lib/actor", () => ({ getActor: async () => mocks.actor }));
vi.mock("@/lib/authoring", () => ({ getAuthoringRepository: () => mocks }));
vi.mock("../../../apps/web/app/api/v1/problems/[slug]/editorial/service.js", () => ({
  getEditorial: () => mocks,
  readEditorialBody: (request: Request) => request.json(),
  editorialError: (error: Error) => Response.json({ error: error.message }, { status: 400 })
}));
// The web project typechecks these route modules with its own @/ alias configuration.
const editorRoute = "../../../apps/web/app/api/v1/problems/[slug]/editorial/route.js";
const reviewListRoute = "../../../apps/web/app/api/v1/reviews/route.js";
const reviewRoute = "../../../apps/web/app/api/v1/reviews/[id]/route.js";
const { GET, PATCH, POST } = await import(editorRoute);
const { GET: listReviews } = await import(reviewListRoute);
const { GET: inspectReview, PATCH: decideReview } = await import(reviewRoute);

const context = { params: Promise.resolve({ slug: "editorial" }) };
const reviewContext = { params: Promise.resolve({ id: "review-2" }) };
const json = (body: unknown) => new Request("http://silogium.test/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.clearAllMocks(); mocks.actor.role = "user";
  mocks.open.mockResolvedValue({ problem: { id: "p" }, visibleCases: [], revision: 0 });
  mocks.saveDraft.mockResolvedValue({ revision: 1 });
  mocks.validateDraft.mockResolvedValue({ revision: 2 });
  mocks.submitPublication.mockResolvedValue({ revision: 2 });
  mocks.moderate.mockResolvedValue({ problem: { id: "p" }, validation: { valid: true }, bundle: { referenceSolutions: "private" } });
});

describe("contratos HTTP editoriais", () => {
  it("GET exige opt-in literal e o vincula ao ator autenticado", async () => {
    await GET(new Request("http://silogium.test/editorial?revealSpoilers=false"), context);
    expect(mocks.open).toHaveBeenLastCalledWith("editorial", mocks.actor, { revealSpoilers: false });
    const response = await GET(new Request("http://silogium.test/editorial?revealSpoilers=true"), context);
    expect(mocks.open).toHaveBeenLastCalledWith("editorial", mocks.actor, { revealSpoilers: true });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("PATCH não aceita identidade do ator enviada no corpo como autorização", async () => {
    const body = { expectedRevision: 2, content: {}, visibleCases: [], actor: { id: "admin", role: "admin" } };
    await PATCH(json(body), context);
    expect(mocks.saveDraft).toHaveBeenCalledWith("editorial", mocks.actor, body);
  });

  it("publicação só aceita consentimento booleano verdadeiro e validação usa revisão explícita", async () => {
    await POST(json({ action: "publication", expectedRevision: 8, licensesAccepted: "true" }), context);
    expect(mocks.submitPublication).toHaveBeenLastCalledWith("editorial", mocks.actor, 8, false);
    await POST(json({ action: "publication", expectedRevision: 8, licensesAccepted: true }), context);
    expect(mocks.submitPublication).toHaveBeenLastCalledWith("editorial", mocks.actor, 8, true);
    await POST(json({ action: "validate", expectedRevision: 8 }), context);
    expect(mocks.validateDraft).toHaveBeenCalledWith("editorial", mocks.actor, 8);
    expect((await POST(json({ action: "publish-directly" }), context)).status).toBe(400);
  });

  it("listagem não serializa bundles privados e inspeção exige administrador", async () => {
    mocks.listPending.mockResolvedValue([{ problem: { id: "p", version: 2 }, validation: { valid: true }, editorialReview: { id: "review-2" }, bundle: { referenceSolutions: "private" } }]);
    const response = await listReviews(new Request("http://silogium.test/reviews"));
    expect(JSON.stringify(await response.json())).not.toContain("referenceSolutions");
    expect((await inspectReview(new Request("http://silogium.test/reviews/review-2"), reviewContext)).status).toBe(400);
    mocks.actor.role = "admin";
    mocks.getPackageVersion.mockResolvedValue({ problem: { id: "p", version: 1 } });
    const detail = await (await inspectReview(new Request("http://silogium.test/reviews/review-2"), reviewContext)).json();
    expect(detail.bundle.referenceSolutions).toBe("private");
    expect(detail.previous.version).toBe(1);
  });

  it("decisão identifica reviewId fixo e não devolve o bundle na resposta", async () => {
    mocks.actor.role = "admin";
    const response = await decideReview(json({ decision: "reject", reason: "Explique os empates." }), reviewContext);
    expect(mocks.moderate).toHaveBeenCalledWith("review-2", "reject", mocks.actor, "Explique os empates.");
    expect(JSON.stringify(await response.json())).not.toContain("referenceSolutions");
  });
});
