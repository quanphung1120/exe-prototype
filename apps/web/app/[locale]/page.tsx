import {
  ArrowRight,
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  ImageIcon,
  MapPin,
  MessageSquare,
  MessagesSquare,
  Search,
  Shield,
  Sparkles,
  Star,
  TrendingUp,
  Users,
} from "lucide-react"
import Image from "next/image"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { cn } from "@/lib/utils"
import { Faq, type FaqItem } from "@/components/faq"
import { Logo } from "@/components/logo"
import { Pricing } from "@/components/pricing"
import { Reveal } from "@/components/reveal"
import { CountUp } from "@/components/scroll/count-up"
import { HeroIntro } from "@/components/scroll/hero-intro"
import { OccupancyBars } from "@/components/scroll/occupancy-bars"
import { Parallax } from "@/components/scroll/parallax"
import { SiteHeader } from "@/components/site-header"
import { Link } from "@/i18n/navigation"

const SPORT_KEYS = ["pickleball", "badminton"]

const TRUST_LOGOS = [
  "Ace Pickleball Club",
  "Shuttle Republic",
  "Smash Pickleball",
  "Baseline Athletic",
  "Courtside Collective",
  "Net Gain Sports",
  "Rally Point Club",
  "Topspin Center",
]

const PLAYER_FEATURE_ICONS = [
  Sparkles,
  Users,
  CalendarCheck,
  MapPin,
  MessagesSquare,
]
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

/** Neutral image placeholder — section imagery is intentionally left blank. */
function Placeholder({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "bg-court-lines flex items-center justify-center overflow-hidden rounded-3xl border border-border bg-muted",
        className
      )}
      aria-hidden="true"
    >
      <ImageIcon className="size-8 text-muted-foreground/40" />
    </div>
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
        {/* Pulled up behind the transparent navbar so the photo bleeds under it. */}
        <section className="relative isolate -mt-32 overflow-hidden">
          {/* Hero photograph — anchored to the right, blended into the page. */}
          <div
            className="absolute inset-0 -z-10 overflow-hidden"
            aria-hidden="true"
          >
            <div className="absolute inset-y-0 right-0 w-full overflow-hidden sm:w-[50%]">
              <Parallax speed={0.22} className="absolute inset-0">
                <Image
                  src="/hero-modern.png"
                  alt=""
                  fill
                  priority
                  sizes="(min-width: 640px) 50vw, 100vw"
                  className="scale-110 object-cover object-center sm:translate-y-[16%] sm:scale-[1.22] sm:object-[5%_center]"
                />
              </Parallax>
              {/* Blend the image's left edge into the page. */}
              <div className="absolute inset-0 bg-gradient-to-r from-background via-background/55 to-transparent sm:via-background/15" />
            </div>
            {/* Lighten the very top so the transparent navbar stays legible. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-background via-background/50 to-transparent" />
            {/* Mobile: a flat veil so the headline stays readable over the photo. */}
            <div className="absolute inset-0 bg-background/45 sm:hidden" />
            {/* Fade the bottom into the page so the trust strip sits clean. */}
            <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-background" />
          </div>

          <div
            className={`${containerCx} pt-40 pb-20 sm:pt-48 sm:pb-28 lg:pt-56 lg:pb-32`}
          >
            <HeroIntro className="max-w-2xl">
              <h1
                data-hero-item
                className={`${displayCx} text-5xl leading-[0.95] uppercase sm:text-6xl lg:text-7xl`}
              >
                {t("hero.titleLine1")}
                <span className="block">{t("hero.titleLine2")}</span>
              </h1>

              {/* Lime accent rule. */}
              <span
                data-hero-item
                className="mt-6 block h-1.5 w-24 rounded-full bg-lime"
                aria-hidden="true"
              />

              <p
                data-hero-item
                className="mt-6 max-w-xl text-lg text-muted-foreground sm:text-xl"
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
        </section>

        {/* ── Trust strip (sliding marquee, overlaps the hero) ─ */}
        <section className="relative z-10 -mt-32 pt-32 sm:-mt-14">
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
        <section id="about" className="scroll-mt-20 py-20 sm:py-28">
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
                <div className="mt-8 grid grid-cols-2 gap-4">
                  <Placeholder className="aspect-[4/3]" />
                  <Placeholder className="aspect-[4/3]" />
                </div>
              </Reveal>

              <Reveal delayMs={120}>
                <Placeholder className="aspect-[4/5] lg:aspect-[3/4]" />
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
                  <article
                    className={`group flex h-full flex-col rounded-3xl border p-6 transition-colors ${
                      feature.featured
                        ? "border-primary/30 bg-gradient-to-br from-primary/[0.07] to-lime/[0.07]"
                        : "border-border bg-card hover:border-primary/40"
                    }`}
                  >
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <feature.icon className="size-6" />
                    </span>
                    <h3 className="mt-5 font-heading text-xl font-semibold">
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-muted-foreground">{feature.body}</p>
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
