"use client"

import { Bell, Plus } from "lucide-react"
import { useTranslations } from "next-intl"

import { LocaleSwitcher } from "@/components/locale-switcher"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ActiveRoomPill } from "@/components/dashboard/active-room"
import { activeNavItem } from "@/components/dashboard/nav"
import { usePathname } from "@/i18n/navigation"

/** Sticky dashboard header — its title tracks the active route. */
export function DashboardTopbar() {
  const pathname = usePathname()
  const item = activeNavItem(pathname)
  const tNav = useTranslations("Nav")
  const t = useTranslations("Topbar")

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
      <SidebarTrigger className="-ml-1" />
      <div className="mr-1 h-5 w-px bg-border" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-heading text-base leading-none font-semibold">
          {tNav(`${item.key}.label`)}
        </h1>
        <p className="truncate text-xs text-muted-foreground">
          {tNav(`${item.key}.caption`)}
        </p>
      </div>
      <ActiveRoomPill />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("notifications")}
        className="relative"
      >
        <Bell />
        <span className="absolute top-1 right-1 size-1.5 rounded-full bg-brand" />
      </Button>
      <LocaleSwitcher />
      <ThemeToggle />
      <Button size="sm" className="rounded-full">
        <Plus />
        <span className="hidden sm:inline">{t("newMatch")}</span>
      </Button>
    </header>
  )
}
