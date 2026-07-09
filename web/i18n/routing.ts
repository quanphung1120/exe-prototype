import { defineRouting } from "next-intl/routing"

export const routing = defineRouting({
  // Vietnamese is the default/fallback locale; English is the secondary locale.
  locales: ["vi", "en"],
  defaultLocale: "vi",
})

export type Locale = (typeof routing.locales)[number]
