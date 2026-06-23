"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap"

type RevealVariant = "up" | "left" | "right" | "scale" | "blur"

const FROM_VARS: Record<RevealVariant, gsap.TweenVars> = {
  up: { y: 32 },
  left: { x: -40 },
  right: { x: 40 },
  scale: { scale: 0.92 },
  blur: { y: 24, filter: "blur(14px)" },
}

/**
 * Scroll-reveal wrapper powered by GSAP ScrollTrigger. Elements start hidden
 * (CSS `[data-reveal]`, so there's no flash before hydration) and animate in
 * once they enter the viewport. `delayMs` staggers siblings; `variant` picks
 * the motion. Honors `prefers-reduced-motion`.
 */
export function Reveal({
  children,
  className,
  delayMs = 0,
  variant = "up",
}: {
  children: React.ReactNode
  className?: string
  delayMs?: number
  variant?: RevealVariant
}) {
  const ref = React.useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const el = ref.current
      if (!el) return

      if (prefersReducedMotion()) {
        gsap.set(el, { autoAlpha: 1, clearProps: "all" })
        return
      }

      gsap.fromTo(
        el,
        { autoAlpha: 0, ...FROM_VARS[variant] },
        {
          autoAlpha: 1,
          x: 0,
          y: 0,
          scale: 1,
          filter: "blur(0px)",
          duration: 0.9,
          delay: delayMs / 1000,
          ease: "power3.out",
          scrollTrigger: {
            trigger: el,
            start: "top 88%",
            once: true,
          },
        }
      )
    },
    { scope: ref }
  )

  return (
    <div ref={ref} data-reveal className={cn(className)}>
      {children}
    </div>
  )
}
