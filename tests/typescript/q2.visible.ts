import { RoomReservationService } from "../../solutions/typescript/question2.js";
import { equal, type TestCase } from "../../grader/typescript/harness.js";

export const visibleCases: TestCase[] = [
  {
    level: 1,
    name: "reserva intervalos semiabertos e lista agenda",
    run: () => {
      const service = new RoomReservationService();
      equal(service.addRoom("R1", 4), true);
      equal(service.book(1, "b1", "R1", "u1", 10, 20, 3), true);
      equal(service.book(2, "b2", "R1", "u2", 15, 25, 2), false);
      equal(service.book(3, "b3", "R1", "u2", 20, 25, 2), true);
      equal(service.roomSchedule(4, "R1"), ["b1:10-20", "b3:20-25"]);
    }
  },
  {
    level: 1,
    name: "cancelamento libera intervalo e ID não pode ser reutilizado",
    run: () => {
      const service = new RoomReservationService();
      service.addRoom("R", 2);
      service.book(1, "x", "R", "u", 1, 5, 2);
      equal(service.cancel(2, "x"), true);
      equal(service.cancel(3, "x"), false);
      equal(service.book(4, "x", "R", "u", 1, 5, 2), false);
      equal(service.book(5, "y", "R", "u", 1, 5, 2), true);
    }
  },
  {
    level: 2,
    name: "lista salas por capacidade e identificador",
    run: () => {
      const service = new RoomReservationService();
      service.addRoom("B", 4);
      service.addRoom("A", 4);
      service.addRoom("C", 8);
      service.book(1, "busy", "A", "u", 10, 20, 2);
      equal(service.availableRooms(2, 12, 15, 3), ["B", "C"]);
      equal(service.availableRooms(3, 20, 25, 3), ["A", "B", "C"]);
    }
  },
  {
    level: 2,
    name: "rankeia minutos históricos sem descontar cancelamentos",
    run: () => {
      const service = new RoomReservationService();
      service.addRoom("R", 5);
      service.book(1, "a1", "R", "ana", 0, 30, 1);
      service.book(2, "b1", "R", "bia", 30, 50, 1);
      service.book(3, "b2", "R", "bia", 50, 60, 1);
      service.cancel(4, "a1");
      equal(service.topUsers(5, 2), ["ana(30)", "bia(30)"]);
    }
  },
  {
    level: 3,
    name: "cancelamento promove solicitações elegíveis em ordem",
    run: () => {
      const service = new RoomReservationService();
      service.addRoom("R", 4);
      service.book(1, "base", "R", "owner", 10, 20, 2);
      equal(service.joinWaitlist(2, "w1", "R", "ana", 10, 15, 2), true);
      equal(service.joinWaitlist(3, "w2", "R", "bia", 15, 20, 2), true);
      equal(service.getWaitlist(4, "R"), ["w1", "w2"]);
      equal(service.cancel(5, "base"), true);
      equal(service.roomSchedule(6, "R"), ["w1:10-15", "w2:15-20"]);
      equal(service.getWaitlist(7, "R"), []);
      equal(service.topUsers(8, 3), ["owner(10)", "ana(5)", "bia(5)"]);
    }
  },
  {
    level: 3,
    name: "fila só aceita conflito e permite cancelamento pendente",
    run: () => {
      const service = new RoomReservationService();
      service.addRoom("R", 2);
      equal(service.joinWaitlist(1, "w", "R", "u", 1, 2, 1), false);
      service.book(2, "b", "R", "x", 1, 3, 1);
      equal(service.joinWaitlist(3, "w", "R", "u", 1, 2, 1), true);
      equal(service.cancelWaitlist(4, "w"), true);
      equal(service.cancelWaitlist(5, "w"), false);
      equal(service.getWaitlist(6, "R"), []);
    }
  },
  {
    level: 4,
    name: "cria série atômica e usa IDs na ordem original",
    run: () => {
      const service = new RoomReservationService();
      service.addRoom("R", 5);
      equal(service.bookSeries(1, "daily", "R", "u", [30, 10, 20], 5, 2), true);
      equal(service.roomSchedule(2, "R"), ["daily#2:10-15", "daily#3:20-25", "daily#1:30-35"]);
      equal(service.topUsers(3, 1), ["u(15)"]);
    }
  },
  {
    level: 4,
    name: "série com um conflito não produz efeitos parciais",
    run: () => {
      const service = new RoomReservationService();
      service.addRoom("R", 5);
      service.book(1, "existing", "R", "x", 20, 30, 1);
      equal(service.bookSeries(2, "s", "R", "u", [0, 25, 40], 10, 1), false);
      equal(service.roomSchedule(3, "R"), ["existing:20-30"]);
      equal(service.topUsers(4, 5), ["x(10)"]);
    }
  }
];
