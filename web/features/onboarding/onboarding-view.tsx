"use client"

import * as React from "react"
import { ArrowRight, Check } from "lucide-react"
import { LogoMark } from "@/components/logo"

import { Button } from "@/components/ui/button"
import { LocaleSwitcher } from "@/components/locale-switcher"
import { ThemeToggle } from "@/components/theme-toggle"
import { useTranslations } from "next-intl"
import { useRouter } from "@/i18n/navigation"
import { cn } from "@/lib/utils"
import type { AccountType } from "@/lib/shared"

import { chooseAccountType } from "@/features/onboarding/account-actions"

type Role = "player" | "venue"

/**
 * The post-sign-up choice point: pick player, venue owner, or both by
 * toggling either role card. Continuing persists the choice and routes into
 * the matching setup flow — the assessment for players ("both" goes there
 * first), the venue wizard for a venue-only choice.
 */
export function OnboardingView() {
  const t = useTranslations("Onboarding")
  const router = useRouter()
  const [selected, setSelected] = React.useState<Role[]>([])
  const [submitting, setSubmitting] = React.useState(false)

  const toggle = (role: Role) => {
    setSelected((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    )
  }

  const accountType: AccountType | null =
    selected.includes("player") && selected.includes("venue")
      ? "both"
      : selected.includes("player")
        ? "player"
        : selected.includes("venue")
          ? "venue"
          : null

  const handleContinue = () => {
    if (!accountType || submitting) return
    setSubmitting(true)
    void chooseAccountType(accountType).then(() => {
      router.replace(accountType === "venue" ? "/setup" : "/assessment")
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[radial-gradient(circle_at_12%_8%,color-mix(in_oklch,var(--brand)_22%,transparent),transparent_30%),radial-gradient(circle_at_88%_12%,color-mix(in_oklch,var(--chart-3)_22%,transparent),transparent_32%),linear-gradient(150deg,var(--background),var(--muted))]">
      <nav className="flex shrink-0 items-center justify-end gap-0.5 px-4 pt-3 sm:px-6">
        <LocaleSwitcher />
        <ThemeToggle />
      </nav>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center px-4 py-10 sm:px-6">
          <LogoMark className="size-14 text-primary" />
          <h1 className="mt-6 text-center font-heading text-2xl font-bold sm:text-3xl">
            {t("title")}
          </h1>
          <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">
            {t("subtitle")}
          </p>

          <div className="mt-8 grid w-full gap-4 sm:grid-cols-2">
            <RoleCard
              emoji="🏸"
              title={t("player.title")}
              description={t("player.description")}
              selected={selected.includes("player")}
              onClick={() => toggle("player")}
            />
            <RoleCard
              emoji="🏟️"
              title={t("venue.title")}
              description={t("venue.description")}
              selected={selected.includes("venue")}
              onClick={() => toggle("venue")}
            />
          </div>

          <Button
            type="button"
            size="lg"
            className="mt-10 w-full max-w-xs rounded-full px-8"
            disabled={!accountType || submitting}
            onClick={handleContinue}
          >
            {t("continue")}
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function RoleCard({
  emoji,
  title,
  description,
  selected,
  onClick,
}: {
  emoji: string
  title: string
  description: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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
        <span className="text-3xl">{emoji}</span>
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
      <h3 className="font-heading text-lg font-bold">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
    </button>
  )
}
