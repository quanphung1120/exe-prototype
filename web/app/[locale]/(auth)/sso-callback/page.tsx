"use client"

import { useLocale } from "next-intl"
import { AuthenticateWithRedirectCallback } from "@clerk/nextjs"

export default function SSOCallbackPage() {
  const locale = useLocale()
  const dashboard = "/" + locale + "/dashboard"

  return (
    <div className="flex min-h-40 items-center justify-center">
      <span className="text-sm text-muted-foreground">…</span>
      <AuthenticateWithRedirectCallback
        signInForceRedirectUrl={dashboard}
        signUpForceRedirectUrl={dashboard}
      />
    </div>
  )
}
