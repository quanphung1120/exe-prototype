import type { Metadata, Viewport } from "next"
import { Barlow, Barlow_Condensed, Geist, Geist_Mono } from "next/font/google"
import { notFound } from "next/navigation"
import { hasLocale, NextIntlClientProvider } from "next-intl"
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from "next-intl/server"

import "../globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { routing } from "@/i18n/routing"
import { cn } from "@/lib/utils"

const fontSans = Barlow({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
})

const fontHeading = Barlow_Condensed({
  subsets: ["latin", "vietnamese"],
  weight: ["500", "600", "700"],
  variable: "--font-heading",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

// Geist powers the dashboard typeface (scoped via the `.font-geist` class).
const fontGeist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
})

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "Meta" })

  return {
    title: {
      default: t("titleDefault"),
      template: t("titleTemplate"),
    },
    description: t("description"),
    keywords: t.raw("keywords"),
    openGraph: {
      title: t("ogTitle"),
      description: t("ogDescription"),
      siteName: "SportMatch AI",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: t("twitterTitle"),
      description: t("twitterDescription"),
    },
  }
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ locale: string }>
}>) {
  const { locale } = await params

  // Validate the incoming `[locale]` segment against the configured locales.
  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  // Enable static rendering for this locale.
  setRequestLocale(locale)

  const messages = await getMessages()

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={cn(
        "antialiased",
        fontSans.variable,
        fontHeading.variable,
        fontMono.variable,
        fontGeist.variable,
        "font-sans"
      )}
    >
      <body>
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>{children}</ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
