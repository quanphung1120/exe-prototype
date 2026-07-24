"use client"

import { Check } from "lucide-react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Link } from "@/i18n/navigation"

type Audience = "players" | "venues"

const PLANS: { id: Audience; featured: boolean }[] = [
  { id: "players", featured: false },
  { id: "venues", featured: true },
]

function PlanCard({ id, featured }: { id: Audience; featured: boolean }) {
  const t = useTranslations(`Landing.pricing.${id}`)
  const ts = useTranslations("Landing.pricingSection")
  const features = t.raw("features") as string[]

  return (
    <div
      className={cn(
        "relative flex h-full flex-col rounded-3xl border p-6 sm:p-8 transition-all duration-300 hover:-translate-y-1",
        featured
          ? "border-lime/50 bg-gradient-to-b from-primary/10 via-card to-lime/10 shadow-xl shadow-lime/5 ring-1 ring-lime/30"
          : "border-border bg-card/80 backdrop-blur-sm shadow-sm hover:border-primary/30 hover:shadow-md"
      )}
    >
      {featured && (
        <span className="absolute -top-3.5 left-6 inline-flex items-center gap-1.5 rounded-full bg-lime px-3.5 py-1 text-xs font-bold text-lime-foreground shadow-md shadow-lime/20">
          <span className="size-1.5 rounded-full bg-lime-foreground animate-pulse" />
          {ts("badge")}
        </span>
      )}

      <div className="flex items-center justify-between">
        <h3 className="font-heading text-2xl font-bold tracking-tight">{t("name")}</h3>
        {featured ? (
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-lime-300 border border-emerald-500/20">
            Dành cho câu lạc bộ
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
            Miễn phí 100%
          </span>
        )}
      </div>

      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{t("tagline")}</p>

      <div className="mt-6 flex items-baseline gap-1.5 border-b border-border/60 pb-6">
        <span className="font-sans text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground">
          {t("price")}
        </span>
        <span className="text-sm font-medium text-muted-foreground">{t("period")}</span>
      </div>

      <ul className="mt-6 flex flex-1 flex-col gap-3.5">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-3 text-sm">
            <span
              className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                featured
                  ? "bg-lime text-lime-foreground"
                  : "bg-primary/10 text-primary"
              )}
            >
              <Check className="size-3 stroke-[3]" />
            </span>
            <span className="font-medium text-foreground/90">{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <Button
          variant={featured ? "lime" : "outline"}
          size="lg"
          className={cn(
            "w-full cursor-pointer rounded-2xl font-semibold transition-transform duration-200 active:scale-[0.98]",
            featured && "shadow-lg shadow-lime/20"
          )}
          nativeButton={false}
          render={<Link href="/sign-up">{t("cta")}</Link>}
        />
      </div>
    </div>
  )
}

export function Pricing() {
  return (
    <div className="mx-auto grid max-w-4xl items-stretch gap-6 sm:grid-cols-2">
      {PLANS.map((plan) => (
        <PlanCard key={plan.id} id={plan.id} featured={plan.featured} />
      ))}
    </div>
  )
}
