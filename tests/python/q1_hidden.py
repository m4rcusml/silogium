from solutions.python.question1 import ParcelLockerService


def exact_limits() -> None:
    service = ParcelLockerService()
    assert service.add_locker("L", 5) is True
    assert service.store_parcel(1, "x", "L", 5) is True
    assert service.get_load(2, "L") == 5
    assert service.collect_parcel(3, "x") is True
    assert service.collect_parcel(4, "x") is False
    assert service.store_parcel(5, "", "L", 1) is False
    assert service.store_parcel(6, "y", "L", -1) is False


def shared_capacity() -> None:
    service = ParcelLockerService()
    service.add_locker("L", 7)
    assert service.store_parcel(1, "a", "L", 3) is True
    assert service.store_parcel(2, "b", "L", 4) is True
    assert service.store_parcel(3, "c", "L", 1) is False
    assert service.collect_parcel(4, "a") is True
    assert service.store_parcel(5, "c", "L", 3) is True
    assert service.get_load(6, "L") == 7


def ranking_tie_and_limit() -> None:
    service = ParcelLockerService()
    service.add_locker("z", 5)
    service.add_locker("a", 5)
    service.add_locker("m", 5)
    assert service.top_lockers(1, 2) == ["a(0)", "m(0)"]
    assert service.top_lockers(2, 0) == []


def invalid_moves_do_not_score() -> None:
    service = ParcelLockerService()
    service.add_locker("A", 5)
    service.store_parcel(1, "p", "A", 2)
    assert service.move_parcel(2, "p", "A") is False
    assert service.move_parcel(3, "p", "X") is False
    assert service.move_parcel(4, "missing", "A") is False
    assert service.top_lockers(5, 1) == ["A(2)"]


def scheduled_numeric_order() -> None:
    service = ParcelLockerService()
    service.add_locker("A", 50)
    service.add_locker("B", 50)
    for number in range(1, 12):
        service.store_parcel(number, f"p{number}", "A", 1)
        assert (
            service.schedule_move(20 + number, f"p{number}", "B", 100)
            == f"move-{number}"
        )
    assert service.process_scheduled(100) == [f"move-{number}" for number in range(1, 12)]


def scheduled_capacity_failure() -> None:
    service = ParcelLockerService()
    service.add_locker("A", 10)
    service.add_locker("B", 3)
    service.store_parcel(1, "p", "A", 4)
    assert service.schedule_move(2, "p", "B", 5) == "move-1"
    assert service.process_scheduled(5) == []
    assert service.process_scheduled(6) == []
    assert service.collect_parcel(7, "p") is True
    assert service.cancel_scheduled_move(8, "move-1") is False


def merge_capacity_failure() -> None:
    service = ParcelLockerService()
    service.add_locker("A", 5)
    service.add_locker("B", 5)
    service.store_parcel(1, "a", "A", 4)
    service.store_parcel(2, "b", "B", 3)
    assert service.merge_lockers(3, "A", "B") is False
    assert service.get_load(4, "A") == 4
    assert service.get_load(5, "B") == 3
    assert service.top_lockers(6, 2) == ["A(4)", "B(3)"]
    assert service.get_parcel_history(7, "a") == ["stored:A@1"]


def merge_retargets_pending() -> None:
    service = ParcelLockerService()
    service.add_locker("A", 10)
    service.add_locker("B", 10)
    service.add_locker("C", 10)
    service.store_parcel(1, "p", "C", 2)
    assert service.schedule_move(2, "p", "A", 10) == "move-1"
    assert service.merge_lockers(3, "A", "B") is True
    assert service.process_scheduled(10) == ["move-1"]
    assert service.get_load(11, "B") == 2
    assert service.get_parcel_history(12, "p") == [
        "stored:C@1",
        "moved:C->B@10",
    ]


CASES = [
    (1, "limites exatos e coleta repetida", exact_limits),
    (1, "capacidade é compartilhada", shared_capacity),
    (2, "desempata ranking e respeita n", ranking_tie_and_limit),
    (2, "movimentos inválidos não alteram atividade", invalid_moves_do_not_score),
    (3, "processa empate por ordem numérica de criação", scheduled_numeric_order),
    (3, "falha agendada por capacidade é definitiva", scheduled_capacity_failure),
    (4, "fusão sem capacidade falha atomicamente", merge_capacity_failure),
    (4, "fusão redireciona agendamento pendente", merge_retargets_pending),
]
