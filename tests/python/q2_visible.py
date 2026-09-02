from solutions.python.question2 import RoomReservationService


def half_open_intervals() -> None:
    service = RoomReservationService()
    assert service.add_room("R1", 4) is True
    assert service.book(1, "b1", "R1", "u1", 10, 20, 3) is True
    assert service.book(2, "b2", "R1", "u2", 15, 25, 2) is False
    assert service.book(3, "b3", "R1", "u2", 20, 25, 2) is True
    assert service.room_schedule(4, "R1") == ["b1:10-20", "b3:20-25"]


def cancellation_and_id_reuse() -> None:
    service = RoomReservationService()
    service.add_room("R", 2)
    service.book(1, "x", "R", "u", 1, 5, 2)
    assert service.cancel(2, "x") is True
    assert service.cancel(3, "x") is False
    assert service.book(4, "x", "R", "u", 1, 5, 2) is False
    assert service.book(5, "y", "R", "u", 1, 5, 2) is True


def available_room_order() -> None:
    service = RoomReservationService()
    service.add_room("B", 4)
    service.add_room("A", 4)
    service.add_room("C", 8)
    service.book(1, "busy", "A", "u", 10, 20, 2)
    assert service.available_rooms(2, 12, 15, 3) == ["B", "C"]
    assert service.available_rooms(3, 20, 25, 3) == ["A", "B", "C"]


def historical_minutes() -> None:
    service = RoomReservationService()
    service.add_room("R", 5)
    service.book(1, "a1", "R", "ana", 0, 30, 1)
    service.book(2, "b1", "R", "bia", 30, 50, 1)
    service.book(3, "b2", "R", "bia", 50, 60, 1)
    service.cancel(4, "a1")
    assert service.top_users(5, 2) == ["ana(30)", "bia(30)"]


def waitlist_promotion() -> None:
    service = RoomReservationService()
    service.add_room("R", 4)
    service.book(1, "base", "R", "owner", 10, 20, 2)
    assert service.join_waitlist(2, "w1", "R", "ana", 10, 15, 2) is True
    assert service.join_waitlist(3, "w2", "R", "bia", 15, 20, 2) is True
    assert service.get_waitlist(4, "R") == ["w1", "w2"]
    assert service.cancel(5, "base") is True
    assert service.room_schedule(6, "R") == ["w1:10-15", "w2:15-20"]
    assert service.get_waitlist(7, "R") == []
    assert service.top_users(8, 3) == ["owner(10)", "ana(5)", "bia(5)"]


def waitlist_rules() -> None:
    service = RoomReservationService()
    service.add_room("R", 2)
    assert service.join_waitlist(1, "w", "R", "u", 1, 2, 1) is False
    service.book(2, "b", "R", "x", 1, 3, 1)
    assert service.join_waitlist(3, "w", "R", "u", 1, 2, 1) is True
    assert service.cancel_waitlist(4, "w") is True
    assert service.cancel_waitlist(5, "w") is False
    assert service.get_waitlist(6, "R") == []


def atomic_series() -> None:
    service = RoomReservationService()
    service.add_room("R", 5)
    assert service.book_series(1, "daily", "R", "u", [30, 10, 20], 5, 2) is True
    assert service.room_schedule(2, "R") == [
        "daily#2:10-15",
        "daily#3:20-25",
        "daily#1:30-35",
    ]
    assert service.top_users(3, 1) == ["u(15)"]


def conflicting_series_is_atomic() -> None:
    service = RoomReservationService()
    service.add_room("R", 5)
    service.book(1, "existing", "R", "x", 20, 30, 1)
    assert service.book_series(2, "s", "R", "u", [0, 25, 40], 10, 1) is False
    assert service.room_schedule(3, "R") == ["existing:20-30"]
    assert service.top_users(4, 5) == ["x(10)"]


CASES = [
    (1, "reserva intervalos semiabertos e lista agenda", half_open_intervals),
    (1, "cancelamento libera intervalo sem reutilizar ID", cancellation_and_id_reuse),
    (2, "lista salas por capacidade e identificador", available_room_order),
    (2, "rankeia minutos históricos", historical_minutes),
    (3, "cancelamento promove solicitações elegíveis", waitlist_promotion),
    (3, "fila só aceita conflito e permite cancelamento", waitlist_rules),
    (4, "cria série atômica na ordem original", atomic_series),
    (4, "série conflitante não produz efeitos parciais", conflicting_series_is_atomic),
]
