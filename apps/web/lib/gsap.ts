"use client"

import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

// Register plugins once on the client. `useGSAP` is registered so its
// context-based cleanup runs, and ScrollTrigger powers every scroll effect.
if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP, ScrollTrigger)
}

/** Whether the visitor has asked for reduced motion — skip animations if so. */
export function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

export { gsap, ScrollTrigger, useGSAP }
