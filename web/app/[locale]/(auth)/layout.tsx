import type { ReactNode } from "react"

import { Logo } from "@/components/logo"
import { getServerSession } from "@/lib/auth-server"
import { redirect } from "@/i18n/navigation"

// Auth pages read the session cookie, so they render per request.
export const dynamic = "force-dynamic"

export default async function AuthLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  // Already signed in? Skip the auth pages entirely.
  const session = await getServerSession()
  if (session) redirect({ href: "/dashboard", locale })

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex justify-center">
          <Logo />
        </div>
        {children}
      </div>
    </div>
  )
}
