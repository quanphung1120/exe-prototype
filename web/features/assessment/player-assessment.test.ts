import { describe, expect, it } from "vitest"

import {
  ASSESSMENTS,
  answerKeys,
  calculateAssessmentResult,
  isCompleteAssessment,
} from "@/features/assessment/player-assessment"

const badminton = ASSESSMENTS[0]
const question = (id: string) => badminton.questions.find((q) => q.id === id)!

describe("multiple-choice questions", () => {
  it("only the 'những …' question takes several answers", () => {
    expect(
      badminton.questions.filter((q) => q.multiple).map((q) => q.id)
    ).toEqual(["q3"])
  })

  it("splits a stored answer into keys", () => {
    expect(answerKeys("B,C")).toEqual(["B", "C"])
    expect(answerKeys("A")).toEqual(["A"])
    expect(answerKeys(undefined)).toEqual([])
  })

  it("scores a multi-answer question by its highest selected answer", () => {
    const base = { q1: "A", q2: "A", q4: "A", q5: "A" }
    const single = calculateAssessmentResult(badminton, { ...base, q3: "C" })
    const multi = calculateAssessmentResult(badminton, { ...base, q3: "B,C" })
    expect(multi.score).toBe(single.score)
    expect(
      calculateAssessmentResult(badminton, { ...base, q3: "B,E" }).score
    ).toBe(4 + 5)
  })

  it("accepts several keys only for a multi-answer question", () => {
    const answers = { q1: "A", q2: "A", q3: "B,C", q4: "A", q5: "A" }
    const result = calculateAssessmentResult(badminton, answers)
    const assessment = {
      version: 1,
      completedAt: "2026-10-12T00:00:00.000Z",
      selectedSports: ["badminton"],
      results: { badminton: result },
    }
    expect(isCompleteAssessment(assessment)).toBe(true)
    const bad = {
      ...assessment,
      results: {
        badminton: { ...result, answers: { ...answers, q1: "A,B" } },
      },
    }
    expect(isCompleteAssessment(bad)).toBe(false)
    expect(question("q3").multiple).toBe(true)
  })
})
