"use client"

import * as React from "react"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Lightbulb,
} from "lucide-react"
import { LogoMark } from "@/components/logo"

import { Button } from "@/components/ui/button"
import { LocaleSwitcher } from "@/components/locale-switcher"
import { ThemeToggle } from "@/components/theme-toggle"
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
} from "@/lib/player-assessment"

type Step = "sports" | AssessmentSport
type DraftAnswers = Record<string, Record<string, string>>

const SPORT_EMOJI: Record<AssessmentSport, string> = {
  badminton: "🏸",
  pickleball: "🏓",
}

export function SkillsAssessmentView() {
  const t = useTranslations("Assessment")
  const router = useRouter()

  const [activeTab, setActiveTab] = React.useState<Step>("sports")
  const [selectedSports, setSelectedSports] = React.useState<AssessmentSport[]>(
    ["badminton", "pickleball"]
  )
  const [answers, setAnswers] = React.useState<DraftAnswers>({})
  const [submitted, setSubmitted] = React.useState(false)
  const [completed, setCompleted] =
    React.useState<PlayerAssessment | null>(null)

  // Pre-populate from any saved assessment so the user only needs to fill
  // in the missing sport rather than redo everything from scratch.
  React.useEffect(() => {
    const timer = setTimeout(() => {
      const existing = readStoredAssessment()
      if (!existing) return
      setSelectedSports(existing.selectedSports)
      const preAnswers: DraftAnswers = {}
      existing.selectedSports.forEach((sport) => {
        const result = existing.results[sport]
        if (result?.answers) preAnswers[sport] = result.answers
      })
      setAnswers(preAnswers)
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  const steps = React.useMemo<Step[]>(
    () => ["sports", ...selectedSports],
    [selectedSports]
  )

  const current = ASSESSMENTS.find((a) => a.sport === activeTab)
  const currentAnswers = current ? (answers[current.sport] ?? {}) : {}
  const answeredCount = current
    ? current.questions.filter((q) => currentAnswers[q.id]).length
    : 0

  const currentStepIndex = steps.indexOf(activeTab)
  const isLastStep = currentStepIndex === steps.length - 1

  const progress =
    activeTab === "sports"
      ? (0.5 / steps.length) * 100
      : current
        ? ((currentStepIndex + answeredCount / current.questions.length) /
            steps.length) *
          100
        : 0

  const scrollRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [activeTab])

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

  const goTo = (step: Step) => {
    setSubmitted(false)
    setActiveTab(step)
  }

  const back = () => {
    if (currentStepIndex > 0) goTo(steps[currentStepIndex - 1])
  }

  const next = () => {
    if (activeTab === "sports") {
      if (selectedSports.length > 0) goTo(selectedSports[0])
      return
    }

    const def = ASSESSMENTS.find((a) => a.sport === activeTab)
    if (!def) return

    const answersForSport = answers[def.sport] ?? {}
    const done =
      def.questions.filter((q) => answersForSport[q.id]).length ===
      def.questions.length
    if (!done) {
      setSubmitted(true)
      return
    }

    if (!isLastStep) {
      goTo(steps[currentStepIndex + 1])
      return
    }

    // Finished the last step — compute results for this session's sports,
    // then merge with any existing results so previously-assessed sports
    // are preserved even if the user only came back to fill in a missing one.
    const newResults = {} as PlayerAssessment["results"]
    selectedSports.forEach((sport) => {
      const definition = ASSESSMENTS.find((a) => a.sport === sport)
      if (definition) {
        newResults[sport] = calculateAssessmentResult(
          definition,
          answers[sport] ?? {}
        )
      }
    })

    const existing = readStoredAssessment()
    const mergedResults = {
      ...(existing?.results ?? {}),
      ...newResults,
    } as PlayerAssessment["results"]

    const allSportsWithResults = (
      ["badminton", "pickleball"] as AssessmentSport[]
    ).filter((sport) => mergedResults[sport] !== undefined)

    const nextAssessment: PlayerAssessment = {
      version: 1,
      completedAt: new Date().toISOString(),
      selectedSports: allSportsWithResults,
      results: mergedResults,
    }
    writeStoredAssessment(nextAssessment)
    setCompleted(nextAssessment)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[radial-gradient(circle_at_12%_8%,color-mix(in_oklch,var(--brand)_22%,transparent),transparent_30%),radial-gradient(circle_at_88%_12%,color-mix(in_oklch,var(--chart-3)_22%,transparent),transparent_32%),linear-gradient(150deg,var(--background),var(--muted))]">
      {/* Invisible navbar — language + theme controls */}
      <nav className="flex shrink-0 items-center justify-end gap-0.5 px-4 pt-3 sm:px-6">
        <LocaleSwitcher />
        <ThemeToggle />
      </nav>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 py-6 sm:px-6 sm:py-10">
        {completed ? (
          <CompletionScreen
            assessment={completed}
            onEnter={() => router.replace("/dashboard")}
          />
        ) : (
          <>
            {/* Header */}
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

              {/* Stepper */}
              <Stepper
                steps={steps}
                activeTab={activeTab}
                selectedSports={selectedSports}
                answers={answers}
                onJump={goTo}
              />

              {/* Progress */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium tabular-nums">
                    {t("progress.step", {
                      current: currentStepIndex + 1,
                      total: steps.length,
                    })}
                  </span>
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

            {/* Content */}
            <main className="mt-7 flex-1">
              {activeTab === "sports" ? (
                <SportsStep
                  selectedSports={selectedSports}
                  onToggle={(sport) => {
                    setSubmitted(false)
                    setSelectedSports((prev) =>
                      prev.includes(sport)
                        ? prev.filter((s) => s !== sport)
                        : [...prev, sport]
                    )
                  }}
                />
              ) : current ? (
                <QuestionsStep
                  key={current.sport}
                  definition={current}
                  answers={currentAnswers}
                  submitted={submitted}
                  onAnswer={setAnswer}
                />
              ) : null}
            </main>

            {/* Footer actions */}
            <footer className="mt-8 flex items-center justify-between gap-3 border-t pt-5">
              <Button
                type="button"
                variant="ghost"
                className="rounded-full"
                disabled={currentStepIndex === 0}
                onClick={back}
              >
                <ArrowLeft className="size-4" />
                {t("actions.back")}
              </Button>
              <Button
                type="button"
                className="rounded-full px-6"
                disabled={activeTab === "sports" && selectedSports.length === 0}
                onClick={next}
              >
                {isLastStep ? t("actions.complete") : t("actions.continue")}
                {!isLastStep ? <ArrowRight className="size-4" /> : null}
              </Button>
            </footer>
          </>
        )}
      </div>
      </div>
    </div>
  )
}

function Stepper({
  steps,
  activeTab,
  selectedSports,
  answers,
  onJump,
}: {
  steps: Step[]
  activeTab: Step
  selectedSports: AssessmentSport[]
  answers: DraftAnswers
  onJump: (step: Step) => void
}) {
  const t = useTranslations("Assessment")
  const tc = useTranslations("Common")

  const isDone = (step: Step): boolean => {
    if (step === "sports") return selectedSports.length > 0
    const def = ASSESSMENTS.find((a) => a.sport === step)
    if (!def) return false
    const a = answers[step] ?? {}
    return def.questions.every((q) => a[q.id])
  }

  const label = (step: Step) =>
    step === "sports" ? t("stepper.sports") : tc(`sports.${step}`)

  return (
    <ol className="flex items-center gap-1.5">
      {steps.map((step, index) => {
        const active = step === activeTab
        const done = isDone(step) && !active
        const activeIndex = steps.indexOf(activeTab)
        const reachable = index <= activeIndex || isDone(steps[index - 1])
        return (
          <li key={step} className="flex min-w-0 flex-1 items-center gap-1.5">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => reachable && onJump(step)}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 rounded-full border px-2.5 py-1.5 text-left transition-all duration-300",
                active
                  ? "border-brand/40 bg-brand/10 shadow-sm"
                  : done
                    ? "border-brand/25 bg-brand/5"
                    : "border-border bg-card/60",
                reachable ? "hover:bg-muted/70" : "cursor-not-allowed opacity-60"
              )}
            >
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums transition-colors",
                  active
                    ? "bg-brand text-white"
                    : done
                      ? "bg-brand/15 text-brand"
                      : "bg-muted text-muted-foreground"
                )}
              >
                {done ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span
                className={cn(
                  "truncate text-sm font-medium",
                  active ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {label(step)}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function SportsStep({
  selectedSports,
  onToggle,
}: {
  selectedSports: AssessmentSport[]
  onToggle: (sport: AssessmentSport) => void
}) {
  const t = useTranslations("Assessment")
  const sports: AssessmentSport[] = ["badminton", "pickleball"]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-heading text-lg font-bold">
          {t("sportsSelect.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("sportsSelect.description")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {sports.map((sport) => {
          const selected = selectedSports.includes(sport)
          return (
            <button
              key={sport}
              type="button"
              onClick={() => onToggle(sport)}
              aria-pressed={selected}
              className={cn(
                "group relative flex flex-col items-start overflow-hidden rounded-3xl border-2 p-5 text-left transition-all duration-300",
                selected
                  ? "border-brand bg-brand/5 shadow-md shadow-brand/10"
                  : "border-border bg-card hover:border-brand/40 hover:bg-muted/40"
              )}
            >
              <div className="absolute -right-6 -bottom-6 size-24 rounded-full bg-brand/5 transition-transform duration-500 group-hover:scale-125" />
              <div className="mb-3 flex w-full items-center justify-between">
                <span className="text-3xl">{SPORT_EMOJI[sport]}</span>
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full border-2 transition-colors",
                    selected
                      ? "border-brand bg-brand text-white"
                      : "border-border bg-background"
                  )}
                >
                  {selected ? <Check className="size-3.5" /> : null}
                </span>
              </div>
              <h3 className="font-heading text-lg font-bold">
                {t(`sportsSelect.${sport}.title`)}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {t(`sportsSelect.${sport}.description`)}
              </p>
            </button>
          )
        })}
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm">
        <Lightbulb className="mt-0.5 size-5 shrink-0 text-blue-500" />
        <div>
          <p className="font-semibold text-blue-600 dark:text-blue-400">
            {t("sportsSelect.noticeTitle")}
          </p>
          <p className="mt-0.5 leading-relaxed text-muted-foreground">
            {t("sportsSelect.noticeBody")}
          </p>
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
  onEnter,
}: {
  assessment: PlayerAssessment
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

      <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
        {(["badminton", "pickleball"] as AssessmentSport[]).map((sport) => {
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
              className="flex items-center gap-3 rounded-3xl border border-border/50 bg-card/40 p-4 text-left shadow-sm backdrop-blur-sm opacity-60"
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
        {t("complete.cta")}
        <ArrowRight className="size-4" />
      </Button>
    </div>
  )
}
