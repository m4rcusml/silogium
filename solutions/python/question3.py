"""Q3 — Fazenda de execução de jobs.

Abra questions/q3_build_farm/LEVEL_1.md e preserve as assinaturas públicas.
"""


class BuildFarmService:
    def add_worker(self, worker_id: str, capacity: int) -> bool:
        return False

    def submit_job(
        self, timestamp: int, job_id: str, worker_id: str, cost: int
    ) -> bool:
        return False

    def complete_job(self, timestamp: int, job_id: str) -> bool:
        return False

    def get_worker_load(self, timestamp: int, worker_id: str) -> int | None:
        return None

    def transfer_job(
        self, timestamp: int, job_id: str, target_worker_id: str
    ) -> bool:
        return False

    def top_workers(self, timestamp: int, n: int) -> list[str]:
        return []

    def add_dependency(
        self, timestamp: int, job_id: str, prerequisite_job_id: str
    ) -> bool:
        return False

    def ready_jobs(self, timestamp: int, worker_id: str) -> list[str]:
        return []

    def drain_worker(
        self, timestamp: int, source_worker_id: str, target_worker_ids: list[str]
    ) -> bool:
        return False

    def get_job_history(self, timestamp: int, job_id: str) -> list[str]:
        return []
