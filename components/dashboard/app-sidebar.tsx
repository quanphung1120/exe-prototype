"use client"

import {
  ChevronsUpDown,
  Flame,
  LogOut,
  Search,
  Settings,
  UserRound,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { LogoMark } from "@/components/logo"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { USER } from "@/components/dashboard/data"
import { NAV, isNavActive } from "@/components/dashboard/nav"
import { Link, usePathname } from "@/i18n/navigation"

export function AppSidebar() {
  const pathname = usePathname()
  const { isMobile, setOpenMobile } = useSidebar()
  const tNav = useTranslations("Nav")
  const t = useTranslations("Sidebar")

  // Collapse the mobile drawer once a destination is chosen.
  const handleNavigate = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader className="gap-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    className="data-popup-open:bg-sidebar-accent"
                  >
                    <div className="flex aspect-square size-8 items-center justify-center rounded-xl bg-primary">
                      <LogoMark className="size-5 text-primary-foreground" />
                    </div>
                    <div className="grid flex-1 text-left leading-tight">
                      <span className="truncate font-heading text-sm font-bold tracking-tight">
                        SportMatch AI
                      </span>
                      <span className="truncate text-xs text-sidebar-foreground/60">
                        {USER.city} · {USER.tier}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground/60" />
                  </SidebarMenuButton>
                }
              />
              <DropdownMenuContent
                align="start"
                side="bottom"
                sideOffset={6}
                className="w-(--anchor-width) min-w-56"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{t("workspaces")}</DropdownMenuLabel>
                  <DropdownMenuItem>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-primary">
                      <LogoMark className="size-4 text-primary-foreground" />
                    </div>
                    {t("playerWorkspace")}
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-secondary text-xs font-semibold text-secondary-foreground">
                      PR
                    </div>
                    {t("venueWorkspace")}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>

        <div className="relative group-data-[collapsible=icon]:hidden">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <SidebarInput
            placeholder={t("searchPlaceholder")}
            className="pl-8"
            aria-label={t("searchPlaceholder")}
          />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{tNav("groupPlay")}</SidebarGroupLabel>
          <SidebarMenu>
            {NAV.map((item) => (
              <SidebarMenuItem key={item.key}>
                <SidebarMenuButton
                  isActive={isNavActive(item.href, pathname)}
                  tooltip={tNav(`${item.key}.label`)}
                  render={<Link href={item.href} onClick={handleNavigate} />}
                >
                  <item.icon />
                  <span>{tNav(`${item.key}.label`)}</span>
                </SidebarMenuButton>
                {item.badge ? (
                  <SidebarMenuBadge
                    className={
                      item.key === "streak" || item.badge === "AI"
                        ? "text-brand"
                        : undefined
                    }
                  >
                    {item.key === "streak" ? (
                      <span className="inline-flex items-center gap-0.5">
                        <Flame className="size-3" />
                        {item.badge}
                      </span>
                    ) : (
                      item.badge
                    )}
                  </SidebarMenuBadge>
                ) : null}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    className="data-popup-open:bg-sidebar-accent"
                  >
                    <Avatar size="sm" className="size-8">
                      <AvatarFallback className="bg-secondary text-xs font-medium text-secondary-foreground">
                        {USER.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left leading-tight">
                      <span className="truncate text-sm font-medium">
                        {USER.name}
                      </span>
                      <span className="truncate text-xs text-sidebar-foreground/60">
                        {USER.handle}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground/60" />
                  </SidebarMenuButton>
                }
              />
              <DropdownMenuContent
                align="end"
                side="top"
                sideOffset={6}
                className="w-(--anchor-width) min-w-56"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="flex items-center gap-2 py-2 text-foreground">
                    <Avatar size="sm" className="size-8">
                      <AvatarFallback className="bg-secondary text-xs font-medium text-secondary-foreground">
                        {USER.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid leading-tight">
                      <span className="text-sm font-medium">{USER.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {t("rating", { value: USER.rating.toFixed(2) })}
                      </span>
                    </div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <UserRound />
                  {t("profile")}
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings />
                  {t("settings")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">
                  <LogOut />
                  {t("logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
