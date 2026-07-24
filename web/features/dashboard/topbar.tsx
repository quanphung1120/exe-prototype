"use client"

import { useTranslations } from "next-intl"

import { LocaleSwitcher } from "@/components/locale-switcher"
import { ThemeToggle } from "@/components/theme-toggle"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ActiveRoomPill } from "@/features/play/active-room"
import { NotificationsButton } from "@/features/dashboard/notifications"
import { SectionActions } from "@/features/dashboard/section-actions"
import { navContext } from "@/features/dashboard/workspace"
import { usePathname } from "@/i18n/navigation"

/** Sticky dashboard header — its title and actions track the active workspace. */
export function DashboardTopbar() {
  const pathname = usePathname()
  const { ns, active, workspace } = navContext(pathname)
  const tNav = useTranslations(ns)

  return (
    <header className="flex h-20 pt-4 shrink-0 items-center gap-2 px-3 sm:px-4">
      <SidebarTrigger className="-ml-1" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-heading text-xl leading-tight font-semibold">
          {tNav(`${active.key}.label`)}
        </h1>
        <p className="truncate text-sm font-medium text-muted-foreground">
          {tNav(`${active.key}.caption`)}
        </p>
      </div>
      {workspace === "player" ? <ActiveRoomPill /> : null}
      <NotificationsButton />
      <LocaleSwitcher />
      <ThemeToggle />
      <SectionActions workspace={workspace} sectionKey={active.key} />
    </header>
  )
}
