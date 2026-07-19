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
        "relative flex h-full flex-col rounded-3xl border p-6 sm:p-8",
        featured
          ? "border-primary/40 bg-gradient-to-br from-primary/[0.06] to-lime/[0.07] shadow-lg shadow-primary/5"
          : "border-border bg-card"
      )}
    >
      {featured && (
        <span className="absolute -top-3 left-6 inline-flex items-center rounded-full bg-lime px-3 py-1 text-xs font-semibold text-lime-foreground">
          {ts("badge")}
        </span>
      )}

      <h3 className="font-heading text-xl font-semibold">{t("name")}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{t("tagline")}</p>

      <div className="mt-5 flex items-baseline gap-1.5">
        <span className="font-sans text-4xl font-semibold tracking-tight">
          {t("price")}
        </span>
        <span className="text-sm text-muted-foreground">{t("period")}</span>
      </div>

      <ul className="mt-6 flex flex-1 flex-col gap-3">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
            <span className="text-foreground/80">{feature}</span>
          </li>
        ))}
      </ul>

      <Button
        variant={featured ? "lime" : "outline"}
        size="lg"
        className="mt-8 w-full cursor-pointer"
        nativeButton={false}
        render={<Link href="/sign-up">{t("cta")}</Link>}
      />
    </div>
  )
}

export function Pricing() {
  return (
    <div className="mx-auto grid max-w-3xl items-stretch gap-5 sm:grid-cols-2">
      {PLANS.map((plan) => (
        <PlanCard key={plan.id} id={plan.id} featured={plan.featured} />
      ))}
    </div>
  )
}
