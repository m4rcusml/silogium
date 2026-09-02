import { ParcelLockerService } from "../../solutions/typescript/question1.js";
import { equal, type TestCase } from "../../grader/typescript/harness.js";

export const hiddenCases: TestCase[] = [
  {
    level: 1,
    name: "limites exatos e coleta repetida",
    run: () => {
      const service = new ParcelLockerService();
      equal(service.addLocker("L", 5), true);
      equal(service.storeParcel(1, "x", "L", 5), true);
      equal(service.getLoad(2, "L"), 5);
      equal(service.collectParcel(3, "x"), true);
      equal(service.collectParcel(4, "x"), false);
      equal(service.storeParcel(5, "", "L", 1), false);
      equal(service.storeParcel(6, "y", "L", -1), false);
    }
  },
  {
    level: 1,
    name: "capacidade é compartilhada entre várias encomendas",
    run: () => {
      const service = new ParcelLockerService();
      service.addLocker("L", 7);
      equal(service.storeParcel(1, "a", "L", 3), true);
      equal(service.storeParcel(2, "b", "L", 4), true);
      equal(service.storeParcel(3, "c", "L", 1), false);
      equal(service.collectParcel(4, "a"), true);
      equal(service.storeParcel(5, "c", "L", 3), true);
      equal(service.getLoad(6, "L"), 7);
    }
  },
  {
    level: 2,
    name: "desempata lexicograficamente e respeita n",
    run: () => {
      const service = new ParcelLockerService();
      service.addLocker("z", 5);
      service.addLocker("a", 5);
      service.addLocker("m", 5);
      equal(service.topLockers(1, 2), ["a(0)", "m(0)"]);
      equal(service.topLockers(2, 0), []);
    }
  },
  {
    level: 2,
    name: "recusa destino atual e inexistente sem alterar métricas",
    run: () => {
      const service = new ParcelLockerService();
      service.addLocker("A", 5);
      service.storeParcel(1, "p", "A", 2);
      equal(service.moveParcel(2, "p", "A"), false);
      equal(service.moveParcel(3, "p", "X"), false);
      equal(service.moveParcel(4, "missing", "A"), false);
      equal(service.topLockers(5, 1), ["A(2)"]);
    }
  },
  {
    level: 3,
    name: "processa por horário e depois ordem numérica de criação",
    run: () => {
      const service = new ParcelLockerService();
      service.addLocker("A", 50);
      service.addLocker("B", 50);
      for (let i = 1; i <= 11; i += 1) {
        service.storeParcel(i, `p${i}`, "A", 1);
        equal(service.scheduleMove(20 + i, `p${i}`, "B", 100), `move-${i}`);
      }
      equal(service.processScheduled(100), [
        "move-1", "move-2", "move-3", "move-4", "move-5", "move-6",
        "move-7", "move-8", "move-9", "move-10", "move-11"
      ]);
    }
  },
  {
    level: 3,
    name: "falha agendada por capacidade é definitiva",
    run: () => {
      const service = new ParcelLockerService();
      service.addLocker("A", 10);
      service.addLocker("B", 3);
      service.storeParcel(1, "p", "A", 4);
      equal(service.scheduleMove(2, "p", "B", 5), "move-1");
      equal(service.processScheduled(5), []);
      equal(service.processScheduled(6), []);
      equal(service.collectParcel(7, "p"), true);
      equal(service.cancelScheduledMove(8, "move-1"), false);
    }
  },
  {
    level: 4,
    name: "fusão sem capacidade falha atomicamente",
    run: () => {
      const service = new ParcelLockerService();
      service.addLocker("A", 5);
      service.addLocker("B", 5);
      service.storeParcel(1, "a", "A", 4);
      service.storeParcel(2, "b", "B", 3);
      equal(service.mergeLockers(3, "A", "B"), false);
      equal(service.getLoad(4, "A"), 4);
      equal(service.getLoad(5, "B"), 3);
      equal(service.topLockers(6, 2), ["A(4)", "B(3)"]);
      equal(service.getParcelHistory(7, "a"), ["stored:A@1"]);
    }
  },
  {
    level: 4,
    name: "fusão redireciona destino de agendamento pendente",
    run: () => {
      const service = new ParcelLockerService();
      service.addLocker("A", 10);
      service.addLocker("B", 10);
      service.addLocker("C", 10);
      service.storeParcel(1, "p", "C", 2);
      equal(service.scheduleMove(2, "p", "A", 10), "move-1");
      equal(service.mergeLockers(3, "A", "B"), true);
      equal(service.processScheduled(10), ["move-1"]);
      equal(service.getLoad(11, "B"), 2);
      equal(service.getParcelHistory(12, "p"), ["stored:C@1", "moved:C->B@10"]);
    }
  }
];
