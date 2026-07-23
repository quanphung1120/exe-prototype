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
import type { AccountType } from "@/lib/shared"
import {
  ASSESSMENTS,
  PLAYER_ASSESSMENT_PATH,
  PLAYER_ASSESSMENT_UPDATED_EVENT,
  clearStoredAssessment,
  getRangeIndex,
  readStoredAssessment,
  writeStoredAssessment,
  type PlayerAssessment,
} from "@/features/assessment/player-assessment"

interface PlayerAssessmentGateProps {
  children: React.ReactNode
  /**
   * The player's server-persisted assessment (Mongo, from the dashboard seed).
   * The source of truth: on a fresh browser the local cache is empty even
   * though the user assessed on another device, so we hydrate the cache from
   * this rather than redirecting them to redo the wizard.
   */
  serverAssessment?: PlayerAssessment | null
  /** Effective account type (from the dashboard seed); drives the venue-only lock. */
  accountType?: AccountType | null
  /**
   * Whether the signed-in caller carries the Clerk `"admin"` role. Exemption
   * is keyed on this, not on the current route's workspace — an admin has no
   * accountType and must never be routed into the assessment wizard even from
   * a player-workspace page (e.g. switching there from the sidebar).
   */
  isAdmin?: boolean
}

/**
 * Redirects players who haven't completed the skill assessment to the dedicated
 * wizard page ({@link PLAYER_ASSESSMENT_PATH}). The wizard lives outside the
 * dashboard layout so the gate only decides *whether* to send them there — it
 * never renders inline. The venue workspace is never gated, and an admin
 * account is never gated regardless of which workspace it's currently
 * viewing (an admin may have no accountType at all). A venue-only account is
 * locked out of the player workspace entirely (redirected to their venue
 * instead) and never asked to assess.
 */
export function PlayerAssessmentGate({
  children,
  serverAssessment = null,
  accountType = null,
  isAdmin = false,
}: PlayerAssessmentGateProps) {
  const pathname = usePathname()
  const router = useRouter()
  const workspace = workspaceForPath(pathname)
  const venueOnly = accountType === "venue"
  const exempt = workspace === "venue" || isAdmin
  const lockedOut = venueOnly && !exempt
  const needsAssessment = !exempt && !venueOnly
  const [ready, setReady] = React.useState(!needsAssessment)
  const [hasAssessment, setHasAssessment] = React.useState(false)

  React.useEffect(() => {
    if (lockedOut) router.replace("/dashboard/venue")
  }, [lockedOut, router])

  React.useEffect(() => {
    if (!needsAssessment) return
    // Hydrate the local cache from the server value when the browser has none
    // (fresh device) so the synchronous readers (matchmaking, profile) agree
    // and the gate doesn't redirect an already-assessed player to redo it.
    if (serverAssessment && readStoredAssessment() === null) {
      writeStoredAssessment(serverAssessment)
    }
    const sync = () => {
      setHasAssessment(
        readStoredAssessment() !== null || serverAssessment !== null
      )
      setReady(true)
    }
    sync()
    window.addEventListener("storage", sync)
    window.addEventListener(PLAYER_ASSESSMENT_UPDATED_EVENT, sync)
    return () => {
      window.removeEventListener("storage", sync)
      window.removeEventListener(PLAYER_ASSESSMENT_UPDATED_EVENT, sync)
    }
  }, [needsAssessment, serverAssessment])

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
          <CardDescription>{t("description")}</CardDescription>
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
  const [assessment, setAssessment] = React.useState<PlayerAssessment | null>(
    null
  )

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
                const localizedLevelLabel = t(
                  `${definition.sport}.ranges.r${rIdx}`
                )
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
