import {
  BarChart3,
  CalendarCheck,
  CheckCircle2,
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
import { getTranslations, setRequestLocale } from "next-intl/server"

import { Faq, type FaqItem } from "@/components/faq"
import { Logo } from "@/components/logo"
import { Reveal } from "@/components/reveal"
import { SiteHeader } from "@/components/site-header"
import { WaitlistForm } from "@/components/waitlist-form"

const SPORT_KEYS = ["tennis", "pickleball", "badminton"]

const TRUST_LOGOS = [
  "Ace Tennis Club",
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
        <section className="relative overflow-hidden">
          {/* Decorative background */}
          <div
            className="pointer-events-none absolute -top-32 -left-24 size-[28rem] rounded-full bg-primary/20 blur-[120px]"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -top-20 right-0 size-[26rem] rounded-full bg-lime/20 blur-[120px]"
            aria-hidden="true"
          />

          <div className={`${containerCx} relative py-16 sm:py-24 lg:py-28`}>
            <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
              <h1 className="mt-6 font-heading text-5xl leading-[1.1] font-bold tracking-tight uppercase sm:text-6xl lg:text-7xl">
                {t("hero.titleLine1")}
                <span className="block bg-gradient-to-r from-primary to-lime bg-clip-text pb-2 text-transparent">
                  {t("hero.titleLine2")}
                </span>
              </h1>

              <p className="mt-5 max-w-xl text-lg text-muted-foreground sm:text-xl">
                {t("hero.subtitle")}
              </p>

              <div id="waitlist" className="mt-8 w-full max-w-xl scroll-mt-24">
                <WaitlistForm audience="player" inputId="hero-email" />
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {t("hero.sportsLabel")}
                </span>
                {SPORT_KEYS.map((sport) => (
                  <span
                    key={sport}
                    className="rounded-full border border-border bg-card px-3 py-1 text-sm font-medium text-foreground"
                  >
                    {tc(`sports.${sport}`)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Trust marquee ────────────────────────────────── */}
        <section className="border-y border-border bg-muted/40 py-8">
          <div className={containerCx}>
            <p className="text-center text-sm font-medium text-muted-foreground">
              {t("trust.caption")}
            </p>
          </div>
          <div
            className="group/marquee relative mt-6 flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_8%,#000_92%,transparent)]"
            aria-hidden="true"
          >
            <div className="animate-marquee flex w-max items-center gap-x-12 pr-12">
              {[...TRUST_LOGOS, ...TRUST_LOGOS].map((name, i) => (
                <span
                  key={i}
                  className="font-heading text-xl font-semibold whitespace-nowrap text-muted-foreground/70"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── Player features ──────────────────────────────── */}
        <section id="features" className="scroll-mt-20 py-20 sm:py-28">
          <div className={containerCx}>
            <Reveal className="max-w-2xl">
              <Eyebrow>{t("playerFeaturesSection.eyebrow")}</Eyebrow>
              <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
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
                    <h3 className="mt-5 font-heading text-xl font-bold">
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
              <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
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
                      <span className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-lime font-mono text-xs font-bold text-lime-foreground">
                        {i + 1}
                      </span>
                    </span>
                    <h3 className="mt-5 font-heading text-xl font-bold">
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
                    <dd className="font-heading text-4xl font-bold tracking-tight text-primary tabular-nums sm:text-5xl">
                      {stat.value}
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

        {/* ── For venues (B2B dark band) ───────────────────── */}
        <section id="venues" className="scroll-mt-20 py-12 sm:py-16">
          <div className={containerCx}>
            <div className="relative overflow-hidden rounded-[2rem] bg-zinc-950 px-6 py-14 text-zinc-50 sm:px-12 sm:py-20">
              <div
                className="bg-court-grid pointer-events-none absolute inset-0 opacity-40"
                aria-hidden="true"
              />
              <div
                className="pointer-events-none absolute -right-20 -bottom-24 size-96 rounded-full bg-emerald-500/20 blur-[120px]"
                aria-hidden="true"
              />
              <div className="relative grid gap-12 lg:grid-cols-2 lg:items-center">
                <div>
                  <p className="mb-3 inline-flex items-center gap-2 text-sm font-semibold tracking-wide text-lime-300 uppercase">
                    <span
                      className="h-px w-6 bg-lime-300/60"
                      aria-hidden="true"
                    />
                    {t("venuesSection.eyebrow")}
                  </p>
                  <h2 className="font-heading text-4xl font-bold tracking-tight sm:text-5xl">
                    {t("venuesSection.titleLine1")}
                    <br />
                    {t("venuesSection.titleLine2")}
                  </h2>
                  <p className="mt-4 max-w-lg text-lg text-zinc-300">
                    {t("venuesSection.subtitle")}
                  </p>

                  <dl className="mt-8 grid gap-x-6 gap-y-6 sm:grid-cols-2">
                    {venueBenefits.map((benefit) => (
                      <div key={benefit.title} className="flex gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                          <benefit.icon className="size-5" />
                        </span>
                        <div>
                          <dt className="font-heading text-lg font-bold">
                            {benefit.title}
                          </dt>
                          <dd className="mt-0.5 text-sm text-zinc-400">
                            {benefit.body}
                          </dd>
                        </div>
                      </div>
                    ))}
                  </dl>
                </div>

                {/* Mock occupancy dashboard + venue waitlist */}
                <div className="lg:pl-6">
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-heading text-lg font-bold">
                        {t("occupancy.title")}
                      </p>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                        <TrendingUp className="size-3.5" />
                        {t("occupancy.offPeakBadge")}
                      </span>
                    </div>
                    <div className="mt-6 flex items-end justify-between gap-2">
                      {[40, 55, 38, 72, 61, 88, 76].map((h, i) => (
                        <div
                          key={i}
                          className="flex flex-1 flex-col items-center gap-2"
                        >
                          <div className="flex h-28 w-full items-end">
                            <div
                              className="w-full rounded-t-md bg-gradient-to-t from-emerald-500 to-lime-300"
                              style={{ height: `${h}%` }}
                            />
                          </div>
                          <span className="font-mono text-[10px] text-zinc-500">
                            {t(`occupancy.weekdays.${i}`)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-6 grid grid-cols-3 gap-3 border-t border-white/10 pt-5 text-center">
                      <div>
                        <p className="font-heading text-2xl font-bold tabular-nums">
                          86%
                        </p>
                        <p className="text-xs text-zinc-500">
                          {t("occupancy.utilization")}
                        </p>
                      </div>
                      <div>
                        <p className="font-heading text-2xl font-bold tabular-nums">
                          128
                        </p>
                        <p className="text-xs text-zinc-500">
                          {t("occupancy.bookingsPerWeek")}
                        </p>
                      </div>
                      <div>
                        <p className="font-heading text-2xl font-bold tabular-nums">
                          4.9
                        </p>
                        <p className="text-xs text-zinc-500">
                          {t("occupancy.playerRating")}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5">
                    <WaitlistForm audience="venue" inputId="venue-email" />
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
              <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
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
                      <span className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-lime text-sm font-bold text-primary-foreground">
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

        {/* ── FAQ ──────────────────────────────────────────── */}
        <section id="faq" className="scroll-mt-20 bg-muted/40 py-20 sm:py-28">
          <div className={`${containerCx} max-w-3xl`}>
            <Reveal className="text-center">
              <Eyebrow>{t("faqSection.eyebrow")}</Eyebrow>
              <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
                {t("faqSection.title")}
              </h2>
            </Reveal>
            <Reveal className="mt-10">
              <Faq items={faqItems} />
            </Reveal>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────── */}
        <section className="py-20 sm:py-28">
          <div className={containerCx}>
            <div className="relative overflow-hidden rounded-[2rem] border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-lime/10 px-6 py-16 text-center sm:px-12 sm:py-20">
              <div
                className="bg-court-grid pointer-events-none absolute inset-0"
                aria-hidden="true"
              />
              <div className="relative mx-auto max-w-2xl">
                <h2 className="mt-5 font-heading text-4xl font-bold tracking-tight uppercase sm:text-6xl">
                  {t("cta.title")}
                </h2>
                <p className="mt-4 text-lg text-muted-foreground">
                  {t("cta.subtitle")}
                </p>
                <div className="mx-auto mt-8 max-w-xl text-left">
                  <WaitlistForm audience="player" inputId="cta-email" />
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
                  href="#waitlist"
                  className="transition-colors hover:text-foreground"
                >
                  X / Twitter
                </a>
                <a
                  href="#waitlist"
                  className="transition-colors hover:text-foreground"
                >
                  Instagram
                </a>
                <a
                  href="#waitlist"
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
                { label: t("footer.product.waitlist"), href: "#waitlist" },
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
                { label: t("footer.company.about"), href: "#top" },
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
      <h3 className="font-heading text-sm font-bold tracking-wide uppercase">
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
