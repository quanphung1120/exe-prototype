"use client"

import { usePathname } from "next/navigation"
import { Bell, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import { activeNavItem } from "@/components/dashboard/nav"

/** Sticky dashboard header — its title tracks the active route. */
export function DashboardTopbar() {
  const pathname = usePathname()
  const item = activeNavItem(pathname)

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
      <SidebarTrigger className="-ml-1" />
      <div className="mr-1 h-5 w-px bg-border" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-heading text-base leading-none font-semibold">
          {item.label}
        </h1>
        <p className="truncate text-xs text-muted-foreground">{item.caption}</p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Notifications"
        className="relative"
      >
        <Bell />
        <span className="absolute top-1 right-1 size-1.5 rounded-full bg-brand" />
      </Button>
      <ThemeToggle />
      <Button size="sm" className="rounded-full">
        <Plus />
        <span className="hidden sm:inline">New match</span>
      </Button>
    </header>
  )
}
