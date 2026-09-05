/**
 * Q3 — Fazenda de execução de jobs.
 *
 * Abra questions/q3_build_farm/LEVEL_1.md e implemente somente o nível atual.
 * Preserve todas as assinaturas públicas.
 */
export class BuildFarmService {
  addWorker(workerId: string, capacity: number): boolean {
    return false;
  }

  submitJob(timestamp: number, jobId: string, workerId: string, cost: number): boolean {
    return false;
  }

  completeJob(timestamp: number, jobId: string): boolean {
    return false;
  }

  getWorkerLoad(timestamp: number, workerId: string): number | null {
    return null;
  }

  transferJob(timestamp: number, jobId: string, targetWorkerId: string): boolean {
    return false;
  }

  topWorkers(timestamp: number, n: number): string[] {
    return [];
  }

  addDependency(timestamp: number, jobId: string, prerequisiteJobId: string): boolean {
    return false;
  }

  readyJobs(timestamp: number, workerId: string): string[] {
    return [];
  }

  drainWorker(timestamp: number, sourceWorkerId: string, targetWorkerIds: string[]): boolean {
    return false;
  }

  getJobHistory(timestamp: number, jobId: string): string[] {
    return [];
  }
}
