"use client"

import type * as React from "react"

import { hashStr, initialsOf } from "@/lib/shared"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

/**
 * Deterministic per-person fallback gradients (indexed by name hash) so
 * initials avatars are tinted consistently everywhere instead of flat gray.
 * hashStr is already a uint32 — plain % is safe (never use a signed >>).
 */
const FALLBACK_GRADIENTS = [
  "bg-gradient-to-br from-emerald-500 to-teal-600 text-white",
  "bg-gradient-to-br from-lime-500 to-emerald-600 text-white",
  "bg-gradient-to-br from-teal-500 to-cyan-600 text-white",
  "bg-gradient-to-br from-amber-500 to-orange-600 text-white",
  "bg-gradient-to-br from-sky-500 to-indigo-600 text-white",
  "bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white",
]

/**
 * The one avatar treatment for the whole chat surface: real photo when the
 * Stream user carries an `image`, otherwise initials on a deterministic
 * gradient. `children` passes through for an AvatarBadge (online dot).
 */
export function ChatAvatar({
  name,
  image,
  className,
  fallbackClassName,
  children,
}: {
  name: string
  image?: string | null
  className?: string
  fallbackClassName?: string
  children?: React.ReactNode
}) {
  const gradient =
    FALLBACK_GRADIENTS[hashStr(name) % FALLBACK_GRADIENTS.length]
  return (
    <Avatar className={className}>
      {image ? <AvatarImage src={image} alt="" /> : null}
      <AvatarFallback
        className={cn("text-xs font-medium", gradient, fallbackClassName)}
      >
        {initialsOf(name)}
      </AvatarFallback>
      {children}
    </Avatar>
  )
}
