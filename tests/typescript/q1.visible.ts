import { ParcelLockerService } from "../../solutions/typescript/question1.js";
import { equal, type TestCase } from "../../grader/typescript/harness.js";

export const visibleCases: TestCase[] = [
  {
    level: 1,
    name: "armazena, respeita capacidade e coleta",
    run: () => {
      const service = new ParcelLockerService();
      equal(service.addLocker("A", 10), true);
      equal(service.storeParcel(1, "p1", "A", 6), true);
      equal(service.storeParcel(2, "p2", "A", 5), false);
      equal(service.getLoad(3, "A"), 6);
      equal(service.collectParcel(4, "p1"), true);
      equal(service.getLoad(5, "A"), 0);
    }
  },
  {
    level: 1,
    name: "recusa entradas inválidas e reutilização de ID",
    run: () => {
      const service = new ParcelLockerService();
      equal(service.addLocker("", 10), false);
      equal(service.addLocker("A", 0), false);
      equal(service.addLocker("A", 5), true);
      equal(service.addLocker("A", 8), false);
      equal(service.storeParcel(1, "p", "A", 5), true);
      equal(service.collectParcel(2, "p"), true);
      equal(service.storeParcel(3, "p", "A", 1), false);
      equal(service.getLoad(4, "missing"), null);
    }
  },
  {
    level: 2,
    name: "move encomendas e ordena armários por atividade",
    run: () => {
      const service = new ParcelLockerService();
      equal(service.addLocker("B", 10), true);
      equal(service.addLocker("A", 10), true);
      equal(service.addLocker("C", 10), true);
      equal(service.storeParcel(1, "p", "A", 4), true);
      equal(service.moveParcel(2, "p", "B"), true);
      equal(service.collectParcel(3, "p"), true);
      equal(service.topLockers(4, 3), ["A(8)", "B(8)", "C(0)"]);
    }
  },
  {
    level: 2,
    name: "movimentação sem capacidade é atômica",
    run: () => {
      const service = new ParcelLockerService();
      service.addLocker("A", 10);
      service.addLocker("B", 3);
      service.storeParcel(1, "p", "A", 4);
      equal(service.moveParcel(2, "p", "B"), false);
      equal(service.getLoad(3, "A"), 4);
      equal(service.getLoad(4, "B"), 0);
      equal(service.topLockers(5, 2), ["A(4)", "B(0)"]);
    }
  },
  {
    level: 3,
    name: "agenda e executa movimentação no instante correto",
    run: () => {
      const service = new ParcelLockerService();
      service.addLocker("A", 10);
      service.addLocker("B", 10);
      service.storeParcel(1, "p", "A", 4);
      equal(service.scheduleMove(2, "p", "B", 30), "move-1");
      equal(service.scheduleMove(3, "p", "B", 31), null);
      equal(service.collectParcel(4, "p"), false);
      equal(service.processScheduled(29), []);
      equal(service.processScheduled(30), ["move-1"]);
      equal(service.getLoad(31, "B"), 4);
      equal(service.topLockers(32, 2), ["A(8)", "B(4)"]);
    }
  },
  {
    level: 3,
    name: "cancelamento libera a encomenda e preserva sequência de IDs",
    run: () => {
      const service = new ParcelLockerService();
      service.addLocker("A", 10);
      service.addLocker("B", 10);
      service.storeParcel(1, "p", "A", 2);
      equal(service.scheduleMove(2, "p", "B", 10), "move-1");
      equal(service.cancelScheduledMove(3, "move-1"), true);
      equal(service.cancelScheduledMove(4, "move-1"), false);
      equal(service.scheduleMove(5, "p", "B", 11), "move-2");
      equal(service.processScheduled(11), ["move-2"]);
    }
  },
  {
    level: 4,
    name: "funde armários, soma atividade e registra histórico",
    run: () => {
      const service = new ParcelLockerService();
      service.addLocker("A", 10);
      service.addLocker("B", 10);
      service.storeParcel(1, "p1", "A", 4);
      service.storeParcel(2, "p2", "B", 3);
      equal(service.mergeLockers(3, "A", "B"), true);
      equal(service.getLoad(4, "A"), null);
      equal(service.getLoad(5, "B"), 7);
      equal(service.topLockers(6, 2), ["B(7)"]);
      equal(service.getParcelHistory(7, "p1"), ["stored:A@1", "merged:A->B@3"]);
    }
  },
  {
    level: 4,
    name: "histórico retornado é uma cópia defensiva",
    run: () => {
      const service = new ParcelLockerService();
      service.addLocker("A", 10);
      service.storeParcel(1, "p", "A", 1);
      const history = service.getParcelHistory(2, "p");
      history.push("fake");
      equal(service.getParcelHistory(3, "p"), ["stored:A@1"]);
      equal(service.getParcelHistory(4, "missing"), []);
    }
  }
];
