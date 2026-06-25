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
          <CardTitle>Dang kiem tra ho so trinh do</CardTitle>
          <CardDescription>
            Chung toi dang doc ket qua da luu tren thiet bi nay.
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
  const completedSports = ASSESSMENTS.filter((definition) =>
    definition.questions.every(
      (question) => typeof answers[definition.sport]?.[question.id] === "string"
    )
  )
  const canFinish = completedSports.length > 0
  const currentDone = completedSports.some(
    (definition) => definition.sport === current.sport
  )
  const hasNextSport = step < ASSESSMENTS.length - 1
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

  const buildAssessment = (): PlayerAssessment => {
    const results = Object.fromEntries(
      completedSports.map((definition) => [
        definition.sport,
        calculateAssessmentResult(definition, answers[definition.sport] ?? {}),
      ])
    ) as PlayerAssessment["results"]

    return {
      version: 1,
      completedAt: new Date().toISOString(),
      results,
    }
  }

  const complete = () => {
    if (!canFinish) return
    const nextAssessment = buildAssessment()
    writeStoredAssessment(nextAssessment)
    onComplete(nextAssessment)
  }

  const next = () => {
    setSubmitted(true)
    if (!canContinue) return
    setSubmitted(false)
    if (hasNextSport) {
      setStep((s) => s + 1)
      return
    }
    complete()
  }

  return (
    <div className="min-h-dvh overflow-y-auto bg-[radial-gradient(circle_at_12%_8%,color-mix(in_oklch,var(--brand)_24%,transparent),transparent_28%),radial-gradient(circle_at_88%_20%,color-mix(in_oklch,var(--chart-3)_24%,transparent),transparent_28%),linear-gradient(145deg,var(--background),var(--muted))] p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 py-4 sm:py-8">
        <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <Card className="lg:sticky lg:top-6 lg:self-start">
            <CardHeader>
              <Badge variant="secondary" className="w-fit">
                Bat buoc truoc khi vao game
              </Badge>
              <CardTitle className="text-2xl sm:text-3xl">
                Danh gia trinh do nguoi choi
              </CardTitle>
              <CardDescription>
                Hoan thanh it nhat 1 mon trong Badminton hoac Pickleball. Ket
                qua duoc luu tren localStorage cua trinh duyet nay.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <Progress value={progress} />
              <div className="grid gap-2">
                {ASSESSMENTS.map((definition, index) => {
                  const done = definition.questions.every(
                    (question) => answers[definition.sport]?.[question.id]
                  )
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
                          {definition.questions.length} cau hoi
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
                  {answeredCount}/{current.questions.length} cau
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
                        Vui long chon mot dap an cho cau nay.
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
                  Quay lai
                </Button>
                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                  {!canContinue && submitted ? (
                    <span className="text-sm text-destructive">
                      Hay tra loi day du truoc khi tiep tuc.
                    </span>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    onClick={complete}
                    disabled={!canFinish}
                  >
                    Hoan thanh va vao app
                  </Button>
                  <Button
                    type="button"
                    className="rounded-full"
                    onClick={next}
                  >
                    {hasNextSport
                      ? "Tiep tuc mon tiep theo"
                      : "Hoan thanh danh gia"}
                  </Button>
                </div>
              </div>
              {currentDone && hasNextSport ? (
                <p className="text-sm text-muted-foreground">
                  Ban da co the vao app ngay, hoac lam tiep mon con lai de co
                  ket qua day du hon.
                </p>
              ) : null}
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
          <p className="font-heading font-semibold">Ket qua danh gia</p>
          <div className="mt-2 grid gap-1 text-sm text-muted-foreground">
            {ASSESSMENTS.map((definition) => {
              const result = assessment.results[definition.sport]
              return (
                <p key={definition.sport}>
                  <span className="font-medium text-foreground">
                    {definition.title}:
                  </span>{" "}
                  {result
                    ? `${result.score} diem - ${result.levelLabel}`
                    : "Chua danh gia"}
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
        Lam lai danh gia
      </Button>
    </div>
  )
}
