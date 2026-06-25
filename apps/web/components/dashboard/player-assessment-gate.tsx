"use client"

import * as React from "react"
import { CheckCircle2, RotateCcw, Trophy } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { usePathname } from "@/i18n/navigation"
import { cn } from "@/lib/utils"
import { workspaceForPath } from "@/components/dashboard/workspace"
import {
  ASSESSMENTS,
  PLAYER_ASSESSMENT_UPDATED_EVENT,
  calculateAssessmentResult,
  clearStoredAssessment,
  readStoredAssessment,
  writeStoredAssessment,
  type AssessmentDefinition,
  type PlayerAssessment,
} from "@/lib/player-assessment"

interface PlayerAssessmentGateProps {
  children: React.ReactNode
}

type DraftAnswers = Record<string, Record<string, string>>

export function PlayerAssessmentGate({ children }: PlayerAssessmentGateProps) {
  const pathname = usePathname()
  const needsAssessment = workspaceForPath(pathname) !== "venue"
  const [ready, setReady] = React.useState(false)
  const [assessment, setAssessment] =
    React.useState<PlayerAssessment | null>(null)

  React.useEffect(() => {
    if (!needsAssessment) {
      setReady(true)
      return
    }
    const sync = () => {
      setAssessment(readStoredAssessment())
      setReady(true)
    }
    sync()
    window.addEventListener("storage", sync)
    window.addEventListener(PLAYER_ASSESSMENT_UPDATED_EVENT, sync)
    return () => {
      window.removeEventListener("storage", sync)
      window.removeEventListener(PLAYER_ASSESSMENT_UPDATED_EVENT, sync)
    }
  }, [needsAssessment])

  if (!needsAssessment) return <>{children}</>
  if (!ready) return <AssessmentLoading />
  if (!assessment) {
    return <PlayerAssessmentScreen onComplete={setAssessment} />
  }

  return <>{children}</>
}

function AssessmentLoading() {
  return (
    <div className="grid min-h-dvh place-items-center bg-[radial-gradient(circle_at_top_left,color-mix(in_oklch,var(--brand)_18%,transparent),transparent_34%),linear-gradient(135deg,var(--background),var(--muted))] p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Đang kiểm tra hồ sơ trình độ</CardTitle>
          <CardDescription>
            Chúng tôi đang đọc kết quả đã lưu trên thiết bị này.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={55} />
        </CardContent>
      </Card>
    </div>
  )
}

