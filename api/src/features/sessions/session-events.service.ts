import { Injectable, type MessageEvent } from "@nestjs/common"
import { interval, map, merge, Subject, type Observable } from "rxjs"

const HEARTBEAT_MS = 25_000

/**
 * Per-user fan-out of "your sessions changed" signals (`GET /api/sessions/events`,
 * server-sent events). Maintains one RxJS Subject per connected userId so only
 * the affected player's stream fires — no cross-user data leaks.
 *
 * Each SSE stream carries only a ping so the client knows to re-fetch
 * `GET /api/sessions` — the payload is never sent over the wire.
 */
@Injectable()
export class SessionEventsService {
  private readonly subjects = new Map<string, Subject<void>>()

  private subjectFor(userId: string): Subject<void> {
    let s = this.subjects.get(userId)
    if (!s) {
      s = new Subject<void>()
      this.subjects.set(userId, s)
    }
    return s
  }

  /** Notify a specific player that their sessions may have changed. */
  emit(userId: string): void {
    this.subjects.get(userId)?.next()
  }

  /** The SSE stream for one signed-in player: session events + heartbeats. */
  stream(userId: string): Observable<MessageEvent> {
    return merge(
      this.subjectFor(userId).pipe(
        map(() => ({ type: "session", data: "" }))
      ),
      interval(HEARTBEAT_MS).pipe(map(() => ({ type: "ping", data: "" })))
    )
  }
}
