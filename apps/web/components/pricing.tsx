"use client"

import { Check } from "lucide-react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type Audience = "customers" | "venues"

const PLANS: Record<Audience, { id: string; featured: boolean }[]> = {
  customers: [
    { id: "free", featured: false },
    { id: "plus", featured: true },
    { id: "pro", featured: false },
  ],
  venues: [
    { id: "starter", featured: false },
    { id: "growth", featured: true },
  ],
}

function PlanCard({
  audience,
  id,
  featured,
}: {
  audience: Audience
  id: string
  featured: boolean
}) {
  const t = useTranslations(`Landing.pricing.${audience}.${id}`)
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
          {ts("mostPopular")}
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
        render={<a href="#waitlist">{t("cta")}</a>}
      />
    </div>
  )
}

export function Pricing() {
  const ts = useTranslations("Landing.pricingSection")

  return (
    <Tabs defaultValue="customers" className="items-center">
      <TabsList>
        <TabsTrigger value="customers">{ts("tabs.customers")}</TabsTrigger>
        <TabsTrigger value="venues">{ts("tabs.venues")}</TabsTrigger>
      </TabsList>

      <TabsContent value="customers" className="mt-10 w-full">
        <div className="grid items-stretch gap-5 md:grid-cols-3">
          {PLANS.customers.map((plan) => (
            <PlanCard
              key={plan.id}
              audience="customers"
              id={plan.id}
              featured={plan.featured}
            />
          ))}
        </div>
      </TabsContent>

      <TabsContent value="venues" className="mt-10 w-full">
        <div className="mx-auto grid max-w-3xl items-stretch gap-5 sm:grid-cols-2">
          {PLANS.venues.map((plan) => (
            <PlanCard
              key={plan.id}
              audience="venues"
              id={plan.id}
              featured={plan.featured}
            />
          ))}
        </div>
      </TabsContent>
    </Tabs>
  )
}
