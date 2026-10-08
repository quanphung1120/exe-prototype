import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { firstValueFrom, take, toArray } from "rxjs"

import { RoomEventsService } from "../src/features/rooms/room-events.service.js"

void test("RoomEventsService fans a room change out to every subscriber", async () => {
  const events = new RoomEventsService()
  const a = firstValueFrom(events.stream().pipe(take(2), toArray()))
  const b = firstValueFrom(events.stream().pipe(take(1), toArray()))

  events.emit("room-1")
  events.emit("room-2")

  assert.deepEqual(await a, [
    { type: "room", data: { roomId: "room-1" } },
    { type: "room", data: { roomId: "room-2" } },
  ])
  assert.deepEqual(await b, [{ type: "room", data: { roomId: "room-1" } }])
})
