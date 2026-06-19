import type { Metadata } from "next"

import { StreakView } from "@/components/dashboard/views/streak"

export const metadata: Metadata = {
  title: "Streak",
  description: "Track your play streak and keep the momentum alive.",
}

export default function StreakPage() {
  return <StreakView />
}
