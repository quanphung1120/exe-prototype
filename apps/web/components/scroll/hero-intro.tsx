"use client"

import * as React from "react"

import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap"

/**
 * Plays a staggered entrance timeline on load for the hero. Animates every
 * descendant marked `[data-hero-item]` in document order, so the page owner
 * controls sequencing purely from markup.
 */
export function HeroIntro({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const ref = React.useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const el = ref.current
      if (!el) return
      const items = el.querySelectorAll<HTMLElement>("[data-hero-item]")

      if (prefersReducedMotion()) {
        gsap.set(items, { autoAlpha: 1, y: 0 })
        return
      }

      gsap.fromTo(
        items,
        { autoAlpha: 0, y: 28, filter: "blur(8px)" },
        {
          autoAlpha: 1,
          y: 0,
          filter: "blur(0px)",
          duration: 1,
          ease: "power3.out",
          stagger: 0.12,
          delay: 0.15,
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
