import {
  ArrowRight,
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Feather,
  Heart,
  MapPin,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react"
import Image from "next/image"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { cn } from "@/lib/utils"
import { Faq, type FaqItem } from "@/features/landing/faq"
import { Logo } from "@/components/logo"
import { Pricing } from "@/features/landing/pricing"
import { Reveal } from "@/features/landing/reveal"
import { CountUp } from "@/features/landing/scroll/count-up"
import { HeroIntro } from "@/features/landing/scroll/hero-intro"
import { OccupancyBars } from "@/features/landing/scroll/occupancy-bars"
import { Parallax } from "@/features/landing/scroll/parallax"
import { SiteHeader } from "@/features/landing/site-header"
import { Link } from "@/i18n/navigation"

const SPORT_KEYS = ["badminton"]

const TRUST_LOGOS = [
  "Ace Badminton Club",
  "Shuttle Republic",
  "Smash Badminton",
  "Baseline Athletic",
  "Courtside Collective",
  "Net Gain Sports",
  "Rally Point Club",
  "Topspin Center",
]

const ABOUT_FEATURE_ICONS = [Zap, RefreshCw]

const PLAYER_FEATURE_ICONS = [
  MessageCircle,
  Users,
  CalendarCheck,
  MapPin,
  MessagesSquare,
]

// Floating chips over the full-bleed hero photo — position is a
// percentage-based inset from the hero section's own edges (the photo now
// fills the whole section), clustered around where the racket sits on the
// right. Only shown at `lg`, tune by eye once the photo crop is final.
const HERO_BADGES = [
  { key: "smartMatching", icon: Users, className: "top-[12%] right-[10%]" },
  { key: "aiPowered", icon: Sparkles, className: "top-[30%] right-[40%]" },
  { key: "saveTime", icon: Clock, className: "top-[40%] right-[4%]" },
  { key: "moreGames", icon: Feather, className: "bottom-[28%] right-[44%]" },
  { key: "builtForYou", icon: Heart, className: "bottom-[12%] right-[12%]" },
] as const
const STEP_ICONS = [MessageSquare, Search, CheckCircle2]
const VENUE_BENEFIT_ICONS = [TrendingUp, Users, BarChart3, Shield]

const TESTIMONIAL_META = [
  { name: "Maya R.", initials: "MR" },
  { name: "Daniel K.", initials: "DK" },
  { name: "Priya S.", initials: "PS" },
]

const containerCx = "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8"
// Editorial display headings: Barlow (wide grotesque) at semibold weight.
const displayCx = "font-sans font-semibold tracking-tight"

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 inline-flex items-center gap-2 text-sm font-semibold tracking-wide text-primary uppercase">
      <span className="h-px w-6 bg-primary/50" aria-hidden="true" />
      {children}
    </p>
  )
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("Landing")
  const tc = await getTranslations("Common")

  const aboutFeatures = ABOUT_FEATURE_ICONS.map((icon, i) => ({
    icon,
    title: t(`aboutSection.features.${i}.title`),
    body: t(`aboutSection.features.${i}.body`),
  }))

  const playerFeatures = PLAYER_FEATURE_ICONS.map((icon, i) => ({
    icon,
    title: t(`playerFeatures.${i}.title`),
    body: t(`playerFeatures.${i}.body`),
    featured: i === 0,
  }))

  const steps = STEP_ICONS.map((icon, i) => ({
    icon,
    title: t(`steps.${i}.title`),
    body: t(`steps.${i}.body`),
  }))

  const venueBenefits = VENUE_BENEFIT_ICONS.map((icon, i) => ({
    icon,
    title: t(`venueBenefits.${i}.title`),
    body: t(`venueBenefits.${i}.body`),
  }))

  const stats = [0, 1, 2, 3].map((i) => ({
    value: t(`stats.${i}.value`),
    label: t(`stats.${i}.label`),
  }))

  const testimonials = TESTIMONIAL_META.map((meta, i) => ({
    ...meta,
    quote: t(`testimonials.${i}.quote`),
    role: t(`testimonials.${i}.role`),
  }))

  const faqItems: FaqItem[] = [0, 1, 2, 3, 4].map((i) => ({
    question: t(`faq.${i}.question`),
    answer: t(`faq.${i}.answer`),
  }))

  return (
    <>
      <SiteHeader />
      <main id="top">
        {/* ── Hero ─────────────────────────────────────────── */}
        <section className="relative isolate overflow-hidden py-20 sm:py-24 lg:flex lg:min-h-[760px] lg:items-center lg:py-0">
          {/* Photo stretched to fill the entire hero — the visual is the background.
              Anchored bottom-right (where the racket already bleeds off-frame in the
              source photo) so cover-cropping trims sky/background first and never
              clips the racket, regardless of viewport aspect ratio. */}
          <div className="absolute inset-0 -z-20" aria-hidden="true">
            <Parallax speed={0.1} className="absolute inset-0">
              <Image
                src="/hero-badminton.png"
                alt=""
                fill
                priority
                quality={95}
                sizes="100vw"
                className="object-cover object-right-bottom dark:brightness-100 dark:contrast-100 dark:saturate-100"
              />
            </Parallax>
          </div>
          {/* Legibility scrim so the text column stays readable over the photo.
              Dark mode uses the lighter "card" surface instead of the near-black
              page background so the left side doesn't read as flat black. */}
          <div
            className="absolute inset-0 -z-10 bg-gradient-to-r from-background via-background/85 to-background/25 dark:from-card/90 dark:via-card/65 dark:to-transparent"
            aria-hidden="true"
          />
          <div
            className="absolute inset-0 -z-10 bg-background/20 sm:hidden"
            aria-hidden="true"
          />

          <div className="mx-auto w-full max-w-[1280px] px-6 sm:px-10 lg:px-16">
            <HeroIntro className="max-w-xl">
              <span
                data-hero-item
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-3.5 py-1.5 text-sm font-medium text-foreground backdrop-blur-sm"
              >
                <Sparkles className="size-3.5 text-primary" />
                {t("hero.eyebrow")}
              </span>

              <h1
                data-hero-item
                className={`${displayCx} mt-5 text-5xl leading-[0.95] uppercase sm:text-6xl lg:text-7xl`}
              >
                {t("hero.titleLine1")}
                <span className="block">
                  {t.rich("hero.titleLine2", {
                    accent: (chunks) => (
                      <span className="text-lime">{chunks}</span>
                    ),
                  })}
                </span>
              </h1>

              {/* Lime accent rule. */}
              <span
                data-hero-item
                className="mt-6 block h-1.5 w-24 rounded-full bg-lime"
                aria-hidden="true"
              />

              <p
                data-hero-item
                className="mt-6 text-lg text-muted-foreground sm:text-xl"
              >
                {t("hero.subtitle")}
              </p>

              <div
                data-hero-item
                className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-5"
              >
                <Link
                  href="/sign-up"
                  className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-4xl bg-lime px-7 text-base font-medium text-lime-foreground transition-colors hover:bg-lime/90 focus-visible:ring-3 focus-visible:ring-lime/40 focus-visible:outline-none"
                >
                  {t("hero.cta")}
                  <ArrowRight className="size-4" />
                </Link>

                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2.5" aria-hidden="true">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className="size-9 rounded-full border-2 border-background bg-gradient-to-br from-muted-foreground/30 to-muted-foreground/5"
                      />
                    ))}
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">
                    {t("hero.socialProof")}
                  </span>
                </div>
              </div>

              <div
                data-hero-item
                className="mt-8 flex flex-wrap items-center gap-2"
              >
                <span className="text-sm text-muted-foreground">
                  {t("hero.sportsLabel")}
                </span>
                {SPORT_KEYS.map((sport) => (
                  <span
                    key={sport}
                    className="rounded-full border border-border bg-card/70 px-3 py-1 text-sm font-medium text-foreground backdrop-blur-sm"
                  >
                    {tc(`sports.${sport}`)}
                  </span>
                ))}
              </div>
            </HeroIntro>
          </div>

          {/* Floating badges over the photo — hidden on small screens where the photo sits behind a solid scrim. */}
          <div
            className="absolute inset-0 -z-10 hidden lg:block"
            aria-hidden="true"
          >
            {HERO_BADGES.map(({ key, icon: Icon, className }) => (
              <span
                key={key}
                className={cn(
                  "absolute inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-xs font-medium whitespace-nowrap text-foreground shadow-md backdrop-blur-sm sm:text-sm",
                  className
                )}
              >
                <Icon className="size-3.5 text-primary sm:size-4" />
                {t(`hero.badges.${key}`)}
              </span>
            ))}
          </div>
        </section>

        {/* ── Trust strip (sliding marquee) ─ */}
        <section className="relative z-10 pt-8 sm:pt-4">
          <div className={containerCx}>
            <div className="overflow-hidden rounded-2xl border border-border bg-background/80 px-6 py-5 shadow-sm backdrop-blur-md sm:px-8">
              <p className="text-center text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("trust.caption")}
              </p>
              <div
                className="group/marquee relative mt-4 flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_8%,#000_92%,transparent)]"
                aria-hidden="true"
              >
                <div className="animate-marquee flex w-max items-center gap-x-12 pr-12">
                  {[...TRUST_LOGOS, ...TRUST_LOGOS].map((name, i) => (
                    <span
                      key={i}
                      className="font-heading text-lg font-semibold whitespace-nowrap text-muted-foreground/60 sm:text-xl"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── About ────────────────────────────────────────── */}
        <section
          id="about"
          className="scroll-mt-20 pt-10 pb-20 sm:pt-14 sm:pb-28"
        >
          <div className={containerCx}>
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <Reveal>
                <Eyebrow>{t("aboutSection.eyebrow")}</Eyebrow>
                <h2 className={`${displayCx} text-3xl sm:text-4xl lg:text-5xl`}>
                  <span className="text-foreground">
                    {t("aboutSection.titleStrong")}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {t("aboutSection.titleMuted")}
                  </span>
                </h2>
                <p className="mt-6 max-w-xl text-lg text-muted-foreground">
                  {t("aboutSection.body")}
                </p>
                <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {aboutFeatures.map((feature) => (
                    <div
                      key={feature.title}
                      className="rounded-2xl border border-border bg-card p-5"
                    >
                      <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <feature.icon className="size-4" />
                      </span>
                      <h3 className="mt-3 font-heading text-base font-semibold">
                        {feature.title}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {feature.body}
                      </p>
                    </div>
                  ))}
                </div>
              </Reveal>

              <Reveal delayMs={120}>
                <div className="grid grid-cols-2 gap-4">
                  <div className="mt-10 flex flex-col gap-4">
                    <div className="relative aspect-[4/5] overflow-hidden rounded-3xl border border-border">
                      <Image
                        src="/about-catch.png"
                        alt=""
                        fill
                        sizes="(min-width: 1024px) 25vw, 45vw"
                        className="object-cover"
                      />
                    </div>
                    <div className="relative aspect-square overflow-hidden rounded-3xl border border-border">
                      <Image
                        src="/about-racket.jpg"
                        alt=""
                        fill
                        sizes="(min-width: 1024px) 25vw, 45vw"
                        className="object-cover"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-4">
                    <div className="relative aspect-square overflow-hidden rounded-3xl border border-border">
                      <Image
                        src="/about-court.png"
                        alt=""
                        fill
                        sizes="(min-width: 1024px) 25vw, 45vw"
                        className="object-cover"
                      />
                    </div>
                    <div className="relative aspect-[4/5] overflow-hidden rounded-3xl border border-border">
                      <Image
                        src="/about-action.jpg"
                        alt=""
                        fill
                        sizes="(min-width: 1024px) 25vw, 45vw"
                        className="object-cover"
                      />
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── Player features ──────────────────────────────── */}
        <section id="features" className="scroll-mt-20 py-20 sm:py-28">
          <div className={containerCx}>
            <Reveal className="max-w-2xl">
              <Eyebrow>{t("playerFeaturesSection.eyebrow")}</Eyebrow>
              <h2 className={`${displayCx} text-4xl sm:text-5xl`}>
                {t("playerFeaturesSection.title")}
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                {t("playerFeaturesSection.subtitle")}
              </p>
            </Reveal>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {playerFeatures.map((feature, i) => (
                <Reveal
                  key={feature.title}
                  delayMs={i * 60}
                  className={feature.featured ? "sm:col-span-2" : ""}
                >
                  <article className="flex h-full flex-col rounded-3xl border border-border bg-card p-6 transition-colors hover:border-primary/40">
                    <span
                      className={cn(
                        "flex size-12 items-center justify-center rounded-2xl",
                        i === 0 && "bg-lime text-lime-foreground",
                        i === 1 && "bg-primary text-primary-foreground",
                        i >= 2 && "bg-muted text-foreground"
                      )}
                    >
                      <feature.icon className="size-6" />
                    </span>
                    <h3 className="mt-5 font-heading text-xl font-semibold">
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-muted-foreground">{feature.body}</p>

                    {i === 0 && (
                      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-xl bg-muted p-3">
                          <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                            {t("playerFeatures.0.demoRequestLabel")}
                          </p>
                          <p className="mt-1.5 text-sm text-foreground">
                            {t("playerFeatures.0.demoRequest")}
                          </p>
                        </div>
                        <div className="rounded-xl bg-lime p-3">
                          <p className="text-[10px] font-semibold tracking-wide text-lime-foreground/70 uppercase">
                            {t("playerFeatures.0.demoResponseLabel")}
                          </p>
                          <p className="mt-1.5 text-sm text-lime-foreground">
                            {t("playerFeatures.0.demoResponse")}
                          </p>
                        </div>
                      </div>
                    )}

                    {i === 1 && (
                      <div className="mt-6">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                            {t("playerFeatures.1.demoLabel")}
                          </p>
                          <span className="rounded-full bg-lime px-2.5 py-0.5 text-xs font-semibold text-lime-foreground">
                            {t("playerFeatures.1.demoBadge")}
                          </span>
                        </div>
                        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div className="h-full w-[70%] rounded-full bg-lime" />
                        </div>
                      </div>
                    )}

                    {i === 2 && (
                      <div className="mt-6 inline-flex w-fit items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold">
                        <Zap className="size-4 text-lime" />
                        {t("playerFeatures.2.demoCta")}
                      </div>
                    )}

                    {i === 3 && (
                      <div
                        className="relative mt-6 aspect-[4/3] overflow-hidden rounded-2xl bg-muted"
                        aria-hidden="true"
                      >
                        {/* map tile tint */}
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.08] via-transparent to-lime/[0.12]" />

                        {/* city blocks */}
                        <div className="absolute top-[10%] left-[8%] size-9 rounded-md bg-foreground/[0.06]" />
                        <div className="absolute top-[12%] right-[12%] size-6 rounded-md bg-foreground/[0.06]" />
                        <div className="absolute bottom-[14%] left-[14%] size-7 rounded-md bg-foreground/[0.06]" />
                        <div className="absolute right-[8%] bottom-[8%] size-10 rounded-md bg-foreground/[0.06]" />

                        {/* streets */}
                        <svg
                          className="absolute inset-0 size-full"
                          viewBox="0 0 200 150"
                          preserveAspectRatio="none"
                          fill="none"
                        >
                          <g className="text-border" stroke="currentColor">
                            <path d="M0 32H200M0 82H200M0 122H200" strokeWidth="1.5" />
                            <path d="M38 0V150M98 0V150M152 0V150" strokeWidth="1.5" />
                          </g>
                          <path
                            d="M-5 58Q70 36 130 72T205 100"
                            className="text-lime"
                            stroke="currentColor"
                            strokeWidth="4"
                            strokeLinecap="round"
                            opacity="0.65"
                          />
                        </svg>

                        {/* "you are here" pulse */}
                        <span className="absolute top-[68%] left-[20%] flex size-3 -translate-x-1/2 -translate-y-1/2">
                          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
                          <span className="relative inline-flex size-3 rounded-full bg-primary ring-2 ring-background" />
                        </span>

                        {/* nearby court pins */}
                        <div className="absolute top-[30%] left-[42%] -translate-x-1/2 -translate-y-full">
                          <MapPin className="mx-auto size-5 fill-lime text-lime-foreground drop-shadow" />
                          <span className="mt-0.5 block rounded-full bg-lime px-2 py-0.5 text-center text-[10px] font-semibold whitespace-nowrap text-lime-foreground shadow-sm">
                            650m
                          </span>
                        </div>
                        <div className="absolute top-[52%] left-[72%] -translate-x-1/2 -translate-y-full">
                          <MapPin className="mx-auto size-5 fill-primary text-primary-foreground drop-shadow" />
                          <span className="mt-0.5 block rounded-full bg-card px-2 py-0.5 text-center text-[10px] font-semibold whitespace-nowrap text-foreground shadow-sm ring-1 ring-border">
                            1.4km
                          </span>
                        </div>
                        <MapPin className="absolute top-[80%] left-[55%] size-4 -translate-x-1/2 -translate-y-full text-muted-foreground/70" />
                      </div>
                    )}

                    {i === 4 && (
                      <div className="mt-6 space-y-2">
                        <div className="rounded-xl bg-muted p-3">
                          <p className="text-xs font-semibold text-foreground">
                            {t("playerFeatures.4.demoName")}
                          </p>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {t("playerFeatures.4.demoMessage")}
                          </p>
                        </div>
                        <div className="inline-flex items-center gap-1.5 rounded-full bg-lime px-3 py-1.5 text-xs font-semibold text-lime-foreground">
                          <CheckCircle2 className="size-3.5" />
                          {t("playerFeatures.4.demoConfirm")}
                        </div>
                      </div>
                    )}
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────── */}
        <section
          id="how-it-works"
          className="scroll-mt-20 bg-muted/40 py-20 sm:py-28"
        >
          <div className={containerCx}>
            <Reveal className="mx-auto max-w-2xl text-center">
              <Eyebrow>{t("stepsSection.eyebrow")}</Eyebrow>
              <h2 className={`${displayCx} text-4xl sm:text-5xl`}>
                {t("stepsSection.title")}
              </h2>
            </Reveal>

            <div className="relative mt-14 grid gap-8 md:grid-cols-3">
              {/* connector line on desktop */}
              <div
                className="pointer-events-none absolute top-7 right-[16.66%] left-[16.66%] hidden border-t-2 border-dashed border-border md:block"
                aria-hidden="true"
              />
              {steps.map((step, i) => (
                <Reveal key={step.title} delayMs={i * 100}>
                  <div className="relative flex flex-col items-center text-center">
                    <span className="relative z-10 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
                      <step.icon className="size-6" />
                      <span className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-lime font-mono text-xs font-semibold text-lime-foreground">
                        {i + 1}
                      </span>
                    </span>
                    <h3 className="mt-5 font-heading text-xl font-semibold">
                      {step.title}
                    </h3>
                    <p className="mt-2 max-w-xs text-muted-foreground">
                      {step.body}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Stats ────────────────────────────────────────── */}
        <section className="py-20 sm:py-24">
          <div className={containerCx}>
            <Reveal>
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-border bg-border lg:grid-cols-4">
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="flex flex-col items-center gap-1 bg-card px-6 py-10 text-center"
                  >
                    <dt className="sr-only">{stat.label}</dt>
                    <dd className="font-heading text-4xl font-semibold tracking-tight text-primary tabular-nums sm:text-5xl">
                      <CountUp value={stat.value} />
                    </dd>
                    <p className="text-sm font-medium text-muted-foreground">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
        </section>

        {/* ── For venues (pale-green band in light, dark band in dark) ─ */}
        <section id="venues" className="scroll-mt-20 py-12 sm:py-16">
          <div className={containerCx}>
            <div className="relative overflow-hidden rounded-[2rem] border border-emerald-200/70 bg-emerald-50 px-6 py-14 text-emerald-950 sm:px-12 sm:py-20 dark:border-transparent dark:bg-zinc-950 dark:text-zinc-50">
              <div
                className="pointer-events-none absolute -right-20 -bottom-24 size-96 rounded-full bg-emerald-500/20 blur-[120px] dark:bg-emerald-500/20"
                aria-hidden="true"
              />
              <div className="relative grid gap-12 lg:grid-cols-2 lg:items-center">
                <div>
                  <p className="mb-3 inline-flex items-center gap-2 text-sm font-semibold tracking-wide text-emerald-700 uppercase dark:text-lime-300">
                    <span
                      className="h-px w-6 bg-emerald-600/50 dark:bg-lime-300/60"
                      aria-hidden="true"
                    />
                    {t("venuesSection.eyebrow")}
                  </p>
                  <h2 className={`${displayCx} text-4xl sm:text-5xl`}>
                    {t("venuesSection.titleLine1")}
                    <br />
                    {t("venuesSection.titleLine2")}
                  </h2>
                  <p className="mt-4 max-w-lg text-lg text-emerald-900/75 dark:text-zinc-300">
                    {t("venuesSection.subtitle")}
                  </p>

                  <dl className="mt-8 grid gap-x-6 gap-y-6 sm:grid-cols-2">
                    {venueBenefits.map((benefit) => (
                      <div key={benefit.title} className="flex gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                          <benefit.icon className="size-5" />
                        </span>
                        <div>
                          <dt className="font-heading text-lg font-semibold">
                            {benefit.title}
                          </dt>
                          <dd className="mt-0.5 text-sm text-emerald-900/65 dark:text-zinc-400">
                            {benefit.body}
                          </dd>
                        </div>
                      </div>
                    ))}
                  </dl>
                </div>

                {/* Mock occupancy dashboard + venue waitlist */}
                <div className="lg:pl-6">
                  <div className="rounded-3xl border border-emerald-200/70 bg-white/70 p-6 backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
                    <div className="flex items-center justify-between">
                      <p className="font-heading text-lg font-semibold">
                        {t("occupancy.title")}
                      </p>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                        <TrendingUp className="size-3.5" />
                        {t("occupancy.offPeakBadge")}
                      </span>
                    </div>
                    <OccupancyBars
                      labels={[0, 1, 2, 3, 4, 5, 6].map((i) =>
                        t(`occupancy.weekdays.${i}`)
                      )}
                    />
                    <div className="mt-6 grid grid-cols-3 gap-3 border-t border-emerald-200/70 pt-5 text-center dark:border-white/10">
                      <div>
                        <p className="font-heading text-2xl font-semibold tabular-nums">
                          <CountUp value="86%" />
                        </p>
                        <p className="text-xs text-emerald-900/55 dark:text-zinc-500">
                          {t("occupancy.utilization")}
                        </p>
                      </div>
                      <div>
                        <p className="font-heading text-2xl font-semibold tabular-nums">
                          <CountUp value="128" />
                        </p>
                        <p className="text-xs text-emerald-900/55 dark:text-zinc-500">
                          {t("occupancy.bookingsPerWeek")}
                        </p>
                      </div>
                      <div>
                        <p className="font-heading text-2xl font-semibold tabular-nums">
                          <CountUp value="4.9" />
                        </p>
                        <p className="text-xs text-emerald-900/55 dark:text-zinc-500">
                          {t("occupancy.playerRating")}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5">
                    <Link
                      href="/sign-up"
                      className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-2xl bg-lime px-6 text-base font-medium text-lime-foreground transition-colors hover:bg-lime/90 focus-visible:ring-3 focus-visible:ring-lime/40 focus-visible:outline-none"
                    >
                      {t("hero.cta")}
                      <ArrowRight className="size-4" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Testimonials ─────────────────────────────────── */}
        <section className="py-20 sm:py-28">
          <div className={containerCx}>
            <Reveal className="mx-auto max-w-2xl text-center">
              <Eyebrow>{t("testimonialsSection.eyebrow")}</Eyebrow>
              <h2 className={`${displayCx} text-4xl sm:text-5xl`}>
                {t("testimonialsSection.title")}
              </h2>
            </Reveal>

            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {testimonials.map((testimonial, i) => (
                <Reveal key={testimonial.name} delayMs={i * 80}>
                  <figure className="flex h-full flex-col rounded-3xl border border-border bg-card p-6">
                    <div
                      className="flex gap-0.5 text-primary"
                      aria-label={t("testimonialsSection.ratingAria")}
                    >
                      {Array.from({ length: 5 }).map((_, s) => (
                        <Star
                          key={s}
                          className="size-4 fill-current"
                          aria-hidden="true"
                        />
                      ))}
                    </div>
                    <blockquote className="mt-4 flex-1 text-foreground">
                      “{testimonial.quote}”
                    </blockquote>
                    <figcaption className="mt-5 flex items-center gap-3 border-t border-border pt-4">
                      <span className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-lime text-sm font-semibold text-primary-foreground">
                        {testimonial.initials}
                      </span>
                      <div>
                        <p className="text-sm font-semibold">
                          {testimonial.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {testimonial.role}
                        </p>
                      </div>
                    </figcaption>
                  </figure>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing ──────────────────────────────────────── */}
        <section id="pricing" className="scroll-mt-20 py-20 sm:py-28">
          <div className={containerCx}>
            <Reveal className="mx-auto max-w-2xl text-center">
              <Eyebrow>{t("pricingSection.eyebrow")}</Eyebrow>
              <h2 className={`${displayCx} text-4xl sm:text-5xl`}>
                {t("pricingSection.title")}
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                {t("pricingSection.subtitle")}
              </p>
            </Reveal>
            <Reveal className="mt-12">
              <Pricing />
            </Reveal>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────── */}
        <section id="faq" className="scroll-mt-20 bg-muted/40 py-20 sm:py-28">
          <div className={`${containerCx} max-w-3xl`}>
            <Reveal className="text-center">
              <Eyebrow>{t("faqSection.eyebrow")}</Eyebrow>
              <h2 className={`${displayCx} text-4xl sm:text-5xl`}>
                {t("faqSection.title")}
              </h2>
            </Reveal>
            <Reveal className="mt-10">
              <Faq items={faqItems} />
            </Reveal>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────── */}
        <section id="get-started" className="scroll-mt-24 py-20 sm:py-28">
          <div className={containerCx}>
            <div className="relative overflow-hidden rounded-[2rem] border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-lime/10 px-6 py-16 text-center sm:px-12 sm:py-20">
              <div
                className="bg-court-grid pointer-events-none absolute inset-0"
                aria-hidden="true"
              />
              <div className="relative mx-auto max-w-2xl">
                <h2 className={`${displayCx} text-4xl uppercase sm:text-6xl`}>
                  {t("cta.title")}
                </h2>
                <p className="mt-4 text-lg text-muted-foreground">
                  {t("cta.subtitle")}
                </p>
                <div className="mt-8 flex justify-center">
                  <Link
                    href="/sign-up"
                    className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-4xl bg-lime px-7 text-base font-medium text-lime-foreground transition-colors hover:bg-lime/90 focus-visible:ring-3 focus-visible:ring-lime/40 focus-visible:outline-none"
                  >
                    {t("hero.cta")}
                    <ArrowRight className="size-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="border-t border-border bg-card">
        <div className={`${containerCx} py-14`}>
          <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <div className="max-w-xs">
              <Logo />
              <p className="mt-4 text-sm text-muted-foreground">
                {t("footer.tagline")}
              </p>
              <div className="mt-5 flex gap-4 text-sm font-medium text-muted-foreground">
                <a
                  href="#top"
                  className="transition-colors hover:text-foreground"
                >
                  X / Twitter
                </a>
                <a
                  href="#top"
                  className="transition-colors hover:text-foreground"
                >
                  Instagram
                </a>
                <a
                  href="#top"
                  className="transition-colors hover:text-foreground"
                >
                  LinkedIn
                </a>
              </div>
            </div>

            <FooterColumn
              title={t("footer.product.title")}
              links={[
                { label: t("footer.product.features"), href: "#features" },
                {
                  label: t("footer.product.howItWorks"),
                  href: "#how-it-works",
                },
                { label: t("footer.product.faq"), href: "#faq" },
              ]}
            />
            <FooterColumn
              title={t("footer.venues.title")}
              links={[
                { label: t("footer.venues.partner"), href: "#venues" },
                { label: t("footer.venues.demo"), href: "#venues" },
                { label: t("footer.venues.analytics"), href: "#venues" },
              ]}
            />
            <FooterColumn
              title={t("footer.company.title")}
              links={[
                { label: t("footer.company.about"), href: "#about" },
                { label: t("footer.company.privacy"), href: "#top" },
                { label: t("footer.company.terms"), href: "#top" },
              ]}
            />
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row">
            <p>{t("footer.copyright")}</p>
            <p className="font-mono text-xs">
              {t.rich("footer.themeHint", {
                kbd: (chunks) => (
                  <kbd className="rounded bg-muted px-1.5 py-0.5">{chunks}</kbd>
                ),
              })}
            </p>
          </div>
        </div>
      </footer>
    </>
  )
}

function FooterColumn({
  title,
  links,
}: {
  title: string
  links: { label: string; href: string }[]
}) {
  return (
    <div>
      <h3 className="font-heading text-sm font-semibold tracking-wide uppercase">
        {title}
      </h3>
      <ul className="mt-4 space-y-3">
        {links.map((link) => (
          <li key={link.label}>
            <a
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
