"use client"

import { useLocale, useTranslations } from "next-intl"
import { useClerk } from "@clerk/nextjs"
import { Menu } from "lucide-react"

import { cn } from "@/lib/utils"
import { Logo } from "@/components/logo"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useAuthUser } from "@/features/dashboard/auth-user"
import { useData } from "@/features/dashboard/data-provider"
import { LocaleSwitcher } from "@/components/locale-switcher"
import { ThemeToggle } from "@/components/theme-toggle"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ActiveRoomPill } from "@/features/play/active-room"
import { NotificationsButton } from "@/features/dashboard/notifications"
import { SectionActions } from "@/features/dashboard/section-actions"
import { navContext } from "@/features/dashboard/workspace"
import { Link, usePathname } from "@/i18n/navigation"

/** Primary links in the blue `/app` + `/app/chat` header (active state follows the route). */
const PLAYER_HEADER_NAV = [
  { key: "dashboard", href: "/app" },
  { key: "play", href: "/app/play" },
  { key: "chat", href: "/app/chat" },
  { key: "bookings", href: "/app/bookings" },
] as const

/** Sticky dashboard header — its title and actions track the active workspace. */
export function DashboardTopbar() {
  const pathname = usePathname()
  const { ns, active, workspace } = navContext(pathname)
  const tNav = useTranslations(ns)
  const tPlayerNav = useTranslations("Nav")
  const locale = useLocale()
  const { openUserProfile, signOut } = useClerk()
  const user = useAuthUser()
  const { venues } = useData()

  if (pathname === "/app" || pathname === "/app/chat") {
    const activeKey = pathname === "/app/chat" ? "chat" : "dashboard"
    return (
      <header className="z-20 grid h-[88px] shrink-0 grid-cols-[1fr_auto_1fr] items-center bg-[#2046ed] px-5 text-white md:px-10 xl:px-[7.5%]">
        <Link href="/app" className="shrink-0 justify-self-start" aria-label="Shuttio home">
          <Logo className="text-white" markClassName="size-12 !text-[#a5ff12]" />
        </Link>
        <nav className="hidden items-center gap-9 text-sm md:flex">
          {PLAYER_HEADER_NAV.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={item.key === activeKey ? "page" : undefined}
              className={cn(
                "transition-colors",
                item.key === activeKey
                  ? "font-bold text-[#a5ff12]"
                  : "hover:text-[#a5ff12]"
              )}
            >
              {tPlayerNav(`${item.key}.label`)}
            </Link>
          ))}
        </nav>
        <div className="flex items-center justify-self-end gap-2">
          <NotificationsButton />
          <ThemeToggle />
          <LocaleSwitcher />
          <DropdownMenu>
            <DropdownMenuTrigger className="grid size-11 place-items-center rounded-full bg-[#a5ff12] text-[#123bd7]" aria-label="Mở menu">
              <Menu className="size-6" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              {PLAYER_HEADER_NAV.map((item) => (
                <DropdownMenuItem key={item.key} render={<Link href={item.href} />}>
                  {tPlayerNav(`${item.key}.label`)}
                </DropdownMenuItem>
              ))}
              {venues.map((venue) => <DropdownMenuItem key={venue.id} render={<Link href={`/app/venue/${venue.id}`} />}>{venue.name}</DropdownMenuItem>)}
              {user.role === "admin" && <DropdownMenuItem render={<Link href="/app/admin" />}>{tPlayerNav("admin")}</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => openUserProfile()}>{tPlayerNav("account")}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void signOut({ redirectUrl: `/${locale}` })}>{tPlayerNav("logout")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    )
  }

  return (
    <header className="flex h-20 shrink-0 items-center gap-2 px-3 pt-4 sm:px-4">
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
