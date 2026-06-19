import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { AppSidebar } from "@/components/dashboard/app-sidebar"
import { BookingProvider } from "@/components/dashboard/booking"
import { BookingDialog } from "@/components/dashboard/booking-dialog"
import { ChatProvider } from "@/components/dashboard/chat-store"
import { CourtAssistant } from "@/components/dashboard/court-assistant"
import {
  MatchmakingDock,
  MatchmakingProvider,
} from "@/components/dashboard/matchmaking"
import { NotificationsProvider } from "@/components/dashboard/notifications"
import { PlayChooser } from "@/components/dashboard/play-chooser"
import { DashboardTopbar } from "@/components/dashboard/topbar"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <TooltipProvider>
      <MatchmakingProvider>
        <BookingProvider>
          <NotificationsProvider>
            <ChatProvider>
              <SidebarProvider className="font-geist">
                <AppSidebar />
                <SidebarInset className="overflow-hidden">
                  <DashboardTopbar />
                  <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                    {children}
                  </main>
                  <CourtAssistant />
                </SidebarInset>
              </SidebarProvider>
            </ChatProvider>
          </NotificationsProvider>
          <MatchmakingDock />
          <PlayChooser />
          <BookingDialog />
          <Toaster />
        </BookingProvider>
      </MatchmakingProvider>
    </TooltipProvider>
  )
}
