import { expect, it, vi } from "vitest";
import { attachExecutionProblemMetadata } from "../../../apps/web/lib/execution-metadata.js";

it("mantém todas as submissões quando metadados ou bundle de uma questão estão indisponíveis", async () => {
  const executions = ["available", "missing", "broken", "available"].map((problemId, index) => ({ id: String(index), request: { problemId, problemVersion: 1 } }));
  const load = vi.fn(async (id: string) => {
    if (id === "broken") throw new Error("Bundle do judge ausente.");
    return id === "missing" ? null : { id, title: "Versão atual", slug: "versao-atual", version: 2, privateData: "não retornar" };
  });
  const history = await attachExecutionProblemMetadata(executions, load);
  expect(history).toHaveLength(4);
  expect(history[0]).toEqual({ ...executions[0], problem: { id: "available", title: "Versão atual", slug: "versao-atual", version: 2 } });
  expect(history[1]).toEqual(executions[1]);
  expect(history[2]).toEqual(executions[2]);
  expect(load).toHaveBeenCalledTimes(3);
  expect(JSON.stringify(history)).not.toContain("privateData");
});
