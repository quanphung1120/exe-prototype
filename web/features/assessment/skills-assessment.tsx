"use client"

import * as React from "react"
import { ArrowRight } from "lucide-react"
import { LogoMark } from "@/components/logo"

import { Button } from "@/components/ui/button"
import { LocaleSwitcher } from "@/components/locale-switcher"
import { useTranslations } from "next-intl"
import { useRouter } from "@/i18n/navigation"
import { cn } from "@/lib/utils"
import {
  ASSESSMENTS,
  calculateAssessmentResult,
  getRangeIndex,
  readStoredAssessment,
  writeStoredAssessment,
  type AssessmentDefinition,
  type AssessmentSport,
  type PlayerAssessment,
} from "@/features/assessment/player-assessment"
import { saveAssessment } from "@/features/assessment/assessment-actions"

type DraftAnswers = Record<string, Record<string, string>>

const SPORT_EMOJI: Record<AssessmentSport, string> = {
  badminton: "🏸",
}

/** The app is badminton-only, so the assessment is a single questionnaire. */
const SPORT: AssessmentSport = "badminton"

export function SkillsAssessmentView({
  initial = null,
  nextPath = "/app",
}: {
  /** The player's server-persisted assessment (Mongo), passed by the page. */
  initial?: PlayerAssessment | null
  /** Where the completion CTA routes to — `/setup` when a venue is still owed. */
  nextPath?: string
} = {}) {
  const t = useTranslations("Assessment")
  const router = useRouter()

  const [answers, setAnswers] = React.useState<DraftAnswers>({})
  const [submitted, setSubmitted] = React.useState(false)
  const [completed, setCompleted] = React.useState<PlayerAssessment | null>(
    null
  )

  // Pre-populate from any saved assessment so a retake starts from the
  // previous answers. The server-persisted value (Mongo, via the page) wins
  // over the local cache and is mirrored into localStorage so the dashboard's
  // synchronous readers agree.
  React.useEffect(() => {
    const timer = setTimeout(() => {
      const existing = initial ?? readStoredAssessment()
      if (!existing) return
      if (initial) writeStoredAssessment(initial)
      const saved = existing.results[SPORT]?.answers
      if (saved) setAnswers({ [SPORT]: saved })
    }, 0)
    return () => clearTimeout(timer)
  }, [initial])

  const current = ASSESSMENTS.find((a) => a.sport === SPORT)
  const currentAnswers = current ? (answers[current.sport] ?? {}) : {}
  const answeredCount = current
    ? current.questions.filter((q) => currentAnswers[q.id]).length
    : 0

  const progress = current
    ? (answeredCount / current.questions.length) * 100
    : 0

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

  const finish = () => {
    if (!current) return

    const done =
      current.questions.filter((q) => currentAnswers[q.id]).length ===
      current.questions.length
    if (!done) {
      setSubmitted(true)
      return
    }

    const existing = readStoredAssessment()
    const mergedResults = {
      ...(existing?.results ?? {}),
      [SPORT]: calculateAssessmentResult(current, currentAnswers),
    } as PlayerAssessment["results"]

    const nextAssessment: PlayerAssessment = {
      version: 1,
      completedAt: new Date().toISOString(),
      selectedSports: [SPORT],
      results: mergedResults,
    }
    writeStoredAssessment(nextAssessment)
    // Persist to Mongo (per Clerk user) so the assessment survives a
    // device/browser switch. Fire-and-forget — the local cache above already
    // drives the UI; a failed write just means a cold load falls back to cache.
    void saveAssessment(nextAssessment).catch((error) => {
      console.error("Failed to persist assessment", error)
    })
    setCompleted(nextAssessment)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[radial-gradient(circle_at_12%_8%,color-mix(in_oklch,var(--brand)_22%,transparent),transparent_30%),radial-gradient(circle_at_88%_12%,color-mix(in_oklch,var(--chart-3)_22%,transparent),transparent_32%),linear-gradient(150deg,var(--background),var(--muted))]">
      {/* Invisible navbar — language + theme controls */}
      <nav className="flex shrink-0 items-center justify-end gap-0.5 px-4 pt-3 sm:px-6">
        <LocaleSwitcher />
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 py-6 sm:px-6 sm:py-10">
          {completed ? (
            <CompletionScreen
              assessment={completed}
              nextPath={nextPath}
              onEnter={() => router.replace(nextPath)}
            />
          ) : (
            <>
              <header className="flex flex-col gap-5">
                <div className="flex items-center gap-3">
                  <div className="min-w-0">
                    <h1 className="font-heading text-xl font-bold sm:text-2xl">
                      {t("gate.title")}
                    </h1>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {t("gate.requiredBadge")}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-end text-xs text-muted-foreground">
                    {current ? (
                      <span className="tabular-nums">
                        {t("progress.answered", {
                          answered: answeredCount,
                          total: current.questions.length,
                        })}
                      </span>
                    ) : null}
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand to-lime transition-[width] duration-500 ease-out"
                      style={{ width: `${Math.max(progress, 4)}%` }}
                    />
                  </div>
                </div>
              </header>

              <main className="mt-7 flex-1">
                {current ? (
                  <QuestionsStep
                    definition={current}
                    answers={currentAnswers}
                    submitted={submitted}
                    onAnswer={setAnswer}
                  />
                ) : null}
              </main>

              <footer className="mt-8 flex items-center justify-end gap-3 border-t pt-5">
                <Button
                  type="button"
                  className="rounded-full px-6"
                  onClick={finish}
                >
                  {t("actions.complete")}
                </Button>
              </footer>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function QuestionsStep({
  definition,
  answers,
  submitted,
  onAnswer,
}: {
  definition: AssessmentDefinition
  answers: Record<string, string>
  submitted: boolean
  onAnswer: (
    definition: AssessmentDefinition,
    questionId: string,
    answerKey: string
  ) => void
}) {
  const t = useTranslations("Assessment")
  const tc = useTranslations("Common")

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{SPORT_EMOJI[definition.sport]}</span>
        <div>
          <h2 className="font-heading text-lg font-bold">
            {tc(`sports.${definition.sport}`)}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(`${definition.sport}.description`)}
          </p>
        </div>
      </div>

      {definition.questions.map((question, index) => {
        const missing = submitted && !answers[question.id]
        return (
          <fieldset
            key={question.id}
            className={cn(
              "rounded-3xl border p-4 transition-colors sm:p-5",
              missing
                ? "border-destructive/45 bg-destructive/5"
                : "border-border bg-card/70"
            )}
          >
            <legend className="flex items-baseline gap-2 px-1 font-heading font-semibold">
              <span className="text-brand tabular-nums">{index + 1}.</span>
              <span>
                {t(`${definition.sport}.questions.${question.id}.text`)}
              </span>
            </legend>
            <div className="mt-3 grid gap-2">
              {question.answers.map((answer) => {
                const selected = answers[question.id] === answer.key
                return (
                  <label
                    key={answer.key}
                    className={cn(
                      "relative flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition-all duration-200",
                      selected
                        ? "border-brand/50 bg-brand/10 shadow-sm"
                        : "border-border bg-background hover:border-brand/30 hover:bg-muted/50"
                    )}
                  >
                    <input
                      type="radio"
                      name={`${definition.sport}-${question.id}`}
                      value={answer.key}
                      className="sr-only"
                      checked={selected}
                      onChange={() =>
                        onAnswer(definition, question.id, answer.key)
                      }
                    />
                    <span
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-full border text-xs font-bold transition-colors",
                        selected
                          ? "border-brand bg-brand text-white"
                          : "border-border bg-card text-muted-foreground"
                      )}
                    >
                      {answer.key}
                    </span>
                    <span className="min-w-0 pt-0.5 text-sm leading-relaxed">
                      {t(
                        `${definition.sport}.questions.${question.id}.answers.${answer.key}`
                      )}
                    </span>
                  </label>
                )
              })}
            </div>
            {missing ? (
              <p className="mt-2 text-sm text-destructive">
                {t("validation.missingAnswer")}
              </p>
            ) : null}
          </fieldset>
        )
      })}
    </div>
  )
}

