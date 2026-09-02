from solutions.python.question1 import ParcelLockerService


def lifecycle_and_capacity() -> None:
    service = ParcelLockerService()
    assert service.add_locker("A", 10) is True
    assert service.store_parcel(1, "p1", "A", 6) is True
    assert service.store_parcel(2, "p2", "A", 5) is False
    assert service.get_load(3, "A") == 6
    assert service.collect_parcel(4, "p1") is True
    assert service.get_load(5, "A") == 0


def invalid_and_reused_ids() -> None:
    service = ParcelLockerService()
    assert service.add_locker("", 10) is False
    assert service.add_locker("A", 0) is False
    assert service.add_locker("A", 5) is True
    assert service.add_locker("A", 8) is False
    assert service.store_parcel(1, "p", "A", 5) is True
    assert service.collect_parcel(2, "p") is True
    assert service.store_parcel(3, "p", "A", 1) is False
    assert service.get_load(4, "missing") is None


def move_and_rank() -> None:
    service = ParcelLockerService()
    service.add_locker("B", 10)
    service.add_locker("A", 10)
    service.add_locker("C", 10)
    assert service.store_parcel(1, "p", "A", 4) is True
    assert service.move_parcel(2, "p", "B") is True
    assert service.collect_parcel(3, "p") is True
    assert service.top_lockers(4, 3) == ["A(8)", "B(8)", "C(0)"]


def atomic_move() -> None:
    service = ParcelLockerService()
    service.add_locker("A", 10)
    service.add_locker("B", 3)
    service.store_parcel(1, "p", "A", 4)
    assert service.move_parcel(2, "p", "B") is False
    assert service.get_load(3, "A") == 4
    assert service.get_load(4, "B") == 0
    assert service.top_lockers(5, 2) == ["A(4)", "B(0)"]


def scheduled_execution() -> None:
    service = ParcelLockerService()
    service.add_locker("A", 10)
    service.add_locker("B", 10)
    service.store_parcel(1, "p", "A", 4)
    assert service.schedule_move(2, "p", "B", 30) == "move-1"
    assert service.schedule_move(3, "p", "B", 31) is None
    assert service.collect_parcel(4, "p") is False
    assert service.process_scheduled(29) == []
    assert service.process_scheduled(30) == ["move-1"]
    assert service.get_load(31, "B") == 4
    assert service.top_lockers(32, 2) == ["A(8)", "B(4)"]


def cancellation_and_sequence() -> None:
    service = ParcelLockerService()
    service.add_locker("A", 10)
    service.add_locker("B", 10)
    service.store_parcel(1, "p", "A", 2)
    assert service.schedule_move(2, "p", "B", 10) == "move-1"
    assert service.cancel_scheduled_move(3, "move-1") is True
    assert service.cancel_scheduled_move(4, "move-1") is False
    assert service.schedule_move(5, "p", "B", 11) == "move-2"
    assert service.process_scheduled(11) == ["move-2"]


def merge_and_history() -> None:
    service = ParcelLockerService()
    service.add_locker("A", 10)
    service.add_locker("B", 10)
    service.store_parcel(1, "p1", "A", 4)
    service.store_parcel(2, "p2", "B", 3)
    assert service.merge_lockers(3, "A", "B") is True
    assert service.get_load(4, "A") is None
    assert service.get_load(5, "B") == 7
    assert service.top_lockers(6, 2) == ["B(7)"]
    assert service.get_parcel_history(7, "p1") == [
        "stored:A@1",
        "merged:A->B@3",
    ]


def defensive_history() -> None:
    service = ParcelLockerService()
    service.add_locker("A", 10)
    service.store_parcel(1, "p", "A", 1)
    history = service.get_parcel_history(2, "p")
    history.append("fake")
    assert service.get_parcel_history(3, "p") == ["stored:A@1"]
    assert service.get_parcel_history(4, "missing") == []


CASES = [
    (1, "armazena, respeita capacidade e coleta", lifecycle_and_capacity),
    (1, "recusa entradas inválidas e reutilização de ID", invalid_and_reused_ids),
    (2, "move encomendas e ordena armários por atividade", move_and_rank),
    (2, "movimentação sem capacidade é atômica", atomic_move),
    (3, "agenda e executa movimentação no instante correto", scheduled_execution),
    (3, "cancelamento libera encomenda e preserva sequência", cancellation_and_sequence),
    (4, "funde armários e registra histórico", merge_and_history),
    (4, "histórico retornado é uma cópia defensiva", defensive_history),
]
