import { redirect } from "next/navigation"
import { fetchSeed } from "@/lib/api"
import { getServerSession } from "@/lib/auth-server"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { AppSidebar } from "@/features/dashboard/app-sidebar"
import { AuthUserProvider } from "@/features/dashboard/auth-user"
import { ChatProvider } from "@/features/chat/chat-store"
import { DataProvider } from "@/features/dashboard/data-provider"
import { NotificationsProvider } from "@/features/dashboard/notifications"
import { PlayerAssessmentGate } from "@/features/assessment/player-assessment-gate"
import { PlayerChrome } from "@/features/dashboard/player-chrome"
import { SessionProvider } from "@/features/play/session"
import { SportFilterProvider } from "@/features/dashboard/sport-filter"
import { DashboardTopbar } from "@/features/dashboard/topbar"

// The seed is fetched per request from the Hono API, so the dashboard renders
// dynamically (and `next build` never reaches for the API).
export const dynamic = "force-dynamic"

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  // Guard the dashboard — bounce to the locale sign-in when there's no signed-in
  // user (Clerk-backed `getServerSession`). Once signed in, the sidebar shows a
  // "Try demo" shortcut.
  const session = await getServerSession()
  if (!session) {
    redirect("/" + locale + "/sign-in")
  }

  const seed = await fetchSeed()

  return (
    <TooltipProvider>
      <AuthUserProvider user={session.user}>
        <DataProvider seed={seed}>
          <SessionProvider>
            <NotificationsProvider>
              <ChatProvider>
                <SportFilterProvider>
                  <PlayerAssessmentGate serverAssessment={seed.assessment}>
                    <SidebarProvider className="font-geist">
                      <AppSidebar />
                      <SidebarInset className="overflow-hidden">
                        <DashboardTopbar />
                        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                          {children}
                        </main>
                      </SidebarInset>
                    </SidebarProvider>
                    <PlayerChrome />
                  </PlayerAssessmentGate>
                </SportFilterProvider>
              </ChatProvider>
            </NotificationsProvider>
            <Toaster />
          </SessionProvider>
        </DataProvider>
      </AuthUserProvider>
    </TooltipProvider>
  )
}
