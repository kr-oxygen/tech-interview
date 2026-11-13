import { Injectable } from '@nestjs/common';

/**
 * Serialises work per session (candidate events, lock, end, task switch) so that
 * document state and sequence numbers follow arrival order. Single-instance only.
 */
@Injectable()
export class SessionQueue {
  private readonly tails = new Map<string, Promise<unknown>>();

  run<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(sessionId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    const tail = next.catch(() => undefined);
    this.tails.set(sessionId, tail);
    void tail.then(() => {
      if (this.tails.get(sessionId) === tail) this.tails.delete(sessionId);
    });
    return next;
  }
}
