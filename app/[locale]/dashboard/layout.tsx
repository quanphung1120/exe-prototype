import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { AppSidebar } from "@/components/dashboard/app-sidebar"
import { ChatProvider } from "@/components/dashboard/chat-store"
import { NotificationsProvider } from "@/components/dashboard/notifications"
import { PlayerChrome } from "@/components/dashboard/player-chrome"
import { SessionProvider } from "@/components/dashboard/session"
import { SportFilterProvider } from "@/components/dashboard/sport-filter"
import { DashboardTopbar } from "@/components/dashboard/topbar"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <TooltipProvider>
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
    </TooltipProvider>
  )
}
