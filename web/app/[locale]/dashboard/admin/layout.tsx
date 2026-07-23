import { redirect } from "next/navigation"

import { getServerSession } from "@/lib/auth-server"

/**
 * Admin-workspace role guard. The shared dashboard layout already bounces an
 * anonymous caller to sign-in, so reaching here always has a session — this
 * only checks the Clerk `publicMetadata.role` (RBAC, granted manually in the
 * Clerk dashboard, never by app code — see `ClerkAuthGuard`'s docstring on the
 * api side). A non-admin is sent back to their own dashboard rather than a
 * bare 404, since `/dashboard/admin` is a real route for the right caller.
 */
export default async function AdminWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const session = await getServerSession()
  if (session?.user.role !== "admin") {
    redirect("/" + locale + "/dashboard")
  }
  return <>{children}</>
}
