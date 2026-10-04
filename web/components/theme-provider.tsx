"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import {
  ThemeProvider as NextThemesProvider,
  useTheme,
} from "@teispace/next-themes"

function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  const pathname = usePathname()
  // The player surfaces (home, play, chat, bookings, book, payment return) are
  // blue-and-white designs, so lock them to light. Venue-operator and admin
  // pages follow the user's dark/light choice like the rest of the site.
  const isPlayerSurface =
    /^(?:\/(?:vi|en))?\/app(?:\/(?:play|chat|bookings|book))?\/?$/.test(
      pathname
    ) || /^(?:\/(?:vi|en))?\/app\/payment\//.test(pathname)

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
      forcedTheme={isPlayerSurface ? "light" : undefined}
    >
      {!isPlayerSurface && <ThemeHotkey />}
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
