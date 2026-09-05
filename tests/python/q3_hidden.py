from solutions.python.question3 import BuildFarmService


def exact_limit() -> None:
    service = BuildFarmService()
    assert service.add_worker("w", 5) is True
    assert service.submit_job(1, "j", "w", 5) is True
    assert service.get_worker_load(2, "w") == 5
    assert service.complete_job(3, "j") is True
    assert service.complete_job(4, "j") is False
    assert service.submit_job(5, "", "w", 1) is False
    assert service.submit_job(6, "bad", "w", -1) is False


def shared_load() -> None:
    service = BuildFarmService()
    service.add_worker("w", 7)
    assert service.submit_job(1, "a", "w", 3) is True
    assert service.submit_job(2, "b", "w", 4) is True
    assert service.submit_job(3, "c", "w", 1) is False
    assert service.complete_job(4, "a") is True
    assert service.submit_job(5, "c", "w", 3) is True
    assert service.get_worker_load(6, "w") == 7


def ranking_tie() -> None:
    service = BuildFarmService()
    service.add_worker("z", 5)
    service.add_worker("a", 5)
    service.add_worker("m", 5)
    assert service.top_workers(1, 2) == ["a(0)", "m(0)"]
    assert service.top_workers(2, 0) == []


def invalid_transfer() -> None:
    service = BuildFarmService()
    service.add_worker("a", 5)
    service.submit_job(1, "j", "a", 2)
    assert service.transfer_job(2, "j", "a") is False
    assert service.transfer_job(3, "j", "missing") is False
    assert service.transfer_job(4, "missing", "a") is False
    assert service.get_worker_load(5, "a") == 2


def indirect_cycle() -> None:
    service = BuildFarmService()
    service.add_worker("w", 20)
    service.submit_job(1, "a", "w", 2)
    service.submit_job(2, "b", "w", 2)
    service.submit_job(3, "c", "w", 2)
    assert service.add_dependency(4, "a", "b") is True
    assert service.add_dependency(5, "b", "c") is True
    assert service.add_dependency(6, "c", "a") is False
    assert service.ready_jobs(7, "w") == ["c"]


def completed_prerequisite() -> None:
    service = BuildFarmService()
    service.add_worker("w", 10)
    service.submit_job(1, "pre", "w", 2)
    service.submit_job(2, "job", "w", 3)
    assert service.complete_job(3, "pre") is True
    assert service.add_dependency(4, "job", "pre") is True
    assert service.ready_jobs(5, "w") == ["job"]
    assert service.complete_job(6, "job") is True


def impossible_drain() -> None:
    service = BuildFarmService()
    service.add_worker("source", 10)
    service.add_worker("a", 4)
    service.add_worker("b", 4)
    service.submit_job(1, "large", "source", 5)
    service.submit_job(2, "small", "source", 3)
    assert service.drain_worker(3, "source", ["a", "b"]) is False
    assert service.get_worker_load(4, "source") == 8
    assert service.get_worker_load(5, "a") == 0
    assert service.get_worker_load(6, "b") == 0
    assert service.get_job_history(7, "large") == ["submitted:source@1"]


def drain_tie_and_validation() -> None:
    service = BuildFarmService()
    service.add_worker("source", 10)
    service.add_worker("a", 10)
    service.add_worker("b", 10)
    service.submit_job(1, "j1", "source", 6)
    service.submit_job(2, "j2", "source", 4)
    assert service.drain_worker(3, "source", ["a", "a"]) is False
    assert service.drain_worker(4, "source", ["source", "b"]) is False
    assert service.drain_worker(5, "source", ["b", "a"]) is True
    assert service.get_worker_load(6, "a") == 6
    assert service.get_worker_load(7, "b") == 4
    assert service.top_workers(8, 5) == ["a(0)", "b(0)"]


CASES = [
    (1, "aceita limite exato e rejeita conclusão repetida", exact_limit),
    (1, "carga é compartilhada entre jobs", shared_load),
    (2, "topWorkers desempata e respeita n", ranking_tie),
    (2, "transferências inválidas não alteram carga", invalid_transfer),
    (3, "detecta ciclo indireto", indirect_cycle),
    (3, "pré-requisito concluído não bloqueia", completed_prerequisite),
    (4, "drenagem impossível é atômica", impossible_drain),
    (4, "drenagem desempata e valida destinos", drain_tie_and_validation),
]
