import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { AppSidebar } from "@/components/dashboard/app-sidebar"
import { CourtAssistant } from "@/components/dashboard/court-assistant"
import {
  MatchmakingDock,
  MatchmakingProvider,
} from "@/components/dashboard/matchmaking"
import { DashboardTopbar } from "@/components/dashboard/topbar"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <TooltipProvider>
      <MatchmakingProvider>
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
        <MatchmakingDock />
        <Toaster />
      </MatchmakingProvider>
    </TooltipProvider>
  )
}
