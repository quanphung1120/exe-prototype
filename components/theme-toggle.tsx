"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"

export function ThemeToggle({ className }: { className?: string }) {
  const { setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      aria-label="Chuyển giao diện sáng và tối"
      title="Đổi giao diện (L)"
      onClick={() => {
        // Read the live DOM state so we always toggle correctly,
        // regardless of next-themes' internal mount timing.
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
