import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { Test } from "@nestjs/testing"
import { getModelToken } from "@nestjs/mongoose"

import { PlayerAssessment } from "../src/features/assessment/assessment.schema.js"
import { AssessmentService } from "../src/features/assessment/assessment.service.js"
import type { PlayerAssessment as PlayerAssessmentData } from "../src/shared/index.js"

async function makeService(data: PlayerAssessmentData | null) {
  const modelMock = {
    findOne: () => ({
      lean: () => Promise.resolve(data ? { userId: "u1", data } : null),
    }),
  }
  const moduleRef = await Test.createTestingModule({
    providers: [
      AssessmentService,
      { provide: getModelToken(PlayerAssessment.name), useValue: modelMock },
    ],
  }).compile()
  return moduleRef.get(AssessmentService)
}

void test("getPublicLevels exposes level and score but never the answers", async () => {
  const service = await makeService({
    version: 1,
    completedAt: "2026-10-01T00:00:00.000Z",
    selectedSports: ["badminton"],
    results: {
      badminton: {
        sport: "badminton",
        score: 62,
        levelLabel: "Trung bình",
        bucket: "intermediate",
        answers: { q1: "b" },
      },
    },
  })

  assert.deepEqual(await service.getPublicLevels("u1"), [
    { sport: "badminton", level: "intermediate", score: 62 },
  ])
})

void test("getPublicLevels is empty for a player who hasn't taken the assessment", async () => {
  const service = await makeService(null)
  assert.deepEqual(await service.getPublicLevels("u1"), [])
})
