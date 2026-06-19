import type { Metadata } from "next"

import { MatchMakerView } from "@/components/dashboard/views/match-maker"

export const metadata: Metadata = {
  title: "Match Maker",
  description: "AI-picked players matched to your level and schedule.",
}

export default function MatchMakerPage() {
  return <MatchMakerView />
}
