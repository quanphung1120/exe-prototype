"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { gsap, prefersReducedMotion, useGSAP } from "@/features/landing/gsap"

// Pull the first numeric run out of a display string, keeping whatever wraps it
// (e.g. "3,200+" → prefix "", number 3200, suffix "+"; "<60s" → "<", 60, "s").
function parse(value: string) {
  const match = value.match(/-?[\d,]*\.?\d+/)
  if (!match) return null
  const raw = match[0]
  const number = parseFloat(raw.replace(/,/g, ""))
  if (!Number.isFinite(number)) return null
  const dot = raw.indexOf(".")
  return {
    number,
    prefix: value.slice(0, match.index),
    suffix: value.slice(match.index! + raw.length),
    decimals: dot === -1 ? 0 : raw.length - dot - 1,
    grouped: raw.includes(","),
  }
}

/**
 * Counts a numeric stat up from zero when it scrolls into view, preserving any
 * surrounding prefix/suffix and the original formatting. Falls back to the
 * literal string if it can't be parsed or motion is reduced.
 */
export function CountUp({
  value,
  className,
}: {
  value: string
  className?: string
}) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const parsed = React.useMemo(() => parse(value), [value])

  useGSAP(
    () => {
      const el = ref.current
      if (!el || !parsed || prefersReducedMotion()) return

      const format = (n: number) =>
        parsed.grouped
          ? n.toLocaleString("en-US", {
              minimumFractionDigits: parsed.decimals,
              maximumFractionDigits: parsed.decimals,
            })
          : n.toFixed(parsed.decimals)

      const counter = { n: 0 }
      el.textContent = `${parsed.prefix}${format(0)}${parsed.suffix}`

      gsap.to(counter, {
        n: parsed.number,
        duration: 1.6,
        ease: "power2.out",
        onUpdate: () => {
          el.textContent = `${parsed.prefix}${format(counter.n)}${parsed.suffix}`
        },
        scrollTrigger: {
          trigger: el,
          start: "top 90%",
          once: true,
        },
      })
    },
    { scope: ref, dependencies: [parsed] }
  )

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {value}
    </span>
  )
}
