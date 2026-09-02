"""Q2 — Reservas de coworking.

Abra questions/q2_room_reservations/LEVEL_1.md e preserve as assinaturas públicas.
"""


class RoomReservationService:
    def add_room(self, room_id: str, capacity: int) -> bool:
        return False

    def book(
        self,
        timestamp: int,
        booking_id: str,
        room_id: str,
        user_id: str,
        start: int,
        end: int,
        attendees: int,
    ) -> bool:
        return False

    def cancel(self, timestamp: int, booking_id: str) -> bool:
        return False

    def room_schedule(self, timestamp: int, room_id: str) -> list[str]:
        return []

    def available_rooms(
        self, timestamp: int, start: int, end: int, attendees: int
    ) -> list[str]:
        return []

    def top_users(self, timestamp: int, n: int) -> list[str]:
        return []

    def join_waitlist(
        self,
        timestamp: int,
        request_id: str,
        room_id: str,
        user_id: str,
        start: int,
        end: int,
        attendees: int,
    ) -> bool:
        return False

    def cancel_waitlist(self, timestamp: int, request_id: str) -> bool:
        return False

    def get_waitlist(self, timestamp: int, room_id: str) -> list[str]:
        return []

    def book_series(
        self,
        timestamp: int,
        series_id: str,
        room_id: str,
        user_id: str,
        starts: list[int],
        duration: int,
        attendees: int,
    ) -> bool:
        return False

    def cancel_series(self, timestamp: int, series_id: str) -> int:
        return 0
