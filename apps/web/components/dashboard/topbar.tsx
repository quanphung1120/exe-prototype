"use client"

import { useTranslations } from "next-intl"

import { LocaleSwitcher } from "@/components/locale-switcher"
import { ThemeToggle } from "@/components/theme-toggle"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ActiveRoomPill } from "@/components/dashboard/active-room"
import { NotificationsButton } from "@/components/dashboard/notifications"
import { SectionActions } from "@/components/dashboard/section-actions"
import { navContext } from "@/components/dashboard/workspace"
import { usePathname } from "@/i18n/navigation"

/** Sticky dashboard header — its title and actions track the active workspace. */
export function DashboardTopbar() {
  const pathname = usePathname()
  const { ns, active, workspace } = navContext(pathname)
  const isVenue = workspace === "venue"
  const tNav = useTranslations(ns)

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
      <SidebarTrigger className="-ml-1" />
      <div className="mr-1 h-5 w-px bg-border" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-heading text-xl leading-tight font-semibold sm:text-2xl">
          {tNav(`${active.key}.label`)}
        </h1>
        <p className="truncate text-sm font-medium text-muted-foreground sm:text-base">
          {tNav(`${active.key}.caption`)}
        </p>
      </div>
      {isVenue ? null : <ActiveRoomPill />}
      <NotificationsButton />
      <LocaleSwitcher />
      <ThemeToggle />
      <SectionActions workspace={workspace} sectionKey={active.key} />
    </header>
  )
}
