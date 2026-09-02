/**
 * Q1 — Rede de armários de encomendas.
 *
 * Abra questions/q1_parcel_network/LEVEL_1.md e implemente somente o nível
 * atualmente desbloqueado. Preserve todas as assinaturas públicas.
 */
export class ParcelLockerService {
  addLocker(lockerId: string, capacity: number): boolean {
    return false;
  }

  storeParcel(timestamp: number, parcelId: string, lockerId: string, size: number): boolean {
    return false;
  }

  collectParcel(timestamp: number, parcelId: string): boolean {
    return false;
  }

  getLoad(timestamp: number, lockerId: string): number | null {
    return null;
  }

  moveParcel(timestamp: number, parcelId: string, targetLockerId: string): boolean {
    return false;
  }

  topLockers(timestamp: number, n: number): string[] {
    return [];
  }

  scheduleMove(
    timestamp: number,
    parcelId: string,
    targetLockerId: string,
    executeAt: number
  ): string | null {
    return null;
  }

  cancelScheduledMove(timestamp: number, moveId: string): boolean {
    return false;
  }

  processScheduled(timestamp: number): string[] {
    return [];
  }

  mergeLockers(timestamp: number, sourceLockerId: string, targetLockerId: string): boolean {
    return false;
  }

  getParcelHistory(timestamp: number, parcelId: string): string[] {
    return [];
  }
}
