"use client"

import * as React from "react"
import { RotateCcw } from "lucide-react"
import { LogoMark } from "@/components/logo"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useTranslations } from "next-intl"
import { usePathname, useRouter } from "@/i18n/navigation"
import { cn } from "@/lib/utils"
import { workspaceForPath } from "@/features/dashboard/workspace"
import {
  ASSESSMENTS,
  PLAYER_ASSESSMENT_PATH,
  PLAYER_ASSESSMENT_UPDATED_EVENT,
  clearStoredAssessment,
  getRangeIndex,
  readStoredAssessment,
  type PlayerAssessment,
} from "@/features/assessment/player-assessment"

interface PlayerAssessmentGateProps {
  children: React.ReactNode
}

/**
 * Redirects players who haven't completed the skill assessment to the dedicated
 * wizard page ({@link PLAYER_ASSESSMENT_PATH}). The wizard lives outside the
 * dashboard layout so the gate only decides *whether* to send them there — it
 * never renders inline. The venue workspace is never gated.
 */
export function PlayerAssessmentGate({ children }: PlayerAssessmentGateProps) {
  const pathname = usePathname()
  const router = useRouter()
  const needsAssessment = workspaceForPath(pathname) !== "venue"
  const [ready, setReady] = React.useState(!needsAssessment)
  const [hasAssessment, setHasAssessment] = React.useState(false)

  React.useEffect(() => {
    if (!needsAssessment) return
    const sync = () => {
      setHasAssessment(readStoredAssessment() !== null)
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

  React.useEffect(() => {
    if (needsAssessment && ready && !hasAssessment) {
      router.replace(PLAYER_ASSESSMENT_PATH)
    }
  }, [needsAssessment, ready, hasAssessment, router])

  if (!needsAssessment) return <>{children}</>
  if (!ready) return <AssessmentLoading />
  if (!hasAssessment) return <AssessmentLoading />

  return <>{children}</>
}

function AssessmentLoading() {
  const t = useTranslations("Assessment.loading")
  return (
    <div className="grid min-h-dvh place-items-center bg-[radial-gradient(circle_at_top_left,color-mix(in_oklch,var(--brand)_18%,transparent),transparent_34%),linear-gradient(135deg,var(--background),var(--muted))] p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>
            {t("description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={55} />
        </CardContent>
      </Card>
    </div>
  )
}

export function ResetPlayerAssessmentButton({
  className,
}: {
  className?: string
}) {
  const t = useTranslations("Assessment")
  const tc = useTranslations("Common")
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
          <LogoMark className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading font-semibold">{t("results.title")}</p>
          <div className="mt-2 grid gap-1 text-sm text-muted-foreground">
            {ASSESSMENTS.map((definition) => {
              const result = assessment.results[definition.sport]
              
              let resultStr = t("results.notAssessed")
              if (result) {
                const rIdx = getRangeIndex(definition.sport, result.score)
                const localizedLevelLabel = t(`${definition.sport}.ranges.r${rIdx}`)
                resultStr = t("results.resultText", {
                  score: result.score,
                  levelLabel: localizedLevelLabel,
                })
              }
              
              return (
                <p key={definition.sport}>
                  <span className="font-medium text-foreground">
                    {tc(`sports.${definition.sport}`)}:
                  </span>{" "}
                  {resultStr}
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
        {t("actions.redo")}
      </Button>
    </div>
  )
}
