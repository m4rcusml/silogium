import { ContentRequestSchema, RuntimeSchema, searchCatalog, type Actor, type ContentRequest, type Runtime } from "@silogium/core";
import type { AiAuthoringAdapter, AuthoringJob, AuthoringRepository, GeneratedPackage, LicensedSourceAdapter, ProblemAuthoring, ProblemValidator, SearchCandidate } from "./types.js";

export class ProblemAuthoringModule implements ProblemAuthoring {
  constructor(
    private readonly repository: AuthoringRepository,
    private readonly ai: AiAuthoringAdapter,
    private readonly licensedSources: LicensedSourceAdapter[],
    private readonly validator: ProblemValidator
  ) {}

  async request(rawInput: ContentRequest, actor: Actor): Promise<{ jobId: string }> {
    const input = ContentRequestSchema.parse(rawInput);
    const job: AuthoringJob = { id: crypto.randomUUID(), actorId: actor.id, status: "running", request: input, createdAt: new Date().toISOString() };
    await this.repository.saveJob(job);
    try {
      if (input.mode === "search") {
        const catalog = searchCatalog(await this.repository.listCatalog(), { query: input.prompt, runtime: input.runtime });
        const local: SearchCandidate[] = catalog.slice(0, 3).map((problem) => ({
          id: problem.id, kind: "catalog", title: problem.title, summary: problem.summary,
          url: `/problemas/${problem.slug}`, sourceName: "Silogium", runtime: input.runtime, importable: true
        }));
        const licensed = (await Promise.all(this.licensedSources.map((source) => source.search(input.prompt, input.runtime)))).flat();
        const external = await this.ai.searchWeb(input.prompt, input.runtime, actor);
        job.result = { kind: "search", candidates: [...local, ...licensed, ...external].slice(0, 7) };
      } else {
        const generated = await this.ai.create(input, actor);
        const validation = await this.validator.validate(generated.problem, generated.bundle);
        generated.problem.status = validation.valid ? (input.visibility === "public" ? "pending_review" : "validated") : "rejected";
        const value = { ...generated, validation };
        await this.repository.savePackage(value);
        job.result = { kind: "create", package: value };
      }
      job.status = "completed";
      job.completedAt = new Date().toISOString();
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : "Falha desconhecida.";
      job.completedAt = new Date().toISOString();
    }
    await this.repository.saveJob(job);
    return { jobId: job.id };
  }

  async getJob(jobId: string, actor: Actor) {
    const job = await this.repository.getJob(jobId);
    return job && (job.actorId === actor.id || actor.role === "admin") ? job : null;
  }
  async requestPublication(problemId: string, actor: Actor) { return this.repository.requestPublication(problemId, actor); }

  async revise(value: GeneratedPackage, actor: Actor) {
    const validation = await this.validator.validate(value.problem, value.bundle);
    if (!validation.valid) throw new Error("A nova versão não passou pela validação automática.");
    return this.repository.saveRevision({ ...value, problem: { ...value.problem, status: "validated" }, validation }, actor);
  }

  async importLicensed(sourceName: string, slug: string, rawRuntime: Runtime, actor: Actor) {
    const runtime = RuntimeSchema.parse(rawRuntime);
    const source = this.licensedSources.find((candidate) => candidate.load && sourceName.toLowerCase() === "exercism");
    if (!source?.load) throw new Error("Fonte licenciada não suportada.");
    const loaded = await source.load(slug, runtime);
    const generated = await this.ai.importLicensed(loaded, actor);
    const validation = await this.validator.validate(generated.problem, generated.bundle);
    generated.problem.status = validation.valid ? "validated" : "rejected";
    const value = { ...generated, validation };
    await this.repository.savePackage(value);
    return value;
  }
}
