import {
  ArrowRight,
  BarChart3,
  Bot,
  CalendarCheck,
  CheckCircle2,
  MapPin,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Trophy,
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
        {/* Cinematic canvas card: a deep-emerald panel holding a monochrome
            jump-smash photo that melts into the panel through a gradient, with
            giant condensed type. Fixed dark surface in both themes so lime is
            the only saturated element. */}
        <section className="relative px-4 pt-2 sm:px-6 lg:px-8">
          <HeroIntro className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-[2.5rem] bg-[#0b1a13]">
            {/* Jump-smash photo: blended top band on mobile, right half on lg. */}
            <div className="absolute inset-x-0 top-0 h-[46%] sm:h-[55%] lg:inset-y-0 lg:left-auto lg:right-0 lg:h-auto lg:w-[52%]">
              <Parallax speed={0.12} className="absolute inset-x-0 -inset-y-16">
                <Image
                  src="/hero-court.jpg"
                  alt={t("hero.imageAlt")}
                  fill
                  priority
                  sizes="(min-width: 1024px) 52vw, 100vw"
                  className="object-cover object-[50%_35%] grayscale contrast-[1.06] brightness-[0.92]"
                />
              </Parallax>
              {/* Emerald duotone tint over the B&W photo. */}
              <div
                className="absolute inset-0 bg-emerald-700/25 mix-blend-color"
                aria-hidden="true"
              />
              {/* Melt the photo into the panel: bottom-up on mobile, right-to-left on lg. */}
              <div
                className="absolute inset-0 bg-linear-to-t from-[#0b1a13] via-[#0b1a13]/35 to-transparent lg:bg-linear-to-l lg:from-transparent lg:via-[#0b1a13]/25 lg:to-[#0b1a13]"
                aria-hidden="true"
              />
            </div>

            <div className="relative px-6 pt-[52vw] pb-12 sm:px-10 sm:pt-[44vw] sm:pb-14 lg:flex lg:min-h-[660px] lg:w-[60%] lg:flex-col lg:justify-center lg:px-14 lg:py-24 xl:min-h-[720px]">
              <h1
                data-hero-item
                className="font-heading max-w-[13ch] text-5xl leading-[0.95] font-bold tracking-tight text-white uppercase sm:text-7xl xl:text-[5.25rem]"
              >
                {t.rich("hero.title", {
                  accent: (chunks) => (
                    <span className="text-lime whitespace-nowrap">{chunks}</span>
                  ),
                })}
              </h1>

              {/* Lime accent rule. */}
              <span
                data-hero-item
                className="mt-7 block h-1.5 w-24 rounded-full bg-lime"
                aria-hidden="true"
              />

              <p
                data-hero-item
                className="mt-6 max-w-md text-lg text-zinc-300 sm:text-xl"
              >
                {t("hero.subtitle")}
              </p>

              <div
                data-hero-item
                className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4"
              >
                <Link
                  href="/sign-up"
                  className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-4xl bg-lime px-7 text-base font-medium text-lime-foreground transition hover:-translate-y-0.5 hover:bg-lime/90 focus-visible:ring-3 focus-visible:ring-lime/40 focus-visible:outline-none active:scale-[0.98]"
                >
                  {t("hero.cta")}
                  <ArrowRight className="size-4" />
                </Link>
                <Link
                  href="#how-it-works"
                  className="text-base font-medium text-white underline decoration-white/30 underline-offset-8 transition-colors hover:decoration-lime"
                >
                  {t("hero.ctaSecondary")}
                </Link>
              </div>
            </div>
          </HeroIntro>
        </section>

        {/* ── Trust strip (sliding marquee) ─ */}
        <section className="relative z-10 pt-10 sm:pt-6">
          <div className={containerCx}>
            <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-card/60 px-6 py-6 shadow-md backdrop-blur-xl sm:px-8">
              {/* Subtle top accent line */}
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-lime to-transparent opacity-80" />

              <div className="mb-4 flex flex-col items-center justify-between gap-3 border-b border-border/40 pb-3 sm:flex-row">
                <div className="flex items-center gap-2">
                  <span className="relative flex size-2.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-lime opacity-75" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-lime" />
                  </span>
                  <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    {t("trust.caption")}
                  </span>
                </div>
                <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-0.5 font-mono text-[11px] font-medium text-primary">
                  40+ Partner Clubs
                </span>
              </div>

              <div
                className="group/marquee relative flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_10%,#000_90%,transparent)]"
                aria-hidden="true"
              >
                <div className="animate-marquee flex w-max items-center gap-x-8 pr-8 sm:gap-x-12 sm:pr-12">
                  {[...TRUST_LOGOS, ...TRUST_LOGOS].map((name, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-muted/40 px-4 py-2 transition-all duration-300 hover:border-lime/40 hover:bg-card hover:shadow-xs"
                    >
                      <Trophy className="size-4 shrink-0 text-lime" />
                      <span className="font-heading text-sm font-semibold whitespace-nowrap text-foreground/80 sm:text-base">
                        {name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── About ────────────────────────────────────────── */}
        <section
          id="about"
          className="relative scroll-mt-20 overflow-hidden py-20 sm:py-28"
        >
          {/* Ambient light glow */}
          <div className="pointer-events-none absolute top-1/2 left-0 size-96 -translate-y-1/2 rounded-full bg-primary/10 blur-[140px]" />

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
                <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
                  {t("aboutSection.body")}
                </p>
                <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {aboutFeatures.map((feature, i) => (
                    <div
                      key={feature.title}
                      className="group rounded-2xl border border-border/80 bg-card/80 p-5 backdrop-blur-sm transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-emerald-600 text-white shadow-md shadow-primary/20 transition-transform duration-300 group-hover:scale-110">
                          <feature.icon className="size-5" />
                        </span>
                        <span className="rounded-full bg-lime/10 px-2.5 py-0.5 font-mono text-[10px] font-bold text-lime-foreground dark:text-lime-300">
                          {i === 0 ? "Fast AI" : "Realtime"}
                        </span>
                      </div>
                      <h3 className="mt-4 font-heading text-lg font-bold text-foreground">
                        {feature.title}
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {feature.body}
                      </p>
                    </div>
                  ))}
                </div>
              </Reveal>

              <Reveal delayMs={120}>
                <div className="relative">
                  {/* Floating status tag */}
                  <div className="absolute -top-4 -left-4 z-20 hidden items-center gap-2 rounded-full border border-border/80 bg-card/90 px-4 py-2 shadow-xl backdrop-blur-md sm:flex">
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-lime opacity-75" />
                      <span className="relative inline-flex size-2 rounded-full bg-lime" />
                    </span>
                    <span className="text-xs font-semibold text-foreground">
                      SportMatch AI Sync Active
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="mt-10 flex flex-col gap-4">
                      <div className="group relative aspect-[4/5] overflow-hidden rounded-3xl border border-border/80 shadow-lg">
                        <Image
                          src="/about-catch.png"
                          alt=""
                          fill
                          sizes="(min-width: 1024px) 25vw, 45vw"
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 via-transparent to-transparent p-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                          <span className="text-xs font-medium text-white">
                            Matchmaking chính xác
                          </span>
                        </div>
                      </div>
                      <div className="group relative aspect-square overflow-hidden rounded-3xl border border-border/80 shadow-lg">
                        <Image
                          src="/about-racket.jpg"
                          alt=""
                          fill
                          sizes="(min-width: 1024px) 25vw, 45vw"
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-4">
                      <div className="group relative aspect-square overflow-hidden rounded-3xl border border-border/80 shadow-lg">
                        <Image
                          src="/about-court.png"
                          alt=""
                          fill
                          sizes="(min-width: 1024px) 25vw, 45vw"
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>
                      <div className="group relative aspect-[4/5] overflow-hidden rounded-3xl border border-border/80 shadow-lg">
                        <Image
                          src="/about-action.jpg"
                          alt=""
                          fill
                          sizes="(min-width: 1024px) 25vw, 45vw"
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 via-transparent to-transparent p-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                          <span className="text-xs font-medium text-white">
                            Ghép theo trình độ
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── Player features (Bento Grid) ─────────────────── */}
        <section id="features" className="scroll-mt-20 py-20 sm:py-28">
          <div className={containerCx}>
            <Reveal className="mx-auto max-w-3xl text-center">
              <Eyebrow>{t("playerFeaturesSection.eyebrow")}</Eyebrow>
              <h2 className={`${displayCx} text-4xl sm:text-5xl`}>
                {t("playerFeaturesSection.title")}
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                {t("playerFeaturesSection.subtitle")}
              </p>
            </Reveal>

            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {/* Feature 0: AI Assistant (Spans 2 columns) */}
              <Reveal delayMs={0} className="sm:col-span-2">
                <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-primary/[0.08] via-card to-lime/[0.08] p-7 transition-all duration-300 hover:border-lime/50 hover:shadow-xl hover:shadow-lime/5">
                  <div className="flex items-center justify-between">
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-lime text-lime-foreground shadow-md shadow-lime/20">
                      <Sparkles className="size-6" />
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-lime/30 bg-lime/10 px-3 py-1 font-mono text-xs font-bold text-lime-foreground dark:text-lime-300">
                      <Bot className="size-3.5" />
                      Smart AI Matcher
                    </span>
                  </div>

                  <h3 className="mt-6 font-heading text-2xl font-bold">
                    {t("playerFeatures.0.title")}
                  </h3>
                  <p className="mt-2 text-muted-foreground leading-relaxed max-w-xl">
                    {t("playerFeatures.0.body")}
                  </p>

                  {/* Interactive UI Mockup */}
                  <div className="mt-7 rounded-2xl border border-border/60 bg-card/90 p-4 shadow-sm backdrop-blur-md">
                    <div className="flex items-start gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-bold text-xs">
                        Bạn
                      </span>
                      <div className="flex-1 rounded-2xl bg-muted/80 p-3 text-sm text-foreground">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                          {t("playerFeatures.0.demoRequestLabel")}
                        </p>
                        <p className="mt-1 font-medium">
                          {t("playerFeatures.0.demoRequest")}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-start gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-lime text-lime-foreground font-bold text-xs shadow-xs">
                        AI
                      </span>
                      <div className="flex-1 rounded-2xl border border-lime/30 bg-lime/15 p-3 text-sm text-foreground dark:text-lime-100">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-bold text-lime-foreground/80 dark:text-lime-300 uppercase tracking-wide">
                            {t("playerFeatures.0.demoResponseLabel")}
                          </p>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-lime-foreground bg-lime px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="size-3" /> Ready
                          </span>
                        </div>
                        <p className="mt-1.5 font-medium leading-normal">
                          {t("playerFeatures.0.demoResponse")}
                        </p>
                      </div>
                    </div>
                  </div>
                </article>
              </Reveal>

              {/* Feature 1: Skill Rating */}
              <Reveal delayMs={60}>
                <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-border/80 bg-card p-7 transition-all duration-300 hover:border-primary/40 hover:shadow-lg">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
                    <Users className="size-6" />
                  </span>
                  <h3 className="mt-6 font-heading text-xl font-bold">
                    {t("playerFeatures.1.title")}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {t("playerFeatures.1.body")}
                  </p>

                  <div className="mt-6 rounded-2xl border border-border/60 bg-muted/30 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                        {t("playerFeatures.1.demoLabel")}
                      </p>
                      <span className="rounded-full bg-lime px-3 py-1 font-mono text-xs font-bold text-lime-foreground shadow-xs">
                        {t("playerFeatures.1.demoBadge")}
                      </span>
                    </div>
                    <div className="mt-3.5 space-y-2">
                      <div className="flex justify-between text-xs font-medium">
                        <span>Match Balancing</span>
                        <span className="text-primary font-bold">98% Match</span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full w-[88%] rounded-full bg-gradient-to-r from-emerald-500 to-lime" />
                      </div>
                    </div>
                  </div>
                </article>
              </Reveal>

              {/* Feature 2: Instant Booking */}
              <Reveal delayMs={120}>
                <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-border/80 bg-card p-7 transition-all duration-300 hover:border-primary/40 hover:shadow-lg">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-foreground">
                    <CalendarCheck className="size-6 text-primary" />
                  </span>
                  <h3 className="mt-6 font-heading text-xl font-bold">
                    {t("playerFeatures.2.title")}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {t("playerFeatures.2.body")}
                  </p>

                  <div className="mt-6 space-y-2.5">
                    <div className="inline-flex w-full items-center justify-between rounded-xl border border-border/60 bg-card px-4 py-3 text-sm font-semibold shadow-xs">
                      <span className="flex items-center gap-2">
                        <Zap className="size-4 text-lime fill-lime" />
                        {t("playerFeatures.2.demoCta")}
                      </span>
                      <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 font-bold dark:text-lime-300">
                        3 sec
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <span className="rounded-lg border border-lime/40 bg-lime/10 p-2 font-bold text-lime-foreground dark:text-lime-300">
                        18:00 (Sân 1)
                      </span>
                      <span className="rounded-lg border border-border p-2 text-muted-foreground">
                        19:00 (Sân 2)
                      </span>
                      <span className="rounded-lg border border-border p-2 text-muted-foreground">
                        20:00 (Sân 3)
                      </span>
                    </div>
                  </div>
                </article>
              </Reveal>

              {/* Feature 3: Nearby Court Map (Spans 2 columns) */}
              <Reveal delayMs={180} className="sm:col-span-2">
                <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-border/80 bg-card p-7 transition-all duration-300 hover:border-primary/40 hover:shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-foreground">
                      <MapPin className="size-6 text-primary" />
                    </span>
                    <span className="rounded-full bg-primary/10 px-3 py-1 font-mono text-xs font-semibold text-primary">
                      GPS Realtime
                    </span>
                  </div>

                  <h3 className="mt-6 font-heading text-xl font-bold">
                    {t("playerFeatures.3.title")}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground max-w-xl">
                    {t("playerFeatures.3.body")}
                  </p>

                  <div
                    className="relative mt-6 aspect-[21/9] min-h-[160px] overflow-hidden rounded-2xl bg-muted/60 border border-border/60"
                    aria-hidden="true"
                  >
                    {/* map background grid */}
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.08] via-transparent to-lime/[0.12]" />

                    {/* city blocks */}
                    <div className="absolute top-[12%] left-[10%] size-12 rounded-xl bg-foreground/[0.05]" />
                    <div className="absolute top-[18%] right-[15%] size-9 rounded-xl bg-foreground/[0.05]" />
                    <div className="absolute bottom-[16%] left-[20%] size-10 rounded-xl bg-foreground/[0.05]" />
                    <div className="absolute right-[10%] bottom-[12%] size-14 rounded-xl bg-foreground/[0.05]" />

                    {/* map vector grid */}
                    <svg
                      className="absolute inset-0 size-full"
                      viewBox="0 0 400 160"
                      preserveAspectRatio="none"
                      fill="none"
                    >
                      <g className="text-border/60" stroke="currentColor">
                        <path d="M0 40H400M0 90H400M0 130H400" strokeWidth="1" />
                        <path d="M70 0V160M180 0V160M310 0V160" strokeWidth="1" />
                      </g>
                      <path
                        d="M0 65Q140 30 240 85T400 110"
                        className="text-lime"
                        stroke="currentColor"
                        strokeWidth="4"
                        strokeLinecap="round"
                        opacity="0.7"
                      />
                    </svg>

                    {/* pulse indicator */}
                    <span className="absolute top-[65%] left-[25%] flex size-4 -translate-x-1/2 -translate-y-1/2">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
                      <span className="relative inline-flex size-4 rounded-full bg-primary ring-4 ring-background" />
                    </span>

                    {/* pins */}
                    <div className="absolute top-[32%] left-[45%] -translate-x-1/2 -translate-y-full">
                      <MapPin className="mx-auto size-6 fill-lime text-lime-foreground drop-shadow-md" />
                      <span className="mt-0.5 block rounded-full bg-lime px-2.5 py-0.5 text-center font-mono text-[11px] font-bold text-lime-foreground shadow-md">
                        650m • 3 sân trống
                      </span>
                    </div>
                    <div className="absolute top-[48%] left-[78%] -translate-x-1/2 -translate-y-full">
                      <MapPin className="mx-auto size-5 fill-primary text-primary-foreground drop-shadow-sm" />
                      <span className="mt-0.5 block rounded-full border border-border bg-card px-2 py-0.5 text-center font-mono text-[10px] font-semibold text-foreground shadow-xs">
                        1.4km
                      </span>
                    </div>
                  </div>
                </article>
              </Reveal>

              {/* Feature 4: Community Chat */}
              <Reveal delayMs={240}>
                <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-border/80 bg-card p-7 transition-all duration-300 hover:border-primary/40 hover:shadow-lg">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-foreground">
                    <MessagesSquare className="size-6 text-primary" />
                  </span>
                  <h3 className="mt-6 font-heading text-xl font-bold">
                    {t("playerFeatures.4.title")}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {t("playerFeatures.4.body")}
                  </p>

                  <div className="mt-6 space-y-2.5">
                    <div className="rounded-xl border border-border/60 bg-muted/40 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-foreground">
                          {t("playerFeatures.4.demoName")}
                        </p>
                        <span className="text-[10px] text-muted-foreground">17:42</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("playerFeatures.4.demoMessage")}
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-lime px-3.5 py-1.5 font-mono text-xs font-bold text-lime-foreground shadow-xs">
                      <CheckCircle2 className="size-4" />
                      {t("playerFeatures.4.demoConfirm")}
                    </div>
                  </div>
                </article>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────── */}
        <section
          id="how-it-works"
          className="relative scroll-mt-20 overflow-hidden bg-muted/40 py-20 sm:py-28 border-y border-border/50"
        >
          <div className={containerCx}>
            <Reveal className="mx-auto max-w-2xl text-center">
              <Eyebrow>{t("stepsSection.eyebrow")}</Eyebrow>
              <h2 className={`${displayCx} text-4xl sm:text-5xl`}>
                {t("stepsSection.title")}
              </h2>
            </Reveal>

            <div className="relative mt-16 grid gap-8 md:grid-cols-3">
              {/* connector line on desktop */}
              <div
                className="pointer-events-none absolute top-10 right-[16%] left-[16%] hidden border-t-2 border-dashed border-primary/30 md:block"
                aria-hidden="true"
              />

              {steps.map((step, i) => (
                <Reveal key={step.title} delayMs={i * 120}>
                  <div className="group relative flex flex-col items-center text-center">
                    <span className="relative z-10 flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-emerald-700 text-primary-foreground shadow-xl shadow-primary/25 transition-transform duration-300 group-hover:scale-110">
                      <step.icon className="size-8" />
                      <span className="absolute -top-2 -right-2 flex size-8 items-center justify-center rounded-full bg-lime font-mono text-sm font-bold text-lime-foreground shadow-md ring-4 ring-background">
                        0{i + 1}
                      </span>
                    </span>
                    <h3 className="mt-6 font-heading text-xl font-bold">
                      {step.title}
                    </h3>
                    <p className="mt-2.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
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
              <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-card via-card to-primary/[0.05] p-2 shadow-xl">
                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-border/60 lg:grid-cols-4">
                  {stats.map((stat, i) => (
                    <div
                      key={stat.label}
                      className="group flex flex-col items-center justify-center gap-1.5 bg-card p-8 text-center transition-colors hover:bg-card/60"
                    >
                      <dt className="sr-only">{stat.label}</dt>
                      <dd className="font-heading text-4xl font-extrabold tracking-tight text-primary tabular-nums sm:text-5xl group-hover:scale-105 transition-transform duration-300">
                        <CountUp value={stat.value} />
                      </dd>
                      <p className="mt-1 text-sm font-semibold text-muted-foreground">
                        {stat.label}
                      </p>
                    </div>
                  ))}
                </dl>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── For venues (Dark Emerald SaaS Panel) ───────── */}
        <section id="venues" className="scroll-mt-20 py-12 sm:py-16">
          <div className={containerCx}>
            <div className="relative overflow-hidden rounded-[2.5rem] border border-emerald-900/60 bg-[#0b1a13] px-6 py-14 text-white shadow-2xl sm:px-12 sm:py-20">
              {/* Radial glow background */}
              <div
                className="pointer-events-none absolute -right-20 -bottom-24 size-96 rounded-full bg-lime/20 blur-[130px]"
                aria-hidden="true"
              />

              <div className="relative grid gap-12 lg:grid-cols-2 lg:items-center">
                <div>
                  <p className="mb-3 inline-flex items-center gap-2 text-sm font-semibold tracking-wider text-lime uppercase">
                    <span
                      className="h-px w-6 bg-lime/60"
                      aria-hidden="true"
                    />
                    {t("venuesSection.eyebrow")}
                  </p>
                  <h2 className={`${displayCx} text-4xl sm:text-5xl text-white`}>
                    {t("venuesSection.titleLine1")}
                    <br />
                    <span className="text-lime">{t("venuesSection.titleLine2")}</span>
                  </h2>
                  <p className="mt-5 max-w-lg text-lg text-emerald-100/80 leading-relaxed">
                    {t("venuesSection.subtitle")}
                  </p>

                  <dl className="mt-8 grid gap-x-6 gap-y-6 sm:grid-cols-2">
                    {venueBenefits.map((benefit) => (
                      <div key={benefit.title} className="flex gap-3.5">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-lime/15 text-lime border border-lime/30 shadow-xs">
                          <benefit.icon className="size-5" />
                        </span>
                        <div>
                          <dt className="font-heading text-base font-bold text-white">
                            {benefit.title}
                          </dt>
                          <dd className="mt-1 text-xs text-emerald-200/70 leading-relaxed">
                            {benefit.body}
                          </dd>
                        </div>
                      </div>
                    ))}
                  </dl>
                </div>

                {/* Mock occupancy dashboard + venue waitlist */}
                <div className="lg:pl-6">
                  <div className="rounded-3xl border border-white/15 bg-white/[0.07] p-7 backdrop-blur-xl shadow-2xl">
                    <div className="flex items-center justify-between border-b border-white/10 pb-4">
                      <div className="flex items-center gap-2.5">
                        <BarChart3 className="size-5 text-lime" />
                        <p className="font-heading text-lg font-bold text-white">
                          {t("occupancy.title")}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-lime/30 bg-lime/15 px-3 py-1 text-xs font-bold text-lime">
                        <TrendingUp className="size-3.5" />
                        {t("occupancy.offPeakBadge")}
                      </span>
                    </div>

                    <OccupancyBars
                      labels={[0, 1, 2, 3, 4, 5, 6].map((i) =>
                        t(`occupancy.weekdays.${i}`)
                      )}
                    />

                    <div className="mt-6 grid grid-cols-3 gap-3 border-t border-white/10 pt-5 text-center">
                      <div className="rounded-xl bg-white/5 p-3">
                        <p className="font-heading text-2xl font-bold text-lime tabular-nums">
                          <CountUp value="86%" />
                        </p>
                        <p className="mt-0.5 text-[11px] font-medium text-emerald-200/60">
                          {t("occupancy.utilization")}
                        </p>
                      </div>
                      <div className="rounded-xl bg-white/5 p-3">
                        <p className="font-heading text-2xl font-bold text-white tabular-nums">
                          <CountUp value="128" />
                        </p>
                        <p className="mt-0.5 text-[11px] font-medium text-emerald-200/60">
                          {t("occupancy.bookingsPerWeek")}
                        </p>
                      </div>
                      <div className="rounded-xl bg-white/5 p-3">
                        <p className="font-heading text-2xl font-bold text-lime tabular-nums">
                          <CountUp value="4.9" />
                        </p>
                        <p className="mt-0.5 text-[11px] font-medium text-emerald-200/60">
                          {t("occupancy.playerRating")}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end">
                    <Link
                      href="/sign-up"
                      className="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl bg-lime px-7 text-base font-bold text-lime-foreground shadow-lg shadow-lime/20 transition-all duration-300 hover:bg-lime/90 hover:shadow-lime/30 focus-visible:ring-3 focus-visible:ring-lime/40 focus-visible:outline-none sm:w-auto"
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

            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {testimonials.map((testimonial, i) => (
                <Reveal key={testimonial.name} delayMs={i * 90}>
                  <figure className="group flex h-full flex-col justify-between rounded-3xl border border-border/80 bg-card/80 p-7 backdrop-blur-sm transition-all duration-300 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5">
                    <div>
                      <div className="flex items-center justify-between">
                        <div
                          className="flex gap-1 text-lime"
                          aria-label={t("testimonialsSection.ratingAria")}
                        >
                          {Array.from({ length: 5 }).map((_, s) => (
                            <Star
                              key={s}
                              className="size-4 fill-current text-lime"
                              aria-hidden="true"
                            />
                          ))}
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-lime-300">
                          <ShieldCheck className="size-3" /> Verified
                        </span>
                      </div>
                      <blockquote className="mt-5 text-foreground leading-relaxed font-medium">
                        “{testimonial.quote}”
                      </blockquote>
                    </div>

                    <figcaption className="mt-6 flex items-center gap-3.5 border-t border-border/50 pt-4">
                      <span className="flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-primary to-lime font-mono text-sm font-bold text-primary-foreground shadow-md">
                        {testimonial.initials}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-foreground">
                          {testimonial.name}
                        </p>
                        <p className="text-xs text-muted-foreground font-medium">
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
            <Reveal className="mt-14">
              <Pricing />
            </Reveal>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────── */}
        <section id="faq" className="scroll-mt-20 bg-muted/40 py-20 sm:py-28 border-t border-border/50">
          <div className={`${containerCx} max-w-3xl`}>
            <Reveal className="text-center">
              <Eyebrow>{t("faqSection.eyebrow")}</Eyebrow>
              <h2 className={`${displayCx} text-4xl sm:text-5xl`}>
                {t("faqSection.title")}
              </h2>
            </Reveal>
            <Reveal className="mt-12">
              <Faq items={faqItems} />
            </Reveal>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────── */}
        <section id="get-started" className="scroll-mt-24 py-20 sm:py-28">
          <div className={containerCx}>
            <div className="relative overflow-hidden rounded-[2.5rem] border border-lime/40 bg-gradient-to-br from-[#0b1a13] via-card to-[#0b1a13] px-6 py-16 text-center text-white shadow-2xl sm:px-12 sm:py-24">
              {/* Background ambient light */}
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--color-lime)_0%,transparent_70%)] opacity-10" />

              <div className="relative mx-auto max-w-2xl">
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-lime/30 bg-lime/10 px-4 py-1.5 font-mono text-xs font-bold text-lime">
                  <Sparkles className="size-3.5" />
                  Sẵn sàng trải nghiệm ngay hôm nay
                </div>

                <h2 className={`${displayCx} text-4xl uppercase sm:text-6xl text-white`}>
                  {t("cta.title")}
                </h2>
                <p className="mt-5 text-lg text-zinc-300 leading-relaxed">
                  {t("cta.subtitle")}
                </p>

                <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <Link
                    href="/sign-up"
                    className="inline-flex h-13 w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl bg-lime px-8 text-base font-bold text-lime-foreground shadow-xl shadow-lime/20 transition-all duration-300 hover:bg-lime/90 hover:scale-105 active:scale-95 sm:w-auto"
                  >
                    {t("hero.cta")}
                    <ArrowRight className="size-5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="border-t border-border/80 bg-card/60 backdrop-blur-md">
        <div className={`${containerCx} py-16`}>
          <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <div className="max-w-xs">
              <Logo />
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                {t("footer.tagline")}
              </p>
              <div className="mt-6 flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1.5 text-xs font-semibold text-muted-foreground w-fit">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                Hệ thống hoạt động 100%
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

          <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-border/60 pt-8 text-sm text-muted-foreground sm:flex-row">
            <p>{t("footer.copyright")}</p>
            <p className="font-mono text-xs">
              {t.rich("footer.themeHint", {
                kbd: (chunks) => (
                  <kbd className="rounded bg-muted px-1.5 py-0.5 font-semibold text-foreground">
                    {chunks}
                  </kbd>
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
