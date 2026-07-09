import { hasLocale } from "next-intl"
import { getRequestConfig } from "next-intl/server"

import { routing, type Locale } from "./routing"
import viMessages from "../messages/vi.json"
import enMessages from "../messages/en.json"

// Statically imported (rather than a dynamic `import(`../messages/${locale}.json`)`)
// so `resolveJsonModule` gives each file a real inferred type instead of `any` —
// a template-literal dynamic import can't be resolved to a specific module shape.
const MESSAGES_BY_LOCALE: Record<Locale, typeof viMessages> = {
  vi: viMessages,
  en: enMessages,
}

export default getRequestConfig(async ({ requestLocale }) => {
  // `requestLocale` corresponds to the [locale] segment; fall back to the
  // default locale when it is missing or unsupported.
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale

  return {
    locale,
    messages: MESSAGES_BY_LOCALE[locale],
  }
})