function PlayerAssessmentScreen({
  onComplete,
}: {
  onComplete: (assessment: PlayerAssessment) => void
}) {
  const [step, setStep] = React.useState(0)
  const [answers, setAnswers] = React.useState<DraftAnswers>({})
  const [submitted, setSubmitted] = React.useState(false)

  const current = ASSESSMENTS[step]
  const currentAnswers = answers[current.sport] ?? {}
  const answeredCount = current.questions.filter(
    (question) => currentAnswers[question.id]
  ).length
  const canContinue = answeredCount === current.questions.length
  const progress =
    ((step + answeredCount / current.questions.length) / ASSESSMENTS.length) *
    100

  const setAnswer = (
    definition: AssessmentDefinition,
    questionId: string,
    answerKey: string
  ) => {
    setSubmitted(false)
    setAnswers((prev) => ({
      ...prev,
      [definition.sport]: {
        ...(prev[definition.sport] ?? {}),
        [questionId]: answerKey,
      },
    }))
  }

  const next = () => {
    setSubmitted(true)
    if (!canContinue) return
    setSubmitted(false)
    if (step < ASSESSMENTS.length - 1) {
      setStep((s) => s + 1)
      return
    }

    const results = Object.fromEntries(
      ASSESSMENTS.map((definition) => [
        definition.sport,
        calculateAssessmentResult(definition, answers[definition.sport] ?? {}),
      ])
    ) as PlayerAssessment["results"]
    const nextAssessment: PlayerAssessment = {
      version: 1,
      completedAt: new Date().toISOString(),
      results,
    }
    writeStoredAssessment(nextAssessment)
    onComplete(nextAssessment)
  }

  return (
    <div className="min-h-dvh overflow-y-auto bg-[radial-gradient(circle_at_12%_8%,color-mix(in_oklch,var(--brand)_24%,transparent),transparent_28%),radial-gradient(circle_at_88%_20%,color-mix(in_oklch,var(--chart-3)_24%,transparent),transparent_28%),linear-gradient(145deg,var(--background),var(--muted))] p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 py-4 sm:py-8">
        <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <Card className="lg:sticky lg:top-6 lg:self-start">
            <CardHeader>
              <Badge variant="secondary" className="w-fit">
                Bắt buộc trước khi vào game
              </Badge>
              <CardTitle className="text-2xl sm:text-3xl">
                Đánh giá trình độ người chơi
              </CardTitle>
              <CardDescription>
                Hoàn thành cả Badminton và Pickleball. Kết quả được lưu trên
                localStorage của trình duyệt này.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <Progress value={progress} />
              <div className="grid gap-2">
                {ASSESSMENTS.map((definition, index) => {
                  const done =
                    definition.questions.every(
                      (question) => answers[definition.sport]?.[question.id]
                    ) && index < step
                  const active = index === step
                  return (
                    <button
                      key={definition.sport}
                      type="button"
                      onClick={() => setStep(index)}
                      className={cn(
                        "flex items-center justify-between rounded-3xl border p-3 text-left transition-colors",
                        active
                          ? "border-brand/40 bg-brand/10"
                          : "border-border bg-card/70 hover:bg-muted/70"
                      )}
                    >
                      <span>
                        <span className="block font-heading font-semibold">
                          {definition.title}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {definition.questions.length} câu hỏi
                        </span>
                      </span>
                      {done ? (
                        <CheckCircle2 className="size-5 text-brand" />
                      ) : (
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {index + 1}/{ASSESSMENTS.length}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>{current.title}</CardTitle>
                  <CardDescription>{current.description}</CardDescription>
                </div>
                <Badge variant="outline">
                  {answeredCount}/{current.questions.length} câu
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {current.questions.map((question, index) => {
                const missing = submitted && !currentAnswers[question.id]
                return (
                  <fieldset
                    key={question.id}
                    className={cn(
                      "rounded-4xl border p-4",
                      missing
                        ? "border-destructive/45 bg-destructive/5"
                        : "border-border bg-background/65"
                    )}
                  >
                    <legend className="px-1 font-heading font-semibold">
                      {index + 1}. {question.text}
                    </legend>
                    <div className="mt-3 grid gap-2">
                      {question.answers.map((answer) => {
                        const selected =
                          currentAnswers[question.id] === answer.key
                        return (
                          <label
                            key={answer.key}
                            className={cn(
                              "flex cursor-pointer gap-3 rounded-3xl border p-3 transition-colors",
                              selected
                                ? "border-brand/45 bg-brand/10"
                                : "border-border bg-card hover:bg-muted/60"
                            )}
                          >
                            <input
                              type="radio"
                              name={`${current.sport}-${question.id}`}
                              value={answer.key}
                              checked={selected}
                              onChange={() =>
                                setAnswer(current, question.id, answer.key)
                              }
                              className="mt-1"
                            />
                            <span className="min-w-0">
                              <span className="font-semibold">
                                {answer.key}.
                              </span>{" "}
                              {answer.text}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                    {missing ? (
                      <p className="mt-2 text-sm text-destructive">
                        Vui lòng chọn một đáp án cho câu này.
                      </p>
                    ) : null}
                  </fieldset>
                )
              })}

              <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  disabled={step === 0}
                  onClick={() => {
                    setSubmitted(false)
                    setStep((s) => Math.max(0, s - 1))
                  }}
                >
                  Quay lại
                </Button>
                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                  {!canContinue && submitted ? (
                    <span className="text-sm text-destructive">
                      Hãy trả lời đầy đủ trước khi tiếp tục.
                    </span>
                  ) : null}
                  <Button
                    type="button"
                    className="rounded-full"
                    onClick={next}
                  >
                    {step === ASSESSMENTS.length - 1
                      ? "Hoàn thành đánh giá"
                      : "Tiếp tục"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export function ResetPlayerAssessmentButton({
  className,
}: {
  className?: string
}) {
  const [assessment, setAssessment] =
    React.useState<PlayerAssessment | null>(null)

  React.useEffect(() => {
    const sync = () => setAssessment(readStoredAssessment())
    sync()
    window.addEventListener("storage", sync)
    window.addEventListener(PLAYER_ASSESSMENT_UPDATED_EVENT, sync)
    return () => {
      window.removeEventListener("storage", sync)
      window.removeEventListener(PLAYER_ASSESSMENT_UPDATED_EVENT, sync)
    }
  }, [])

  if (!assessment) return null

  return (
    <div
      className={cn(
        "rounded-3xl bg-muted/40 p-4 ring-1 ring-foreground/5 dark:ring-foreground/10",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand/12 text-brand">
          <Trophy className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading font-semibold">Kết quả đánh giá</p>
          <div className="mt-2 grid gap-1 text-sm text-muted-foreground">
            {ASSESSMENTS.map((definition) => {
              const result = assessment.results[definition.sport]
              return (
                <p key={definition.sport}>
                  <span className="font-medium text-foreground">
                    {definition.title}:
                  </span>{" "}
                  {result.score} điểm - {result.levelLabel}
                </p>
              )
            })}
          </div>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        className="mt-4 w-full rounded-full"
        onClick={clearStoredAssessment}
      >
        <RotateCcw className="size-4" />
        Làm lại đánh giá
      </Button>
    </div>
  )
}
