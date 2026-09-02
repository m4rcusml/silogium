/**
 * Q2 — Reservas de coworking.
 *
 * Abra questions/q2_room_reservations/LEVEL_1.md e implemente somente o nível
 * atualmente desbloqueado. Preserve todas as assinaturas públicas.
 */
export class RoomReservationService {
  addRoom(roomId: string, capacity: number): boolean {
    return false;
  }

  book(
    timestamp: number,
    bookingId: string,
    roomId: string,
    userId: string,
    start: number,
    end: number,
    attendees: number
  ): boolean {
    return false;
  }

  cancel(timestamp: number, bookingId: string): boolean {
    return false;
  }

  roomSchedule(timestamp: number, roomId: string): string[] {
    return [];
  }

  availableRooms(timestamp: number, start: number, end: number, attendees: number): string[] {
    return [];
  }

  topUsers(timestamp: number, n: number): string[] {
    return [];
  }

  joinWaitlist(
    timestamp: number,
    requestId: string,
    roomId: string,
    userId: string,
    start: number,
    end: number,
    attendees: number
  ): boolean {
    return false;
  }

  cancelWaitlist(timestamp: number, requestId: string): boolean {
    return false;
  }

  getWaitlist(timestamp: number, roomId: string): string[] {
    return [];
  }

  bookSeries(
    timestamp: number,
    seriesId: string,
    roomId: string,
    userId: string,
    starts: number[],
    duration: number,
    attendees: number
  ): boolean {
    return false;
  }

  cancelSeries(timestamp: number, seriesId: string): number {
    return 0;
  }
}
