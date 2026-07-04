"use client"

import * as React from "react"
import {
  Check,
  ChevronsUpDown,
  LogOut,
  Search,
  UserCog,
  UserRound,
} from "lucide-react"
import { useClerk } from "@clerk/nextjs"
import { useLocale, useTranslations } from "next-intl"
import { initialsOf } from "@repo/shared"

import { LogoMark } from "@/components/logo"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
import { useAuthUser } from "@/components/dashboard/auth-user"
import { useData } from "@/components/dashboard/data-provider"
import { useMatchmaking } from "@/components/dashboard/matchmaking"
import { ProfileDialog } from "@/components/dashboard/profile-dialog"
import { venueBase } from "@/components/dashboard/venue/nav"
import { navContext } from "@/components/dashboard/workspace"
import { Link, usePathname, useRouter } from "@/i18n/navigation"

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const locale = useLocale()
  const { signOut, openUserProfile } = useClerk()
  const { isMobile, setOpenMobile } = useSidebar()
  const { userName } = useMatchmaking()
  const { user: USER, venues: VENUES } = useData()

  // The signed-in user, fetched server-side (no session-load flash). This
  // sidebar only renders inside the guarded dashboard, so a user is guaranteed.
  const sUser = useAuthUser()

  const [profileOpen, setProfileOpen] = React.useState(false)

  const { workspace, ns, items, active, venueId } = navContext(pathname)
  const isVenue = workspace === "venue"

  // The active venue is derived from the URL's [venueId] (per-venue workspace).
  // In the player workspace there's no active venue, so fall back to the first
  // venue as the representative for the "switch to venue" tile/icon.
  const activeVenueId = venueId
  const VENUE = (venueId && VENUES.find((v) => v.id === venueId)) || VENUES[0]

  // The name shown for the current operator/player identity.
  const displayName = isVenue ? VENUE.manager.name : userName

  // One translator, namespace chosen by the active workspace.
  const tNav = useTranslations(ns)
  const t = useTranslations("Sidebar")

  // The footer account menu reflects the *real* signed-in user — name, email
  // and avatar pulled from the Clerk session — independent of the mock
  // player/venue identity used everywhere else. Fall back to the mock identity
  // while the session is loading or absent.
  const accountName = sUser.name || displayName
  const accountSubtitle =
    sUser.email || (isVenue ? t("operatorRole") : USER.handle)
  const accountImage = sUser.image || undefined
  const accountInitials = sUser.name
    ? initialsOf(sUser.name)
    : isVenue
      ? VENUE.manager.initials
      : USER.initials

  // Collapse the mobile drawer once a destination is chosen.
  const handleNavigate = () => {
    if (isMobile) setOpenMobile(false)
  }

  // End the Clerk session and return to the locale landing page.
  const handleSignOut = () => signOut({ redirectUrl: "/" + locale })

  // Switch to the player workspace.
  const switchToPlayer = () => {
    router.push("/dashboard")
    handleNavigate()
  }

  // Switch to the venue workspace — land on the active venue, or the first one.
  const switchToVenue = () => {
    const targetId = activeVenueId ?? VENUES[0]?.id
    if (targetId) router.push(venueBase(targetId))
    handleNavigate()
  }

  // Navigate to another venue, preserving the current section when possible.
  const chooseVenue = (id: string) => {
    if (id !== activeVenueId) {
      const section =
        activeVenueId && pathname.startsWith(venueBase(activeVenueId))
          ? pathname.slice(venueBase(activeVenueId).length)
          : ""
      router.push(`${venueBase(id)}${section}`)
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
                        "flex aspect-square size-10 items-center justify-center rounded-xl",
                        isVenue &&
                          "bg-secondary text-xs font-bold text-secondary-foreground"
                      )}
                    >
                      {isVenue ? (
                        VENUE.initials
                      ) : (
                        <LogoMark className="size-9! text-primary" />
                      )}
                    </div>
                    <div className="grid flex-1 text-left leading-tight">
                      <span className="truncate font-heading text-sm font-bold tracking-tight">
                        {isVenue ? VENUE.name : "SportMatch AI"}
                      </span>
                      {isVenue ? (
                        <span className="truncate text-xs text-sidebar-foreground/60">
                          {`${t("venueTag")} · ${VENUE.district}`}
                        </span>
                      ) : null}
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
                  <DropdownMenuItem onClick={switchToPlayer}>
                    <LogoMark className="size-6 text-primary" />
                    <span className="flex-1">{t("playerWorkspace")}</span>
                    {!isVenue ? <Check className="size-4 text-brand" /> : null}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={switchToVenue}>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-secondary text-xs font-semibold text-secondary-foreground">
                      {VENUE.initials}
                    </div>
                    <span className="flex-1 truncate">
                      {`${VENUE.name} · ${t("venueTag")}`}
                    </span>
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
                      title={
                        item.badge === "AI"
                          ? `${tNav(`${item.key}.label`)} AI`
                          : `${tNav(`${item.key}.label`)} unread count ${item.badge}`
                      }
                      aria-label={
                        item.badge === "AI"
                          ? `${tNav(`${item.key}.label`)} AI badge`
                          : `${tNav(`${item.key}.label`)} with ${item.badge} unread items`
                      }
                      className={cn(
                        "h-5 min-w-5 rounded-full px-1.5 text-[11px] font-semibold shadow-sm ring-1 ring-brand/20",
                        item.badge === "AI"
                          ? "bg-brand/12 text-brand"
                          : "bg-brand text-brand-foreground"
                      )}
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
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <SidebarMenu className="min-w-0 flex-1">
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <SidebarMenuButton
                        size="lg"
                        className="data-popup-open:bg-sidebar-accent"
                      >
                        <Avatar size="sm" className="size-8">
                          {accountImage ? (
                            <AvatarImage src={accountImage} alt={accountName} />
                          ) : null}
                          <AvatarFallback className="bg-secondary text-xs font-medium text-secondary-foreground">
                            {accountInitials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="grid flex-1 text-left leading-tight">
                          <span className="truncate text-sm font-medium">
                            {accountName}
                          </span>
                          <span className="truncate text-xs text-sidebar-foreground/60">
                            {accountSubtitle}
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
                          {accountImage ? (
                            <AvatarImage src={accountImage} alt={accountName} />
                          ) : null}
                          <AvatarFallback className="bg-secondary text-xs font-medium text-secondary-foreground">
                            {accountInitials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="grid leading-tight">
                          <span className="text-sm font-medium">
                            {accountName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {accountSubtitle}
                          </span>
                        </div>
                      </DropdownMenuLabel>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setProfileOpen(true)}>
                      <UserRound />
                      {t("profile")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openUserProfile()}>
                      <UserCog />
                      {t("accountSettings")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={handleSignOut}
                    >
                      <LogOut />
                      {t("logout")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          </div>
        </div>
      </SidebarFooter>

      <SidebarRail />

      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </Sidebar>
  )
}
