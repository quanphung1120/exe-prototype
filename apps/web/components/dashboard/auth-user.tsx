"use client"

import * as React from "react"

import { type AuthUser } from "@/lib/auth-server"

// The signed-in user, fetched server-side in the dashboard layout and handed to
// the client so views can greet by real name/email without a client refetch (no
// flash of the seed fallback while `useSession` resolves).
const AuthUserContext = React.createContext<AuthUser | null>(null)

export function AuthUserProvider({
  user,
  children,
}: {
  user: AuthUser
  children: React.ReactNode
}) {
  return (
    <AuthUserContext.Provider value={user}>{children}</AuthUserContext.Provider>
  )
}

export function useAuthUser(): AuthUser {
  const user = React.useContext(AuthUserContext)
  if (!user)
    throw new Error("useAuthUser must be used within an AuthUserProvider")
  return user
}
