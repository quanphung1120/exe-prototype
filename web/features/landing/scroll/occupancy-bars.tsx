"use client"

import * as React from "react"

import { gsap, prefersReducedMotion, useGSAP } from "@/features/landing/gsap"

const BARS = [40, 55, 38, 72, 61, 88, 76]

/**
 * The venue dashboard's occupancy chart. Bars grow up from the baseline with a
 * left-to-right stagger when the card scrolls into view. `labels` are the
 * (already-translated) weekday captions.
 */
export function OccupancyBars({ labels }: { labels: string[] }) {
  const ref = React.useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const el = ref.current
      if (!el) return
      const bars = el.querySelectorAll<HTMLElement>("[data-bar]")

      if (prefersReducedMotion()) {
        gsap.set(bars, { scaleY: 1 })
        return
      }

      gsap.fromTo(
        bars,
        { scaleY: 0 },
        {
          scaleY: 1,
          duration: 0.9,
          ease: "power3.out",
          stagger: 0.08,
          scrollTrigger: {
            trigger: el,
            start: "top 85%",
            once: true,
          },
        }
      )
    },
    { scope: ref }
  )

  return (
    <div ref={ref} className="mt-6 flex items-end justify-between gap-2">
      {BARS.map((h, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-2">
          <div className="flex h-28 w-full items-end">
            <div
              data-bar
              className="w-full origin-bottom rounded-t-md bg-gradient-to-t from-emerald-500 to-lime-300"
              style={{ height: `${h}%` }}
            />
          </div>
          <span className="font-mono text-[10px] text-emerald-900/55 dark:text-zinc-500">
            {labels[i]}
          </span>
        </div>
      ))}
    </div>
  )
}
