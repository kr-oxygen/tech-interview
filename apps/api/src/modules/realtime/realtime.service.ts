import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';
import { candidateRoom, observersRoom } from './rooms';

/**
 * Thin broadcast facade so REST services can push realtime updates
 * without depending on the gateway itself. The gateway attaches the server on init.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;

  attach(server: Server) {
    this.server = server;
  }

  toObservers(sessionId: string, event: string, data: unknown) {
    this.server?.to(observersRoom(sessionId)).emit(event, data);
  }

  toCandidate(sessionId: string, event: string, data: unknown) {
    this.server?.to(candidateRoom(sessionId)).emit(event, data);
  }

  toAll(sessionId: string, event: string, data: unknown) {
    this.server?.to([observersRoom(sessionId), candidateRoom(sessionId)]).emit(event, data);
  }

  /**
   * Force-disconnect every candidate socket of a session (lock / end). Deferred briefly so
   * the pending ack and the final status event reach the client first.
   */
  disconnectCandidate(sessionId: string, delayMs = 250) {
    if (!this.server) return;
    const server = this.server;
    setTimeout(() => {
      this.logger.debug(`Disconnecting candidate sockets of ${sessionId}`);
      server.in(candidateRoom(sessionId)).disconnectSockets(true);
    }, delayMs).unref();
  }
}
