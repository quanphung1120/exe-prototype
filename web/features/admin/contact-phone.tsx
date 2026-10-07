import { Phone } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * A brand owner's contact phone as a tap-to-call link — or a muted
 * placeholder for brands created before setup asked for one.
 */
export function ContactPhone({
  phone,
  emptyLabel,
  className,
}: {
  phone?: string
  emptyLabel: string
  className?: string
}) {
  if (!phone) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        {emptyLabel}
      </span>
    )
  }
  return (
    <a
      href={`tel:${phone}`}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium text-brand tabular-nums hover:underline",
        className
      )}
    >
      <Phone className="size-3" />
      {phone}
    </a>
  )
}
