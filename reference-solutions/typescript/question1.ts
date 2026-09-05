/**
 * Solução de referência da Q1 — Rede de armários de encomendas.
 *
 * Implementação completa dos quatro níveis, preservada como exemplo de
 * modelagem, atomicidade e organização de estado em TypeScript.
 */

interface Locker {
  capacity: number;
  load: number;
  activity: number;
}

interface Parcel {
  size: number;
  lockerId: string | null;
  history: string[];
}

interface ScheduledMove {
  id: string;
  parcelId: string;
  targetLockerId: string;
  executeAt: number;
  creationOrder: number;
}

export class ParcelLockerService {
  private readonly lockers = new Map<string, Locker>();
  private readonly parcels = new Map<string, Parcel>();
  private readonly scheduledMoves = new Map<string, ScheduledMove>();
  private readonly pendingMoveByParcel = new Map<string, string>();
  private nextMoveNumber = 1;

  addLocker(lockerId: string, capacity: number): boolean {
    if (lockerId.length === 0 || !Number.isInteger(capacity) || capacity <= 0) {
      return false;
    }
    if (this.lockers.has(lockerId)) return false;

    this.lockers.set(lockerId, { capacity, load: 0, activity: 0 });
    return true;
  }

  storeParcel(timestamp: number, parcelId: string, lockerId: string, size: number): boolean {
    if (parcelId.length === 0 || !Number.isInteger(size) || size <= 0) return false;
    if (this.parcels.has(parcelId)) return false;

    const locker = this.lockers.get(lockerId);
    if (!locker || locker.load + size > locker.capacity) return false;

    this.parcels.set(parcelId, {
      size,
      lockerId,
      history: [`stored:${lockerId}@${timestamp}`]
    });
    locker.load += size;
    locker.activity += size;
    return true;
  }

  collectParcel(timestamp: number, parcelId: string): boolean {
    const parcel = this.parcels.get(parcelId);
    if (!parcel || parcel.lockerId === null || this.pendingMoveByParcel.has(parcelId)) {
      return false;
    }

    const lockerId = parcel.lockerId;
    const locker = this.lockers.get(lockerId);
    if (!locker) return false;

    locker.load -= parcel.size;
    locker.activity += parcel.size;
    parcel.history.push(`collected:${lockerId}@${timestamp}`);
    parcel.lockerId = null;
    return true;
  }

  getLoad(timestamp: number, lockerId: string): number | null {
    return this.lockers.get(lockerId)?.load ?? null;
  }

  moveParcel(timestamp: number, parcelId: string, targetLockerId: string): boolean {
    if (this.pendingMoveByParcel.has(parcelId)) return false;
    return this.executeMove(timestamp, parcelId, targetLockerId);
  }

  topLockers(timestamp: number, n: number): string[] {
    if (n <= 0) return [];

    return [...this.lockers.entries()]
      .sort(([leftId, left], [rightId, right]) => {
        if (left.activity !== right.activity) return right.activity - left.activity;
        if (leftId < rightId) return -1;
        if (leftId > rightId) return 1;
        return 0;
      })
      .slice(0, n)
      .map(([lockerId, locker]) => `${lockerId}(${locker.activity})`);
  }

  scheduleMove(
    timestamp: number,
    parcelId: string,
    targetLockerId: string,
    executeAt: number
  ): string | null {
    const parcel = this.parcels.get(parcelId);
    if (
      executeAt <= timestamp ||
      !parcel ||
      parcel.lockerId === null ||
      this.pendingMoveByParcel.has(parcelId) ||
      !this.lockers.has(targetLockerId) ||
      parcel.lockerId === targetLockerId
    ) {
      return null;
    }

    const creationOrder = this.nextMoveNumber;
    const id = `move-${creationOrder}`;
    this.nextMoveNumber += 1;

    this.scheduledMoves.set(id, {
      id,
      parcelId,
      targetLockerId,
      executeAt,
      creationOrder
    });
    this.pendingMoveByParcel.set(parcelId, id);
    return id;
  }

  cancelScheduledMove(timestamp: number, moveId: string): boolean {
    const scheduledMove = this.scheduledMoves.get(moveId);
    if (!scheduledMove) return false;

    this.scheduledMoves.delete(moveId);
    this.pendingMoveByParcel.delete(scheduledMove.parcelId);
    return true;
  }

  processScheduled(timestamp: number): string[] {
    const dueMoves = [...this.scheduledMoves.values()]
      .filter((move) => move.executeAt <= timestamp)
      .sort(
        (left, right) =>
          left.executeAt - right.executeAt || left.creationOrder - right.creationOrder
      );

    const successfulMoveIds: string[] = [];
    for (const move of dueMoves) {
      // A tentativa deixa de estar pendente mesmo quando falha por capacidade.
      this.scheduledMoves.delete(move.id);
      this.pendingMoveByParcel.delete(move.parcelId);

      if (this.executeMove(timestamp, move.parcelId, move.targetLockerId)) {
        successfulMoveIds.push(move.id);
      }
    }

    return successfulMoveIds;
  }

  mergeLockers(timestamp: number, sourceLockerId: string, targetLockerId: string): boolean {
    if (sourceLockerId === targetLockerId) return false;

    const source = this.lockers.get(sourceLockerId);
    const target = this.lockers.get(targetLockerId);
    if (!source || !target || target.load + source.load > target.capacity) return false;

    // Todas as validações ocorreram; a partir daqui a fusão pode ser aplicada.
    for (const parcel of this.parcels.values()) {
      if (parcel.lockerId !== sourceLockerId) continue;

      parcel.lockerId = targetLockerId;
      parcel.history.push(`merged:${sourceLockerId}->${targetLockerId}@${timestamp}`);
    }

    target.load += source.load;
    target.activity += source.activity;
    this.lockers.delete(sourceLockerId);

    for (const move of this.scheduledMoves.values()) {
      if (move.targetLockerId === sourceLockerId) {
        move.targetLockerId = targetLockerId;
      }
    }

    return true;
  }

  getParcelHistory(timestamp: number, parcelId: string): string[] {
    const parcel = this.parcels.get(parcelId);
    return parcel ? [...parcel.history] : [];
  }

  private executeMove(timestamp: number, parcelId: string, targetLockerId: string): boolean {
    const parcel = this.parcels.get(parcelId);
    const target = this.lockers.get(targetLockerId);
    if (!parcel || parcel.lockerId === null || !target || parcel.lockerId === targetLockerId) {
      return false;
    }

    const sourceLockerId = parcel.lockerId;
    const source = this.lockers.get(sourceLockerId);
    if (!source || target.load + parcel.size > target.capacity) return false;

    source.load -= parcel.size;
    target.load += parcel.size;
    source.activity += parcel.size;
    target.activity += parcel.size;
    parcel.lockerId = targetLockerId;
    parcel.history.push(`moved:${sourceLockerId}->${targetLockerId}@${timestamp}`);
    return true;
  }
}
