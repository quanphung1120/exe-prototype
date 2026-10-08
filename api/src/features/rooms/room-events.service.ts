import { Injectable, type MessageEvent } from "@nestjs/common"
import { interval, map, merge, Subject, type Observable } from "rxjs"

/** How often an idle stream sends a keep-alive, so proxies don't drop it. */
const HEARTBEAT_MS = 25_000

/**
 * In-process fan-out of "a room changed" signals to every connected client
 * (`GET /api/rooms/events`, server-sent events). A signal carries only the
 * room id — clients refetch `GET /api/rooms` for the data, so the stream
 * never leaks anything the rooms list doesn't already show. Single-instance
 * by design (the api runs as one process); a multi-instance deploy would
 * need a shared pub/sub behind this.
 */
@Injectable()
export class RoomEventsService {
  private readonly changes = new Subject<string>()

  /** Announce that a room was created, changed, or removed. */
  emit(roomId: string): void {
    this.changes.next(roomId)
  }

  /** The event stream for one subscriber: room changes plus heartbeats. */
  stream(): Observable<MessageEvent> {
    return merge(
      this.changes.pipe(map((roomId) => ({ type: "room", data: { roomId } }))),
      interval(HEARTBEAT_MS).pipe(map(() => ({ type: "ping", data: "" })))
    )
  }
}
