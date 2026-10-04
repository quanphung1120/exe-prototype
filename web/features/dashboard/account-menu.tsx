"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { useClerk } from "@clerk/nextjs"
import { LogOut, ShieldCheck, UserCog, UserRound } from "lucide-react"

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
import { initialsOf } from "@/lib/shared"
import { useAuthUser } from "@/features/dashboard/auth-user"
import { useData } from "@/features/dashboard/data-provider"
import { ProfileDialog } from "@/features/dashboard/profile-dialog"

/**
 * The player's avatar in the blue header — holds everything about the
 * signed-in account (name, email, role, profile, Clerk settings) and sign-out,
 * so the hamburger menu is left for navigation only.
 */
/** Portaled popups escape any page scope — pin them to the white player theme. */
const HEADER_POPUP_CLASS = "player-play-overlay min-w-64"

export function AccountMenu() {
  const t = useTranslations("Sidebar")
  const tNav = useTranslations("Nav")
  const locale = useLocale()
  const { openUserProfile, signOut } = useClerk()
  const sUser = useAuthUser()
  const { user: USER } = useData()
  const [profileOpen, setProfileOpen] = React.useState(false)

  const name = sUser.name || USER.name
  const subtitle = sUser.email || USER.handle
  const image = sUser.image || undefined
  const initials = sUser.name ? initialsOf(sUser.name) : USER.initials
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          aria-label={t("profile")}
          className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a5ff12]"
        >
          <Avatar className="size-11 ring-2 ring-white">
            {image ? <AvatarImage src={image} alt={name} /> : null}
            <AvatarFallback className="bg-white text-sm font-bold text-[#2046ed]">
              {initials}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className={HEADER_POPUP_CLASS}
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-3 py-2.5 text-foreground">
              <Avatar className="size-10">
                {image ? <AvatarImage src={image} alt={name} /> : null}
                <AvatarFallback className="bg-[#2046ed] text-xs font-bold text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 leading-tight">
                <span className="truncate text-sm font-semibold">{name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {subtitle}
                </span>
                {sUser.role === "admin" ? (
                  <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-[#2046ed]/10 px-2 py-0.5 text-[10px] font-semibold text-[#2046ed]">
                    <ShieldCheck className="size-3" />
                    {tNav("admin")}
                  </span>
                ) : null}
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
            onClick={() => void signOut({ redirectUrl: `/${locale}` })}
          >
            <LogOut />
            {t("logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  )
}
