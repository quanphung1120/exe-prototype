"use client"

import * as React from "react"
import {
  Check,
  ChevronsUpDown,
  LogOut,
  Search,
  Settings,
  Settings2,
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
import { cn } from "@/lib/utils"
import { useData } from "@/components/dashboard/data-provider"
import { useMatchmaking } from "@/components/dashboard/matchmaking"
import { WorkspaceSettingsDialog } from "@/components/dashboard/workspace-settings"
import { WORKSPACES, navContext } from "@/components/dashboard/workspace"
import { setActiveVenue } from "@/lib/venue-actions"
import { Link, usePathname, useRouter } from "@/i18n/navigation"

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { isMobile, setOpenMobile } = useSidebar()
  const { userName } = useMatchmaking()
  const { user: USER, venue: VENUE, venues: VENUES, activeVenueId } = useData()

  const [settingsOpen, setSettingsOpen] = React.useState(false)

  const { workspace, ns, items, active } = navContext(pathname)
  const isVenue = workspace === "venue"

  // The name shown for the current operator/player identity.
  const displayName = isVenue ? VENUE.manager.name : userName

  // One translator, namespace chosen by the active workspace.
  const tNav = useTranslations(ns)
  const t = useTranslations("Sidebar")

  // Collapse the mobile drawer once a destination is chosen.
  const handleNavigate = () => {
    if (isMobile) setOpenMobile(false)
  }

  const switchTo = (key: keyof typeof WORKSPACES) => {
    router.push(WORKSPACES[key].home)
    handleNavigate()
  }

  const chooseVenue = async (id: string) => {
    if (id !== activeVenueId) {
      try {
        await setActiveVenue(id)
        router.refresh()
      } catch {
        // Keep the current venue if the switch fails.
      }
    }
    handleNavigate()
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
                    <div
                      className={cn(
                        "flex aspect-square size-8 items-center justify-center rounded-xl",
                        isVenue && "bg-secondary text-xs font-bold text-secondary-foreground"
                      )}
                    >
                      {isVenue ? (
                        VENUE.initials
                      ) : (
                        <LogoMark className="size-7 text-primary" />
                      )}
                    </div>
                    <div className="grid flex-1 text-left leading-tight">
                      <span className="truncate font-heading text-sm font-bold tracking-tight">
                        {isVenue ? VENUE.name : "SportMatch AI"}
                      </span>
                      <span className="truncate text-xs text-sidebar-foreground/60">
                        {isVenue
                          ? `${t("venueTag")} · ${VENUE.district}`
                          : USER.city}
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
                  <DropdownMenuItem onClick={() => switchTo("player")}>
                    <LogoMark className="size-6 text-primary" />
                    <span className="flex-1">{t("playerWorkspace")}</span>
                    {!isVenue ? <Check className="size-4 text-brand" /> : null}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => switchTo("venue")}>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-secondary text-xs font-semibold text-secondary-foreground">
                      {VENUE.initials}
                    </div>
                    <span className="flex-1">{t("venueWorkspace")}</span>
                    {isVenue ? <Check className="size-4 text-brand" /> : null}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                {isVenue ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>{t("venues")}</DropdownMenuLabel>
                      {VENUES.map((v) => (
                        <DropdownMenuItem
                          key={v.id}
                          onClick={() => chooseVenue(v.id)}
                        >
                          <div className="flex size-7 items-center justify-center rounded-lg bg-secondary text-xs font-semibold text-secondary-foreground">
                            {v.initials}
                          </div>
                          <span className="flex-1 truncate">{v.name}</span>
                          {v.id === activeVenueId ? (
                            <Check className="size-4 text-brand" />
                          ) : null}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>

        <div className="relative group-data-[collapsible=icon]:hidden">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <SidebarInput
            placeholder={isVenue ? t("searchVenue") : t("searchPlaceholder")}
            className="pl-8"
            aria-label={isVenue ? t("searchVenue") : t("searchPlaceholder")}
          />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{tNav("group")}</SidebarGroupLabel>
          <SidebarMenu>
            {items
              .filter((item) => !item.hidden)
              .map((item) => (
              <SidebarMenuItem key={item.key}>
                <SidebarMenuButton
                  isActive={item.key === active.key}
                  tooltip={tNav(`${item.key}.label`)}
                  render={<Link href={item.href} onClick={handleNavigate} />}
                >
                  <item.icon />
                  <span>{tNav(`${item.key}.label`)}</span>
                </SidebarMenuButton>
                {item.badge ? (
                  <SidebarMenuBadge
                    className={item.badge === "AI" ? "text-brand" : undefined}
                  >
                    {item.badge}
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
            <SidebarMenuButton
              tooltip={t("workspaceSettings")}
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 />
              <span>{t("workspaceSettings")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
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
                        {isVenue ? VENUE.manager.initials : USER.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left leading-tight">
                      <span className="truncate text-sm font-medium">
                        {displayName}
                      </span>
                      <span className="truncate text-xs text-sidebar-foreground/60">
                        {isVenue ? t("operatorRole") : USER.handle}
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
                        {isVenue ? VENUE.manager.initials : USER.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid leading-tight">
                      <span className="text-sm font-medium">{displayName}</span>
                      <span className="text-xs text-muted-foreground">
                        {isVenue ? t("operatorRole") : USER.handle}
                      </span>
                    </div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <UserRound />
                  {t("profile")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
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

      <WorkspaceSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        isVenue={isVenue}
        venue={VENUE}
        activeVenueId={activeVenueId}
        initials={USER.initials}
      />
    </Sidebar>
  )
}
