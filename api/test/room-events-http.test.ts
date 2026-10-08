import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { Test } from "@nestjs/testing"

import { RoomEventsService } from "../src/features/rooms/room-events.service.js"
import { RoomsController } from "../src/features/rooms/rooms.controller.js"
import { RoomsService } from "../src/features/rooms/rooms.service.js"

/**
 * End-to-end over real HTTP: `GET /rooms/events` must stream a
 * server-sent `room` event when a room changes (auth is the global guard's
 * job and is covered by auth.test.ts, so it isn't wired here).
 */
void test("GET /rooms/events streams a room event over SSE", async () => {
  const moduleRef = await Test.createTestingModule({
    controllers: [RoomsController],
    providers: [RoomEventsService, { provide: RoomsService, useValue: {} }],
  }).compile()
  const app = moduleRef.createNestApplication({ logger: false })
  await app.listen(0)
  const baseUrl = await app.getUrl()
  const controller = new AbortController()

  try {
    const res = await fetch(`${baseUrl}/rooms/events`, {
      signal: controller.signal,
    })
    assert.equal(res.status, 200)
    assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/)

    app.get(RoomEventsService).emit("room-42")

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let text = ""
    while (!text.includes("\n\n")) {
      const { value, done } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
    }
    assert.match(text, /event: room/)
    assert.match(text, /data: \{"roomId":"room-42"\}/)
  } finally {
    controller.abort()
    await app.close()
  }
})
