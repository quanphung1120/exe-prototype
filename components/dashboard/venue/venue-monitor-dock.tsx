"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useLocale, useTranslations } from "next-intl"
import { Radar } from "lucide-react"
import { useRef } from "react"

import { Button } from "@/components/ui/button"
import { Link } from "@/i18n/navigation"
import { VENUE_COURTS, locStr } from "@/components/dashboard/venue/data"
import { VENUE_BASE } from "@/components/dashboard/venue/nav"
import { useVenue } from "@/components/dashboard/venue/venue-provider"

/**
 * The always-on monitor's presence on every venue page: a pill centered along
 * the bottom that quietly says the AI is watching, and bubbles up the newest
 * insight when one surfaces. Mirrors the player {@link MatchmakingDock}'s
 * placement so the two workspaces feel like one product — and so it clears the
 * sidebar's user profile and the bottom-right copilot FAB.
 *
 * It rests at bottom-center but can be dragged anywhere on screen (bounded to
 * the viewport) so the operator can park it out of the way. A plain click on
 * the Review action still navigates — framer-motion treats a press without
 * movement as a tap, not a drag.
 */
export function VenueMonitorDock() {
  const t = useTranslations("VenueDock")
  const locale = useLocale()
  const { latest, unseenCount } = useVenue()
  const expanded = unseenCount > 0 && latest
  // Bounds drag to the viewport so the pill can't be flung off-screen.
  const constraintsRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={constraintsRef}
      className="pointer-events-none fixed inset-0 z-40 flex items-end justify-center px-4 pb-20 sm:pb-6"
    >
      <motion.div
        layout
        drag
        dragConstraints={constraintsRef}
        dragMomentum={false}
        dragElastic={0.08}
        whileDrag={{ scale: 1.03 }}
        className="pointer-events-auto flex max-w-[min(20rem,calc(100vw-2.5rem))] cursor-grab items-center gap-3 rounded-full bg-card/95 py-2 pr-2 pl-3 shadow-xl ring-1 ring-foreground/10 backdrop-blur select-none active:cursor-grabbing"
      >
        <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-lime to-brand text-brand-foreground">
          <span className="animate-pulse-ring absolute inline-flex size-full rounded-full bg-brand/50" />
          <Radar className="relative size-4" />
        </span>

        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm leading-none font-semibold">
            {t("label")}
            {unseenCount > 0 ? (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-foreground tabular-nums">
                {unseenCount}
              </span>
            ) : null}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {expanded
              ? locStr(latest.title, locale)
              : t("watching", { count: VENUE_COURTS.length })}
          </p>
        </div>

        <AnimatePresence>
          {expanded ? (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              className="overflow-hidden"
            >
              <Button
                size="sm"
                className="ml-auto shrink-0 rounded-full"
                nativeButton={false}
                render={<Link href={`${VENUE_BASE}/monitor`} />}
              >
                {t("review")}
              </Button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
