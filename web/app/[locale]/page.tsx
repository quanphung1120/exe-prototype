import {
  ArrowRight,
  ArrowUpRight,
  CalendarCheck,
  MapPin,
  MessageCircle,
  MessagesSquare,
  Star,
  Users,
} from "lucide-react"
import Image from "next/image"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { Logo } from "@/components/logo"
import { Faq } from "@/features/landing/faq"
import { Pricing } from "@/features/landing/pricing"
import { CountUp } from "@/features/landing/scroll/count-up"
import { SiteHeader } from "@/features/landing/site-header"
import { Link } from "@/i18n/navigation"
import styles from "@/features/landing/landing.module.css"

const FEATURE_ICONS = [
  MessageCircle,
  Users,
  CalendarCheck,
  MapPin,
  MessagesSquare,
]
const TESTIMONIALS = [
  { name: "Maya R.", initials: "MR" },
  { name: "Daniel K.", initials: "DK" },
  { name: "Priya S.", initials: "PS" },
]

// Preserve the existing landing CTA, including hover and keyboard-focus styles.
const ctaClassName =
  "inline-flex h-12 cursor-pointer items-center gap-2 rounded-4xl bg-lime px-7 text-base font-medium text-lime-foreground transition-colors hover:bg-lime/90 focus-visible:ring-3 focus-visible:ring-lime/40 focus-visible:outline-none"

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("Landing")
  const faqItems = [0, 1, 2, 3, 4].map((i) => ({
    question: t(`faq.${i}.question`),
    answer: t(`faq.${i}.answer`),
  }))

  return (
    <div className={styles.landing}>
      <SiteHeader className={styles.header} />
      <main id="top" className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <h1>
              {t("hero.titleLine1")}
              <br />
              {t.rich("hero.titleLine2", {
                accent: (chunks) => <span>{chunks}</span>,
              })}
            </h1>
            <p className={styles.subtitle}>{t("hero.subtitle")}</p>
          </div>
          <div className={styles.heroImage}>
            <Image
              src="/landing-page-top.jpg"
              alt={t("hero.imageAlt")}
              width={1440}
              height={2560}
              preload
              sizes="(min-width: 1280px) 563px, 51vw"
            />
          </div>
        </section>

        <section className={styles.trust}>
          <div>
            <h2>{t("trust.caption")}</h2>
            <p>
              <ArrowUpRight aria-hidden="true" />
              {t("hero.socialProof")}
            </p>
          </div>
        </section>

        <div className={styles.lightPanel}>
          <section id="about" className={styles.about}>
            <div className={styles.aboutPhotoLeft}>
              <Image
                src="/left-landing-page.jpg"
                alt={t("aboutSection.leftImageAlt")}
                fill
                sizes="(min-width: 900px) 280px, 35vw"
                className="object-cover"
              />
            </div>
            <div className={styles.aboutCopy}>
              <h2>{t("aboutSection.titleStrong")}</h2>
              <p>{t("aboutSection.body")}</p>
              <Link href="/sign-up" className={ctaClassName}>
                {t("hero.cta")}
                <ArrowRight className="size-4" />
              </Link>
            </div>
            <div className={styles.aboutPhotoRight}>
              <Image
                src="/right-landing-page.jpg"
                alt={t("aboutSection.rightImageAlt")}
                fill
                sizes="(min-width: 900px) 360px, 35vw"
                quality={100}
                className="object-cover object-right"
              />
            </div>
          </section>

          <section id="features" className={styles.features}>
            <div className={styles.sectionHeading}>
              <p className={styles.eyebrow}>
                {t("playerFeaturesSection.eyebrow")}
              </p>
              <h2>{t("playerFeaturesSection.title")}</h2>
              <p>{t("playerFeaturesSection.subtitle")}</p>
            </div>
            <div className={styles.featureGrid}>
              {FEATURE_ICONS.map((Icon, i) => (
                <article key={i} className={styles.feature}>
                  <div className={styles.featureTop}>
                    <Icon aria-hidden="true" />
                    <span aria-hidden="true">0{i + 1}</span>
                  </div>
                  <h3>{t(`playerFeatures.${i}.title`)}</h3>
                  <p>{t(`playerFeatures.${i}.body`)}</p>
                  {i === 0 && (
                    <div className={styles.chatPreview}>
                      <p>{t("playerFeatures.0.demoRequest")}</p>
                      <p>{t("playerFeatures.0.demoResponse")}</p>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section id="how-it-works" className={styles.steps}>
            <div className={styles.sectionHeading}>
              <p className={styles.eyebrow}>{t("stepsSection.eyebrow")}</p>
              <h2>{t("stepsSection.title")}</h2>
            </div>
            <ol className={styles.stepGrid}>
              {[0, 1, 2].map((i) => (
                <li key={i}>
                  <span className={styles.stepNumber}>0{i + 1}</span>
                  <h3>{t(`steps.${i}.title`)}</h3>
                  <p>{t(`steps.${i}.body`)}</p>
                </li>
              ))}
            </ol>
            <Link href="/sign-up" className={ctaClassName}>
              {t("hero.cta")}
              <ArrowRight className="size-4" />
            </Link>
          </section>
        </div>

        <section className={styles.stats}>
          <p className={`${styles.eyebrow} ${styles.statsTitle}`}>
            {t("statsSection.title")}
          </p>
          <dl>
            {[0, 1, 2].map((i) => (
              <div key={i}>
                <dt>{t(`stats.${i}.label`)}</dt>
                <dd>
                  <CountUp value={t(`stats.${i}.value`)} />
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={styles.testimonials}>
          <div className={styles.sectionHeading}>
            <h2>{t("testimonialsSection.title")}</h2>
          </div>
          <div className={styles.quoteGrid}>
            {TESTIMONIALS.map((person, i) => (
              <figure key={person.name}>
                <div
                  className={styles.stars}
                  aria-label={t("testimonialsSection.ratingAria")}
                >
                  {[0, 1, 2, 3, 4].map((star) => (
                    <Star
                      key={star}
                      className="size-4 fill-current"
                      aria-hidden="true"
                    />
                  ))}
                </div>
                <blockquote>“{t(`testimonials.${i}.quote`)}”</blockquote>
                <figcaption>
                  <span className={styles.avatar}>{person.initials}</span>
                  <div>
                    <strong>{person.name}</strong>
                    <p>{t(`testimonials.${i}.role`)}</p>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section id="venues" className={styles.venues}>
          <div>
            <p className={styles.eyebrow}>{t("venuesSection.eyebrow")}</p>
            <h2>
              {t("venuesSection.titleLine1")}
              <br />
              <span>{t("venuesSection.titleLine2")}</span>
            </h2>
            <p>{t("venuesSection.subtitle")}</p>
          </div>
          <div className={styles.venueBenefits}>
            {[0, 1, 2, 3].map((i) => (
              <article key={i}>
                <ArrowUpRight aria-hidden="true" />
                <h3>{t(`venueBenefits.${i}.title`)}</h3>
                <p>{t(`venueBenefits.${i}.body`)}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="pricing" className={styles.pricing}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>{t("pricingSection.eyebrow")}</p>
            <h2>{t("pricingSection.title")}</h2>
            <p>{t("pricingSection.subtitle")}</p>
          </div>
          <Pricing />
        </section>

        <section id="faq" className={styles.faq}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>{t("faqSection.eyebrow")}</p>
            <h2>{t("faqSection.title")}</h2>
          </div>
          <Faq items={faqItems} />
        </section>

        <section id="get-started" className={styles.finalCta}>
          <p className={styles.eyebrow}>YOUR NEXT MATCH STARTS HERE</p>
          <h2>{t("cta.title")}</h2>
          <p>{t("cta.subtitle")}</p>
          <Link href="/sign-up" className={ctaClassName}>
            {t("hero.cta")}
            <ArrowRight className="size-4" />
          </Link>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerGrid}>
          <div>
            <Logo />
            <p>{t("footer.tagline")}</p>
          </div>
          <FooterColumn
            title={t("footer.product.title")}
            links={[
              { label: t("footer.product.features"), href: "#features" },
              { label: t("footer.product.howItWorks"), href: "#how-it-works" },
              { label: t("footer.product.pricing"), href: "#pricing" },
              { label: t("footer.product.faq"), href: "#faq" },
            ]}
          />
          <FooterColumn
            title={t("footer.venues.title")}
            links={[{ label: t("footer.venues.overview"), href: "#venues" }]}
          />
          <FooterColumn
            title={t("footer.company.title")}
            links={[{ label: t("footer.company.about"), href: "#about" }]}
          />
        </div>
        <div className={styles.footerBottom}>
          <p>{t("footer.copyright")}</p>
          <a href="#top">SHUTTIO ↗</a>
        </div>
      </footer>
    </div>
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
      <h3>{title}</h3>
      <ul>
        {links.map((link) => (
          <li key={link.label}>
            <a href={link.href}>{link.label}</a>
          </li>
        ))}
      </ul>
    </div>
  )
}
