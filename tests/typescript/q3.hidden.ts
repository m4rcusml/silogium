import { BuildFarmService } from "../../solutions/typescript/question3.js";
import { equal, type TestCase } from "../../grader/typescript/harness.js";

export const hiddenCases: TestCase[] = [
  {
    level: 1,
    name: "aceita limite exato e rejeita conclusão repetida",
    run: () => {
      const service = new BuildFarmService();
      equal(service.addWorker("w", 5), true);
      equal(service.submitJob(1, "j", "w", 5), true);
      equal(service.getWorkerLoad(2, "w"), 5);
      equal(service.completeJob(3, "j"), true);
      equal(service.completeJob(4, "j"), false);
      equal(service.submitJob(5, "", "w", 1), false);
      equal(service.submitJob(6, "bad", "w", -1), false);
    }
  },
  {
    level: 1,
    name: "carga é compartilhada entre múltiplos jobs",
    run: () => {
      const service = new BuildFarmService();
      service.addWorker("w", 7);
      equal(service.submitJob(1, "a", "w", 3), true);
      equal(service.submitJob(2, "b", "w", 4), true);
      equal(service.submitJob(3, "c", "w", 1), false);
      equal(service.completeJob(4, "a"), true);
      equal(service.submitJob(5, "c", "w", 3), true);
      equal(service.getWorkerLoad(6, "w"), 7);
    }
  },
  {
    level: 2,
    name: "topWorkers desempata por ID e respeita n",
    run: () => {
      const service = new BuildFarmService();
      service.addWorker("z", 5);
      service.addWorker("a", 5);
      service.addWorker("m", 5);
      equal(service.topWorkers(1, 2), ["a(0)", "m(0)"]);
      equal(service.topWorkers(2, 0), []);
    }
  },
  {
    level: 2,
    name: "transferências inválidas não alteram carga",
    run: () => {
      const service = new BuildFarmService();
      service.addWorker("a", 5);
      service.submitJob(1, "j", "a", 2);
      equal(service.transferJob(2, "j", "a"), false);
      equal(service.transferJob(3, "j", "missing"), false);
      equal(service.transferJob(4, "missing", "a"), false);
      equal(service.getWorkerLoad(5, "a"), 2);
    }
  },
  {
    level: 3,
    name: "detecta ciclo indireto sem alterar dependências existentes",
    run: () => {
      const service = new BuildFarmService();
      service.addWorker("w", 20);
      service.submitJob(1, "a", "w", 2);
      service.submitJob(2, "b", "w", 2);
      service.submitJob(3, "c", "w", 2);
      equal(service.addDependency(4, "a", "b"), true);
      equal(service.addDependency(5, "b", "c"), true);
      equal(service.addDependency(6, "c", "a"), false);
      equal(service.readyJobs(7, "w"), ["c"]);
    }
  },
  {
    level: 3,
    name: "pré-requisito já concluído não bloqueia o job",
    run: () => {
      const service = new BuildFarmService();
      service.addWorker("w", 10);
      service.submitJob(1, "pre", "w", 2);
      service.submitJob(2, "job", "w", 3);
      equal(service.completeJob(3, "pre"), true);
      equal(service.addDependency(4, "job", "pre"), true);
      equal(service.readyJobs(5, "w"), ["job"]);
      equal(service.completeJob(6, "job"), true);
    }
  },
  {
    level: 4,
    name: "drenagem impossível falha sem efeitos parciais",
    run: () => {
      const service = new BuildFarmService();
      service.addWorker("source", 10);
      service.addWorker("a", 4);
      service.addWorker("b", 4);
      service.submitJob(1, "large", "source", 5);
      service.submitJob(2, "small", "source", 3);
      equal(service.drainWorker(3, "source", ["a", "b"]), false);
      equal(service.getWorkerLoad(4, "source"), 8);
      equal(service.getWorkerLoad(5, "a"), 0);
      equal(service.getWorkerLoad(6, "b"), 0);
      equal(service.getJobHistory(7, "large"), ["submitted:source@1"]);
    }
  },
  {
    level: 4,
    name: "drenagem desempata destino por ID e valida lista",
    run: () => {
      const service = new BuildFarmService();
      service.addWorker("source", 10);
      service.addWorker("a", 10);
      service.addWorker("b", 10);
      service.submitJob(1, "j1", "source", 6);
      service.submitJob(2, "j2", "source", 4);
      equal(service.drainWorker(3, "source", ["a", "a"]), false);
      equal(service.drainWorker(4, "source", ["source", "b"]), false);
      equal(service.drainWorker(5, "source", ["b", "a"]), true);
      equal(service.getWorkerLoad(6, "a"), 6);
      equal(service.getWorkerLoad(7, "b"), 4);
      equal(service.topWorkers(8, 5), ["a(0)", "b(0)"]);
    }
  }
];
