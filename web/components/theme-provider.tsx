"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import {
  ThemeProvider as NextThemesProvider,
  useTheme,
} from "@teispace/next-themes"

/**
 * Only the landing page (`/`, `/vi`, `/en`) has a light/dark switch; every
 * other surface (auth, onboarding, the whole /app dashboard) is locked to
 * light. The provider stays mounted everywhere so `useTheme()` consumers
 * (toasts, map tiles) keep resolving a theme.
 */
function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  const pathname = usePathname()
  const isLanding = /^(?:\/(?:vi|en))?\/?$/.test(pathname)

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
      forcedTheme={isLanding ? undefined : "light"}
    >
      {isLanding && <ThemeHotkey />}
      {children}
    </NextThemesProvider>
  )
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

/** Pressing `l` (not while typing) toggles the landing page theme. */
function ThemeHotkey() {
  const { resolvedTheme, setTheme } = useTheme()

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) {
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      // Browser autofill (e.g. picking a suggested email) can dispatch a
      // synthetic keydown with no `key`, so guard before lower-casing.
      if (event.key?.toLowerCase() !== "l") {
        return
      }

      if (isTypingTarget(event.target)) {
        return
      }

      setTheme(resolvedTheme === "dark" ? "light" : "dark")
    }

    window.addEventListener("keydown", onKeyDown)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [resolvedTheme, setTheme])

  return null
}

export { ThemeProvider }
