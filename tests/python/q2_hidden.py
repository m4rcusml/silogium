from solutions.python.question2 import RoomReservationService


def invalid_inputs() -> None:
    service = RoomReservationService()
    assert service.add_room("", 2) is False
    assert service.add_room("R", 0) is False
    assert service.add_room("R", 3) is True
    assert service.add_room("R", 4) is False
    assert service.book(1, "a", "R", "", 0, 1, 1) is False
    assert service.book(2, "b", "R", "u", 2, 2, 1) is False
    assert service.book(3, "c", "R", "u", 0, 1, 4) is False
    assert service.book(4, "d", "missing", "u", 0, 1, 1) is False


def schedule_sorting() -> None:
    service = RoomReservationService()
    service.add_room("R", 2)
    service.book(1, "z", "R", "u", 20, 30, 1)
    service.book(2, "b", "R", "u", 10, 15, 1)
    service.book(3, "a", "R", "u", 10, 15, 1)
    assert service.room_schedule(4, "R") == ["b:10-15", "z:20-30"]
    assert service.room_schedule(5, "missing") == []


def top_users_tie() -> None:
    service = RoomReservationService()
    service.add_room("R", 2)
    service.book(1, "z1", "R", "z", 0, 10, 1)
    service.book(2, "a1", "R", "a", 10, 20, 1)
    assert service.top_users(3, 1) == ["a(10)"]
    assert service.top_users(4, 0) == []
    assert service.available_rooms(5, 5, 5, 1) == []
    assert service.available_rooms(6, 0, 1, 0) == []


def boundary_availability() -> None:
    service = RoomReservationService()
    service.add_room("small", 2)
    service.add_room("large", 5)
    service.book(1, "x", "small", "u", 10, 20, 1)
    assert service.available_rooms(2, 0, 10, 2) == ["small", "large"]
    assert service.available_rooms(3, 20, 30, 2) == ["small", "large"]


def blocked_request_stays_pending() -> None:
    service = RoomReservationService()
    service.add_room("R", 4)
    service.book(1, "b1", "R", "u", 0, 10, 1)
    service.book(2, "b2", "R", "u", 10, 20, 1)
    service.join_waitlist(3, "w", "R", "v", 5, 15, 1)
    assert service.cancel(4, "b1") is True
    assert service.get_waitlist(5, "R") == ["w"]
    assert service.cancel(6, "b2") is True
    assert service.get_waitlist(7, "R") == []
    assert service.room_schedule(8, "R") == ["w:5-15"]


def promoted_id_not_reusable() -> None:
    service = RoomReservationService()
    assert service.add_room("R", 2) is True
    assert service.book(1, "base", "R", "u", 0, 10, 1) is True
    assert service.join_waitlist(2, "req", "R", "v", 0, 10, 1) is True
    assert service.cancel(3, "base") is True
    assert service.cancel(4, "req") is True
    assert service.book(5, "req", "R", "v", 0, 10, 1) is False
    assert service.join_waitlist(6, "req", "R", "v", 0, 10, 1) is False


def series_validation_and_reuse() -> None:
    service = RoomReservationService()
    service.add_room("R", 3)
    assert service.book_series(1, "s", "R", "u", [0, 0], 5, 1) is False
    assert service.book_series(2, "s", "R", "u", [0, 10], 5, 1) is True
    assert service.cancel_series(3, "s") == 2
    assert service.book_series(4, "s", "R", "u", [20], 5, 1) is False
    assert service.cancel_series(5, "s") == 0


def series_cancel_promotes_after_all_removals() -> None:
    service = RoomReservationService()
    service.add_room("R", 3)
    service.book_series(1, "series", "R", "owner", [0, 10], 10, 1)
    service.join_waitlist(2, "waiting", "R", "guest", 5, 15, 1)
    assert service.cancel_series(3, "series") == 2
    assert service.room_schedule(4, "R") == ["waiting:5-15"]
    assert service.top_users(5, 2) == ["owner(20)", "guest(10)"]


CASES = [
    (1, "valida salas, usuários, capacidade e intervalos", invalid_inputs),
    (1, "ordena agenda e ignora reserva conflitante", schedule_sorting),
    (2, "topUsers desempata e valida consultas", top_users_tie),
    (2, "fronteiras de intervalos continuam disponíveis", boundary_availability),
    (3, "solicitação bloqueada permanece na fila", blocked_request_stays_pending),
    (3, "ID promovido não pode ser reutilizado", promoted_id_not_reusable),
    (4, "série rejeita duplicatas e reutilização", series_validation_and_reuse),
    (4, "cancelamento de série promove após remover tudo", series_cancel_promotes_after_all_removals),
]
