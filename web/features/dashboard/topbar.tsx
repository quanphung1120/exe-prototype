"use client"

import { useLocale, useTranslations } from "next-intl"
import { useClerk } from "@clerk/nextjs"
import { Menu } from "lucide-react"

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

/** Sticky dashboard header — its title and actions track the active workspace. */
export function DashboardTopbar() {
  const pathname = usePathname()
  const { ns, active, workspace } = navContext(pathname)
  const tNav = useTranslations(ns)
  const locale = useLocale()
  const { openUserProfile, signOut } = useClerk()
  const user = useAuthUser()
  const { venues } = useData()

  if (pathname === "/app") {
    return (
      <header className="z-20 grid h-[88px] shrink-0 grid-cols-[1fr_auto_1fr] items-center bg-[#2046ed] px-5 text-white md:px-10 xl:px-[7.5%]">
        <Link href="/app" className="shrink-0 justify-self-start" aria-label="Shuttio home">
          <Logo className="text-white" markClassName="size-12 !text-[#a5ff12]" />
        </Link>
        <nav className="hidden items-center gap-9 text-sm md:flex">
          <Link href="/app" className="font-bold">Trợ lý AI</Link>
          <Link href="/app/play" className="hover:text-[#a5ff12]">Chơi</Link>
          <Link href="/app/chat" className="hover:text-[#a5ff12]">Trò chuyện</Link>
          <Link href="/app/bookings" className="hover:text-[#a5ff12]">Lịch đặt</Link>
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
              <DropdownMenuItem render={<Link href="/app" />}>Trợ lý AI</DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/app/play" />}>Chơi</DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/app/chat" />}>Trò chuyện</DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/app/bookings" />}>Lịch đặt</DropdownMenuItem>
              {venues.map((venue) => <DropdownMenuItem key={venue.id} render={<Link href={`/app/venue/${venue.id}`} />}>{venue.name}</DropdownMenuItem>)}
              {user.role === "admin" && <DropdownMenuItem render={<Link href="/app/admin" />}>Quản trị</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => openUserProfile()}>Tài khoản</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void signOut({ redirectUrl: `/${locale}` })}>Đăng xuất</DropdownMenuItem>
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
