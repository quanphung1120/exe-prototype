"use client"

import * as React from "react"
import {
  Check,
  ChevronsUpDown,
  LogOut,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  UserCog,
  UserRound,
} from "lucide-react"
import { useClerk } from "@clerk/nextjs"
import { useLocale, useTranslations } from "next-intl"
import { initialsOf } from "@/lib/shared"

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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { useAuthUser } from "@/features/dashboard/auth-user"
import { useData } from "@/features/dashboard/data-provider"
import { useMatchmaking } from "@/features/play/matchmaking"
import { useStreamUnreadCount } from "@/features/chat/stream-provider"
import { ProfileDialog } from "@/features/dashboard/profile-dialog"
import { venueBase } from "@/features/venue/nav"
import { navContext } from "@/features/dashboard/workspace"
import { Link, usePathname, useRouter } from "@/i18n/navigation"

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const locale = useLocale()
  const { signOut, openUserProfile } = useClerk()
  const { isMobile, setOpenMobile } = useSidebar()
  const { userName } = useMatchmaking()
  const { user: USER, brand: BRAND, venues: VENUES, accountType } = useData()
  const venueOnly = accountType === "venue"
  // Live unread total from Stream (0 when chat is degraded); drives the chat badge.
  const unreadCount = useStreamUnreadCount()

  // The signed-in user, fetched server-side (no session-load flash). This
  // sidebar only renders inside the guarded dashboard, so a user is guaranteed.
  const sUser = useAuthUser()

  const [profileOpen, setProfileOpen] = React.useState(false)

  const { workspace, ns, items, active, venueId } = navContext(pathname)
  const isVenue = workspace === "venue"
  const isAdmin = workspace === "admin"

  // The active venue is derived from the URL's [venueId] (per-venue workspace).
  // In the player workspace there's no active venue, so fall back to the
  // account's venue (if any) as the representative for the switcher tile/icon.
  // A brand-new account owns no venue until it runs the setup wizard, so this
  // can be undefined — every read below guards for that.
  const activeVenueId = venueId
  const VENUE = (venueId && VENUES.find((v) => v.id === venueId)) || VENUES[0]

  const displayName = isVenue && VENUE ? VENUE.manager.name : userName

  const tNav = useTranslations(ns)
  const t = useTranslations("Sidebar")

  // The footer account menu reflects the *real* signed-in user — name, email
  // and avatar pulled from the Clerk session — independent of the mock
  // player/venue identity used everywhere else. Fall back to the mock identity
  // while the session is loading or absent.
  const accountName = sUser.name || displayName
  const accountSubtitle =
    sUser.email || (isVenue && VENUE ? t("operatorRole") : USER.handle)
  const accountImage = sUser.image || undefined
  const accountInitials = sUser.name
    ? initialsOf(sUser.name)
    : isVenue && VENUE
      ? VENUE.manager.initials
      : USER.initials

  const handleNavigate = () => {
    if (isMobile) setOpenMobile(false)
  }

  const handleSignOut = () => void signOut({ redirectUrl: "/" + locale })

  const switchToPlayer = () => {
    router.push("/dashboard")
    handleNavigate()
  }

  // Switch to the admin workspace — only reachable when the sidebar renders
  // the entry below, which is itself gated on the Clerk role.
  const switchToAdmin = () => {
    router.push("/dashboard/admin")
    handleNavigate()
  }

  // Open a specific branch (chi nhánh) of the operator's brand.
  const goToBranch = (id: string) => {
    router.push(venueBase(id))
    handleNavigate()
  }

  // No venue provisioned yet — the switcher's only way into the setup wizard.
  const switchToAddVenue = () => {
    router.push("/setup")
    handleNavigate()
  }

  // Add another branch (chi nhánh) to an existing brand — the wizard again, but
  // `?branch=1` tells the setup gate to allow it past the one-shot first-run.
  const addBranch = () => {
    router.push("/setup?branch=1")
    handleNavigate()
  }

  // Venue-only accounts opt into the player role via the skills assessment.
  const becomePlayer = () => {
    router.push("/assessment")
    handleNavigate()
  }

  return (
    <Sidebar collapsible="icon">
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
                        (isVenue || isAdmin) &&
                          "bg-secondary text-xs font-bold text-secondary-foreground"
                      )}
                    >
                      {isAdmin ? (
                        <ShieldCheck className="size-5" />
                      ) : isVenue && VENUE ? (
                        VENUE.initials
                      ) : (
                        <LogoMark className="size-9! text-primary" />
                      )}
                    </div>
                    <div className="grid flex-1 text-left leading-tight">
                      <span className="truncate font-heading text-sm font-bold tracking-tight">
                        {isAdmin
                          ? t("adminWorkspace")
                          : isVenue && VENUE
                            ? VENUE.name
                            : "SportMatch AI"}
                      </span>
                      {isVenue && VENUE ? (
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
                  {venueOnly ? (
                    <DropdownMenuItem onClick={becomePlayer}>
                      <div className="flex size-6 items-center justify-center rounded-lg border border-dashed border-sidebar-border text-secondary-foreground">
                        <Plus className="size-4" />
                      </div>
                      <span className="flex-1">{t("becomePlayer")}</span>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={switchToPlayer}>
                      <LogoMark className="size-6 text-primary" />
                      <span className="flex-1">{t("playerWorkspace")}</span>
                      {workspace === "player" ? (
                        <Check className="size-4 text-brand" />
                      ) : null}
                    </DropdownMenuItem>
                  )}
                  {sUser.role === "admin" ? (
                    <DropdownMenuItem onClick={switchToAdmin}>
                      <ShieldCheck className="size-6 text-primary" />
                      <span className="flex-1">{t("adminWorkspace")}</span>
                      {isAdmin ? <Check className="size-4 text-brand" /> : null}
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  {/* The brand (thương hiệu) and its branches (chi nhánh). */}
                  <DropdownMenuLabel className="truncate">
                    {BRAND ? BRAND.name : t("venueTag")}
                  </DropdownMenuLabel>
                  {VENUES.length > 0 ? (
                    <>
                      {VENUES.map((v) => (
                        <DropdownMenuItem
                          key={v.id}
                          onClick={() => goToBranch(v.id)}
                        >
                          <div className="flex size-7 items-center justify-center rounded-lg bg-secondary text-xs font-semibold text-secondary-foreground">
                            {v.initials}
                          </div>
                          <span className="flex-1 truncate">{v.name}</span>
                          {isVenue && v.id === activeVenueId ? (
                            <Check className="size-4 text-brand" />
                          ) : null}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuItem onClick={addBranch}>
                        <div className="flex size-7 items-center justify-center rounded-lg border border-dashed border-sidebar-border text-secondary-foreground">
                          <Plus className="size-4" />
                        </div>
                        <span className="flex-1 truncate">
                          {t("addBranch")}
                        </span>
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <DropdownMenuItem onClick={switchToAddVenue}>
                      <div className="flex size-7 items-center justify-center rounded-lg border border-dashed border-sidebar-border text-secondary-foreground">
                        <Plus className="size-4" />
                      </div>
                      <span className="flex-1 truncate">{t("addVenue")}</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
                {isVenue && VENUE ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        onClick={() => {
                          router.push(`${venueBase(VENUE.id)}/manage`)
                          handleNavigate()
                        }}
                      >
                        <Settings className="size-4" />
                        <span className="flex-1">{t("manageVenue")}</span>
                      </DropdownMenuItem>
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
          <SidebarMenu className="gap-1.5">
            {items
              .filter((item) => !item.hidden)
              .map((item) => {
                // The chat badge is a live Stream unread count (hidden at 0),
                // not a static value — other items keep their configured badge.
                const badge =
                  item.key === "chat"
                    ? unreadCount > 0
                      ? String(unreadCount)
                      : undefined
                    : item.badge
                const isActive = item.key === active.key
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={tNav(`${item.key}.label`)}
                      className={cn(
                        isActive &&
                          "data-active:bg-brand/10 data-active:text-brand"
                      )}
                      render={
                        <Link href={item.href} onClick={handleNavigate} />
                      }
                    >
                      <item.icon />
                      <span>{tNav(`${item.key}.label`)}</span>
                    </SidebarMenuButton>
                    {/* A custom badge instead of SidebarMenuBadge — that
                        component force-hides in icon-collapsed mode, but this
                        rail stays icon-only, so the unread count needs to stay
                        visible, pinned to the icon's corner. */}
                    {badge ? (
                      <span
                        title={
                          badge === "AI"
                            ? `${tNav(`${item.key}.label`)} AI`
                            : `${tNav(`${item.key}.label`)} unread count ${badge}`
                        }
                        aria-label={
                          badge === "AI"
                            ? `${tNav(`${item.key}.label`)} AI badge`
                            : `${tNav(`${item.key}.label`)} with ${badge} unread items`
                        }
                        className={cn(
                          "pointer-events-none absolute -top-1 -right-1 z-10 flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 font-mono text-[10px] font-semibold ring-2 ring-sidebar",
                          badge === "AI"
                            ? "bg-brand/12 text-brand"
                            : "bg-brand text-brand-foreground"
                        )}
                      >
                        {badge}
                      </span>
                    ) : null}
                  </SidebarMenuItem>
                )
              })}
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
