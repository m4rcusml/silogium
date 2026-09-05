import { BuildFarmService } from "../../solutions/typescript/question3.js";
import { equal, type TestCase } from "../../grader/typescript/harness.js";

export const visibleCases: TestCase[] = [
  {
    level: 1,
    name: "submete jobs, respeita capacidade e conclui",
    run: () => {
      const service = new BuildFarmService();
      equal(service.addWorker("w1", 10), true);
      equal(service.submitJob(1, "a", "w1", 6), true);
      equal(service.submitJob(2, "b", "w1", 5), false);
      equal(service.getWorkerLoad(3, "w1"), 6);
      equal(service.completeJob(4, "a"), true);
      equal(service.getWorkerLoad(5, "w1"), 0);
    }
  },
  {
    level: 1,
    name: "valida entradas e proíbe reutilização de jobId",
    run: () => {
      const service = new BuildFarmService();
      equal(service.addWorker("", 5), false);
      equal(service.addWorker("w", 0), false);
      equal(service.addWorker("w", 5), true);
      equal(service.addWorker("w", 8), false);
      equal(service.submitJob(1, "j", "w", 5), true);
      equal(service.completeJob(2, "j"), true);
      equal(service.submitJob(3, "j", "w", 1), false);
      equal(service.getWorkerLoad(4, "missing"), null);
    }
  },
  {
    level: 2,
    name: "transfere job e credita trabalho ao worker que conclui",
    run: () => {
      const service = new BuildFarmService();
      service.addWorker("a", 10);
      service.addWorker("b", 10);
      service.addWorker("c", 10);
      service.submitJob(1, "j", "a", 4);
      equal(service.transferJob(2, "j", "b"), true);
      equal(service.completeJob(3, "j"), true);
      equal(service.topWorkers(4, 3), ["b(4)", "a(0)", "c(0)"]);
    }
  },
  {
    level: 2,
    name: "transferência sem capacidade é atômica",
    run: () => {
      const service = new BuildFarmService();
      service.addWorker("a", 10);
      service.addWorker("b", 3);
      service.submitJob(1, "j", "a", 4);
      equal(service.transferJob(2, "j", "b"), false);
      equal(service.getWorkerLoad(3, "a"), 4);
      equal(service.getWorkerLoad(4, "b"), 0);
      equal(service.topWorkers(5, 2), ["a(0)", "b(0)"]);
    }
  },
  {
    level: 3,
    name: "dependência bloqueia conclusão até o pré-requisito terminar",
    run: () => {
      const service = new BuildFarmService();
      service.addWorker("w", 20);
      service.submitJob(1, "base", "w", 3);
      service.submitJob(2, "app", "w", 5);
      equal(service.addDependency(3, "app", "base"), true);
      equal(service.readyJobs(4, "w"), ["base"]);
      equal(service.completeJob(5, "app"), false);
      equal(service.completeJob(6, "base"), true);
      equal(service.readyJobs(7, "w"), ["app"]);
      equal(service.completeJob(8, "app"), true);
      equal(service.topWorkers(9, 1), ["w(8)"]);
    }
  },
  {
    level: 3,
    name: "readyJobs ordena por custo e ciclos são rejeitados",
    run: () => {
      const service = new BuildFarmService();
      service.addWorker("w", 30);
      service.submitJob(1, "x", "w", 5);
      service.submitJob(2, "y", "w", 5);
      service.submitJob(3, "z", "w", 3);
      equal(service.readyJobs(4, "w"), ["x", "y", "z"]);
      equal(service.addDependency(5, "x", "y"), true);
      equal(service.addDependency(6, "y", "z"), true);
      equal(service.addDependency(7, "z", "x"), false);
      equal(service.addDependency(8, "x", "y"), false);
    }
  },
  {
    level: 4,
    name: "drena worker pela maior capacidade livre e registra histórico",
    run: () => {
      const service = new BuildFarmService();
      service.addWorker("source", 20);
      service.addWorker("a", 5);
      service.addWorker("b", 8);
      service.submitJob(1, "j1", "source", 5);
      service.submitJob(2, "j2", "source", 4);
      service.submitJob(3, "j3", "source", 3);
      equal(service.drainWorker(4, "source", ["a", "b"]), true);
      equal(service.getWorkerLoad(5, "source"), null);
      equal(service.getWorkerLoad(6, "a"), 4);
      equal(service.getWorkerLoad(7, "b"), 8);
      equal(service.getJobHistory(8, "j1"), [
        "submitted:source@1",
        "drained:source->b@4"
      ]);
    }
  },
  {
    level: 4,
    name: "histórico inclui eventos anteriores e é uma cópia",
    run: () => {
      const service = new BuildFarmService();
      service.addWorker("a", 10);
      service.addWorker("b", 10);
      service.submitJob(1, "pre", "a", 1);
      service.submitJob(2, "job", "a", 2);
      service.addDependency(3, "job", "pre");
      service.transferJob(4, "job", "b");
      const history = service.getJobHistory(5, "job");
      equal(history, ["submitted:a@2", "depends-on:pre@3", "transferred:a->b@4"]);
      history.push("fake");
      equal(service.getJobHistory(6, "job"), [
        "submitted:a@2",
        "depends-on:pre@3",
        "transferred:a->b@4"
      ]);
    }
  }
];
