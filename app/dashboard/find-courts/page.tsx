import type { Metadata } from "next"

import { FindCourtsView } from "@/components/dashboard/views/find-courts"

export const metadata: Metadata = {
  title: "Find Courts",
  description: "Open court slots near you, ready to book.",
}

export default function FindCourtsPage() {
  return <FindCourtsView />
}
