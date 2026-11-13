import { Injectable } from '@nestjs/common';
import type { Socket } from 'socket.io';

/** Tracks connected candidate sockets and pending lock timers per session. */
@Injectable()
export class PresenceService {
  private readonly sockets = new Map<string, Set<Socket>>();
  private readonly lockTimers = new Map<string, NodeJS.Timeout>();

  /** Returns sockets that were already connected for this session (to be replaced). */
  add(sessionId: string, socket: Socket): Socket[] {
    const set = this.sockets.get(sessionId) ?? new Set<Socket>();
    const previous = [...set];
    set.add(socket);
    this.sockets.set(sessionId, set);
    this.cancelLock(sessionId);
    return previous;
  }

  /** Returns true when no candidate socket is left for the session. */
  remove(sessionId: string, socket: Socket): boolean {
    const set = this.sockets.get(sessionId);
    if (!set) return true;
    set.delete(socket);
    if (set.size === 0) this.sockets.delete(sessionId);
    return set.size === 0;
  }

  isConnected(sessionId: string): boolean {
    return (this.sockets.get(sessionId)?.size ?? 0) > 0;
  }

  scheduleLock(sessionId: string, ms: number, fn: () => void) {
    this.cancelLock(sessionId);
    const t = setTimeout(() => {
      this.lockTimers.delete(sessionId);
      if (!this.isConnected(sessionId)) fn();
    }, ms);
    t.unref();
    this.lockTimers.set(sessionId, t);
  }

  cancelLock(sessionId: string) {
    const t = this.lockTimers.get(sessionId);
    if (t) clearTimeout(t);
    this.lockTimers.delete(sessionId);
  }
}
