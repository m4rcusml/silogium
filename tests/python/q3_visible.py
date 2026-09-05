from solutions.python.question3 import BuildFarmService


def lifecycle_and_capacity() -> None:
    service = BuildFarmService()
    assert service.add_worker("w1", 10) is True
    assert service.submit_job(1, "a", "w1", 6) is True
    assert service.submit_job(2, "b", "w1", 5) is False
    assert service.get_worker_load(3, "w1") == 6
    assert service.complete_job(4, "a") is True
    assert service.get_worker_load(5, "w1") == 0


def invalid_and_reused_ids() -> None:
    service = BuildFarmService()
    assert service.add_worker("", 5) is False
    assert service.add_worker("w", 0) is False
    assert service.add_worker("w", 5) is True
    assert service.add_worker("w", 8) is False
    assert service.submit_job(1, "j", "w", 5) is True
    assert service.complete_job(2, "j") is True
    assert service.submit_job(3, "j", "w", 1) is False
    assert service.get_worker_load(4, "missing") is None


def transfer_and_rank() -> None:
    service = BuildFarmService()
    service.add_worker("a", 10)
    service.add_worker("b", 10)
    service.add_worker("c", 10)
    service.submit_job(1, "j", "a", 4)
    assert service.transfer_job(2, "j", "b") is True
    assert service.complete_job(3, "j") is True
    assert service.top_workers(4, 3) == ["b(4)", "a(0)", "c(0)"]


def atomic_transfer() -> None:
    service = BuildFarmService()
    service.add_worker("a", 10)
    service.add_worker("b", 3)
    service.submit_job(1, "j", "a", 4)
    assert service.transfer_job(2, "j", "b") is False
    assert service.get_worker_load(3, "a") == 4
    assert service.get_worker_load(4, "b") == 0
    assert service.top_workers(5, 2) == ["a(0)", "b(0)"]


def dependency_blocks_completion() -> None:
    service = BuildFarmService()
    service.add_worker("w", 20)
    service.submit_job(1, "base", "w", 3)
    service.submit_job(2, "app", "w", 5)
    assert service.add_dependency(3, "app", "base") is True
    assert service.ready_jobs(4, "w") == ["base"]
    assert service.complete_job(5, "app") is False
    assert service.complete_job(6, "base") is True
    assert service.ready_jobs(7, "w") == ["app"]
    assert service.complete_job(8, "app") is True
    assert service.top_workers(9, 1) == ["w(8)"]


def ready_order_and_cycles() -> None:
    service = BuildFarmService()
    service.add_worker("w", 30)
    service.submit_job(1, "x", "w", 5)
    service.submit_job(2, "y", "w", 5)
    service.submit_job(3, "z", "w", 3)
    assert service.ready_jobs(4, "w") == ["x", "y", "z"]
    assert service.add_dependency(5, "x", "y") is True
    assert service.add_dependency(6, "y", "z") is True
    assert service.add_dependency(7, "z", "x") is False
    assert service.add_dependency(8, "x", "y") is False


def drain_and_history() -> None:
    service = BuildFarmService()
    service.add_worker("source", 20)
    service.add_worker("a", 5)
    service.add_worker("b", 8)
    service.submit_job(1, "j1", "source", 5)
    service.submit_job(2, "j2", "source", 4)
    service.submit_job(3, "j3", "source", 3)
    assert service.drain_worker(4, "source", ["a", "b"]) is True
    assert service.get_worker_load(5, "source") is None
    assert service.get_worker_load(6, "a") == 4
    assert service.get_worker_load(7, "b") == 8
    assert service.get_job_history(8, "j1") == [
        "submitted:source@1",
        "drained:source->b@4",
    ]


def defensive_history() -> None:
    service = BuildFarmService()
    service.add_worker("a", 10)
    service.add_worker("b", 10)
    service.submit_job(1, "pre", "a", 1)
    service.submit_job(2, "job", "a", 2)
    service.add_dependency(3, "job", "pre")
    service.transfer_job(4, "job", "b")
    history = service.get_job_history(5, "job")
    assert history == ["submitted:a@2", "depends-on:pre@3", "transferred:a->b@4"]
    history.append("fake")
    assert service.get_job_history(6, "job") == [
        "submitted:a@2",
        "depends-on:pre@3",
        "transferred:a->b@4",
    ]


CASES = [
    (1, "submete jobs, respeita capacidade e conclui", lifecycle_and_capacity),
    (1, "valida entradas e proíbe reutilização", invalid_and_reused_ids),
    (2, "transfere e credita ao worker que conclui", transfer_and_rank),
    (2, "transferência sem capacidade é atômica", atomic_transfer),
    (3, "dependência bloqueia conclusão", dependency_blocks_completion),
    (3, "readyJobs ordena e ciclos são rejeitados", ready_order_and_cycles),
    (4, "drena pela maior capacidade livre", drain_and_history),
    (4, "histórico inclui eventos e é uma cópia", defensive_history),
]
