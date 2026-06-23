import { fetchSeed } from "@/lib/api"
import { getServerSession } from "@/lib/auth-server"
import { redirect } from "@/i18n/navigation"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { AppSidebar } from "@/components/dashboard/app-sidebar"
import { AuthUserProvider } from "@/components/dashboard/auth-user"
import { ChatProvider } from "@/components/dashboard/chat-store"
import { DataProvider } from "@/components/dashboard/data-provider"
import { NotificationsProvider } from "@/components/dashboard/notifications"
import { PlayerChrome } from "@/components/dashboard/player-chrome"
import { SessionProvider } from "@/components/dashboard/session"
import { SportFilterProvider } from "@/components/dashboard/sport-filter"
import { DashboardTopbar } from "@/components/dashboard/topbar"

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

  // Guard the dashboard — bounce to sign-in when there's no valid session (the
  // cookie is forwarded to the API's get-session endpoint). Once signed in, the
  // sidebar shows a "Try demo" shortcut.
  const session = await getServerSession()
  if (!session) {
    redirect({ href: "/sign-in", locale })
    return null
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
                  <SidebarProvider className="font-geist">
                    <AppSidebar />
                    <SidebarInset className="overflow-hidden">
                      <DashboardTopbar />
                      <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                        {children}
                      </main>
                    </SidebarInset>
                  </SidebarProvider>
                </SportFilterProvider>
              </ChatProvider>
            </NotificationsProvider>
            <PlayerChrome />
            <Toaster />
          </SessionProvider>
        </DataProvider>
      </AuthUserProvider>
    </TooltipProvider>
  )
}
