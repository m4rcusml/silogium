import { RoomReservationService } from "../../solutions/typescript/question2.js";
import { equal, type TestCase } from "../../grader/typescript/harness.js";

export const hiddenCases: TestCase[] = [
  {
    level: 1,
    name: "valida salas, usuários, capacidade e intervalos",
    run: () => {
      const service = new RoomReservationService();
      equal(service.addRoom("", 2), false);
      equal(service.addRoom("R", 0), false);
      equal(service.addRoom("R", 3), true);
      equal(service.addRoom("R", 4), false);
      equal(service.book(1, "a", "R", "", 0, 1, 1), false);
      equal(service.book(2, "b", "R", "u", 2, 2, 1), false);
      equal(service.book(3, "c", "R", "u", 0, 1, 4), false);
      equal(service.book(4, "d", "missing", "u", 0, 1, 1), false);
    }
  },
  {
    level: 1,
    name: "agenda ordena início e desempata por ID",
    run: () => {
      const service = new RoomReservationService();
      service.addRoom("R", 2);
      service.book(1, "z", "R", "u", 20, 30, 1);
      service.book(2, "b", "R", "u", 10, 15, 1);
      service.book(3, "a", "R", "u", 10, 15, 1);
      // a e b conflitam; portanto a falha e não aparece.
      equal(service.roomSchedule(4, "R"), ["b:10-15", "z:20-30"]);
      equal(service.roomSchedule(5, "missing"), []);
    }
  },
  {
    level: 2,
    name: "topUsers respeita desempate, limite e entradas inválidas",
    run: () => {
      const service = new RoomReservationService();
      service.addRoom("R", 2);
      service.book(1, "z1", "R", "z", 0, 10, 1);
      service.book(2, "a1", "R", "a", 10, 20, 1);
      equal(service.topUsers(3, 1), ["a(10)"]);
      equal(service.topUsers(4, 0), []);
      equal(service.availableRooms(5, 5, 5, 1), []);
      equal(service.availableRooms(6, 0, 1, 0), []);
    }
  },
  {
    level: 2,
    name: "salas ocupadas em fronteiras continuam disponíveis",
    run: () => {
      const service = new RoomReservationService();
      service.addRoom("small", 2);
      service.addRoom("large", 5);
      service.book(1, "x", "small", "u", 10, 20, 1);
      equal(service.availableRooms(2, 0, 10, 2), ["small", "large"]);
      equal(service.availableRooms(3, 20, 30, 2), ["small", "large"]);
    }
  },
  {
    level: 3,
    name: "solicitação que continua bloqueada permanece na fila",
    run: () => {
      const service = new RoomReservationService();
      service.addRoom("R", 4);
      service.book(1, "b1", "R", "u", 0, 10, 1);
      service.book(2, "b2", "R", "u", 10, 20, 1);
      service.joinWaitlist(3, "w", "R", "v", 5, 15, 1);
      equal(service.cancel(4, "b1"), true);
      equal(service.getWaitlist(5, "R"), ["w"]);
      equal(service.cancel(6, "b2"), true);
      equal(service.getWaitlist(7, "R"), []);
      equal(service.roomSchedule(8, "R"), ["w:5-15"]);
    }
  },
  {
    level: 3,
    name: "ID promovido não pode ser reutilizado",
    run: () => {
      const service = new RoomReservationService();
      equal(service.addRoom("R", 2), true);
      equal(service.book(1, "base", "R", "u", 0, 10, 1), true);
      equal(service.joinWaitlist(2, "req", "R", "v", 0, 10, 1), true);
      equal(service.cancel(3, "base"), true);
      equal(service.cancel(4, "req"), true);
      equal(service.book(5, "req", "R", "v", 0, 10, 1), false);
      equal(service.joinWaitlist(6, "req", "R", "v", 0, 10, 1), false);
    }
  },
  {
    level: 4,
    name: "série rejeita inícios duplicados e reutilização",
    run: () => {
      const service = new RoomReservationService();
      service.addRoom("R", 3);
      equal(service.bookSeries(1, "s", "R", "u", [0, 0], 5, 1), false);
      equal(service.bookSeries(2, "s", "R", "u", [0, 10], 5, 1), true);
      equal(service.cancelSeries(3, "s"), 2);
      equal(service.bookSeries(4, "s", "R", "u", [20], 5, 1), false);
      equal(service.cancelSeries(5, "s"), 0);
    }
  },
  {
    level: 4,
    name: "cancelamento de série promove fila após remover todas as ocorrências",
    run: () => {
      const service = new RoomReservationService();
      service.addRoom("R", 3);
      service.bookSeries(1, "series", "R", "owner", [0, 10], 10, 1);
      service.joinWaitlist(2, "waiting", "R", "guest", 5, 15, 1);
      equal(service.cancelSeries(3, "series"), 2);
      equal(service.roomSchedule(4, "R"), ["waiting:5-15"]);
      equal(service.topUsers(5, 2), ["owner(20)", "guest(10)"]);
    }
  }
];
