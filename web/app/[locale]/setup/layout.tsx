import type { ReactNode } from "react"

import { redirect } from "next/navigation"
import { Logo } from "@/components/logo"
import { Toaster } from "@/components/ui/sonner"
import { getServerSession } from "@/lib/auth-server"

// The guided setup wizard lives outside `dashboard/` — reached only via the
// workspace switcher's "Add venue" action, never auto-redirected into. Reads
// the session per request.
export const dynamic = "force-dynamic"

export default async function SetupLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const session = await getServerSession()
  if (!session) redirect("/" + locale + "/sign-in")

  return (
    <div className="flex min-h-svh flex-col items-center bg-background px-4 py-10 sm:py-16">
      <div className="mb-8 flex justify-center">
        <Logo />
      </div>
      {children}
      <Toaster />
    </div>
  )
}
