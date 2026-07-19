"use client"

import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import { Flip } from "gsap/Flip"
import { ScrollTrigger } from "gsap/ScrollTrigger"

// Register plugins once on the client. `useGSAP` is registered so its
// context-based cleanup runs, ScrollTrigger powers every scroll effect, and
// Flip drives shared-element layout transitions (e.g. the AI composer moving
// from the centered welcome state to the pinned thread state).
if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP, ScrollTrigger, Flip)
}

/** Whether the visitor has asked for reduced motion — skip animations if so. */
export function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

export { Flip, gsap, ScrollTrigger, useGSAP }
