"use client"

import { Moon, Sun } from "lucide-react"
import { useTranslations } from "next-intl"
import { useTheme } from "@teispace/next-themes"

import { Button } from "@/components/ui/button"

export function ThemeToggle({ className }: { className?: string }) {
  const { setTheme } = useTheme()
  const t = useTranslations("ThemeToggle")

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      aria-label={t("toggleAria")}
      title={t("toggleTitle")}
      onClick={() => {
        // Read the live DOM state so we always toggle correctly,
        // regardless of the theme provider's internal mount timing.
        const isDark = document.documentElement.classList.contains("dark")
        setTheme(isDark ? "light" : "dark")
      }}
    >
      {/* Sun shows in dark mode (tap to go light); Moon shows in light mode.
          Visibility is driven purely by the `.dark` class to avoid any
          hydration mismatch. */}
      <Sun className="hidden size-4.5 dark:block" />
      <Moon className="size-4.5 dark:hidden" />
    </Button>
  )
}
