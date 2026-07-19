"use client"

import * as React from "react"

import { gsap, prefersReducedMotion, useGSAP } from "@/features/landing/gsap"

/**
 * Wraps content and shifts it vertically as the section scrolls through the
 * viewport, creating depth. `speed` is the fraction of the element's height it
 * travels across the scroll (positive = moves up faster than the page).
 */
export function Parallax({
  children,
  className,
  speed = 0.18,
}: {
  children: React.ReactNode
  className?: string
  speed?: number
}) {
  const ref = React.useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const el = ref.current
      if (!el || prefersReducedMotion()) return

      gsap.fromTo(
        el,
        { yPercent: -speed * 50 },
        {
          yPercent: speed * 50,
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start: "top bottom",
            end: "bottom top",
            scrub: true,
          },
        }
      )
    },
    { scope: ref }
  )

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
