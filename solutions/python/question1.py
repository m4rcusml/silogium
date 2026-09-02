"""Q1 — Rede de armários de encomendas.

Abra questions/q1_parcel_network/LEVEL_1.md e preserve as assinaturas públicas.
"""


class ParcelLockerService:
    def add_locker(self, locker_id: str, capacity: int) -> bool:
        return False

    def store_parcel(
        self, timestamp: int, parcel_id: str, locker_id: str, size: int
    ) -> bool:
        return False

    def collect_parcel(self, timestamp: int, parcel_id: str) -> bool:
        return False

    def get_load(self, timestamp: int, locker_id: str) -> int | None:
        return None

    def move_parcel(
        self, timestamp: int, parcel_id: str, target_locker_id: str
    ) -> bool:
        return False

    def top_lockers(self, timestamp: int, n: int) -> list[str]:
        return []

    def schedule_move(
        self,
        timestamp: int,
        parcel_id: str,
        target_locker_id: str,
        execute_at: int,
    ) -> str | None:
        return None

    def cancel_scheduled_move(self, timestamp: int, move_id: str) -> bool:
        return False

    def process_scheduled(self, timestamp: int) -> list[str]:
        return []

    def merge_lockers(
        self, timestamp: int, source_locker_id: str, target_locker_id: str
    ) -> bool:
        return False

    def get_parcel_history(self, timestamp: int, parcel_id: str) -> list[str]:
        return []
