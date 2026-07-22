import { routing, type Locale } from "@/i18n/routing"

// SePay's hosted checkout is a full-page navigation away from the app, and its
// return `successUrl` is a single static URL — it can only ever bring the
// player back to one locale (`vi`, the default). To restore the locale the
// player was actually using, we stash it in `localStorage` right before the
// redirect and read it back on the return screen. `localStorage` (not a
// cookie) because the whole decision is client-side and survives the SePay
// round-trip without touching the server.
const STORAGE_KEY = "sm-preferred-locale"

/** Persist the active locale before leaving for an external redirect (SePay). */
export function savePreferredLocale(locale: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // Private mode / storage disabled — the return screen just falls back to
    // whatever locale the URL carries. Not worth failing the checkout over.
  }
}

/**
 * The locale the player was on before the SePay redirect, or `null` if none
 * was stored or it isn't a locale we support (guards against tampering/stale
 * values). Returns `null` on the server, where `localStorage` doesn't exist.
 */
export function readPreferredLocale(): Locale | null {
  if (typeof window === "undefined") return null
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return routing.locales.includes(stored as Locale)
      ? (stored as Locale)
      : null
  } catch {
    return null
  }
}
