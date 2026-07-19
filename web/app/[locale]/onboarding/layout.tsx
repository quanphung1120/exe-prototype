import type { ReactNode } from "react"

import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth-server"

// The onboarding choice point lives outside `dashboard/` — reached via a
// server-side redirect from the dashboard layout, or directly after sign-up.
export const dynamic = "force-dynamic"

export default async function OnboardingLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const session = await getServerSession()
  if (!session) redirect("/" + locale + "/sign-in")

  return <>{children}</>
}