function CompletionScreen({
  assessment,
  nextPath,
  onEnter,
}: {
  assessment: PlayerAssessment
  nextPath: string
  onEnter: () => void
}) {
  const t = useTranslations("Assessment")
  const tc = useTranslations("Common")

  return (
    <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
      <LogoMark className="size-16 text-primary" />
      <h1 className="mt-6 font-heading text-2xl font-bold sm:text-3xl">
        {t("complete.title")}
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {t("complete.subtitle")}
      </p>

      <div className="mt-8 grid w-full grid-cols-1 gap-3">
        {(["badminton"] as AssessmentSport[]).map((sport) => {
          const isSelected = assessment.selectedSports.includes(sport)
          const result = assessment.results[sport]

          if (isSelected && result) {
            const rIdx = getRangeIndex(sport, result.score)
            const levelLabel = t(`${sport}.ranges.r${rIdx}`)
            return (
              <div
                key={sport}
                className="flex items-center gap-3 rounded-3xl border border-brand/20 bg-card/80 p-4 text-left shadow-sm backdrop-blur-sm"
              >
                <span className="text-3xl">{SPORT_EMOJI[sport]}</span>
                <div className="min-w-0">
                  <p className="font-heading font-semibold">
                    {tc(`sports.${sport}`)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("results.resultText", {
                      score: result.score,
                      levelLabel,
                    })}
                  </p>
                </div>
              </div>
            )
          }

          return (
            <div
              key={sport}
              className="flex items-center gap-3 rounded-3xl border border-border/50 bg-card/40 p-4 text-left opacity-60 shadow-sm backdrop-blur-sm"
            >
              <span className="text-3xl grayscale">{SPORT_EMOJI[sport]}</span>
              <div className="min-w-0">
                <p className="font-heading font-semibold text-muted-foreground">
                  {tc(`sports.${sport}`)}
                </p>
                <p className="text-sm text-muted-foreground/80">
                  {t("results.skipped")}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <Button
        type="button"
        size="lg"
        className="mt-10 rounded-full px-8"
        onClick={onEnter}
      >
        {nextPath === "/setup" ? t("complete.ctaSetup") : t("complete.cta")}
        <ArrowRight className="size-4" />
      </Button>
    </div>
  )
}
