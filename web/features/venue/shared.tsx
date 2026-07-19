"use client"

import * as React from "react"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"

/**
 * Shared venue-workspace primitives. Intentionally text-free (everything comes
 * in via props) so they carry no i18n of their own and stay reusable across
 * every venue view. They reuse the player dashboard's visual language:
 * `rounded-4xl` cards, mono micro-captions and condensed display numerals.
 */

/** A titled card section — the venue analogue of the player Overview panel. */
export function VenuePanel({
  title,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-4xl bg-card p-5 shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10",
        className
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 font-heading text-base font-semibold">
          {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  )
}

/** Mono uppercase micro-caption used above values and in card headers. */
export function MicroLabel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "font-mono text-[11px] tracking-wider text-muted-foreground uppercase",
        className
      )}
    >
      {children}
    </span>
  )
}

/**
 * A KPI tile. `invert` flips the delta coloring for "lower is better" metrics
 * (e.g. no-show rate), so a drop reads as good (brand) not bad (destructive).
 */
export function VenueStat({
  label,
  value,
  unit,
  delta,
  deltaSuffix = "",
  icon: Icon,
  invert = false,
  className,
}: {
  label: string
  value: string
  unit?: string
  delta?: number
  deltaSuffix?: string
  icon: React.ComponentType<{ className?: string }>
  invert?: boolean
  className?: string
}) {
  const hasDelta = typeof delta === "number"
  const up = (delta ?? 0) >= 0
  const good = invert ? !up : up
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-4xl bg-card p-5 shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <MicroLabel>{label}</MicroLabel>
        <Icon className="size-4 text-muted-foreground/70" />
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1">
          <span className="font-heading text-4xl leading-none font-bold tracking-tight tabular-nums">
            {value}
          </span>
          {unit ? (
            <span className="text-sm font-medium text-muted-foreground">
              {unit}
            </span>
          ) : null}
        </div>
        {hasDelta ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums",
              good ? "text-brand" : "text-destructive"
            )}
          >
            {up ? (
              <ArrowUpRight className="size-3.5" />
            ) : (
              <ArrowDownRight className="size-3.5" />
            )}
            {up ? "+" : ""}
            {delta}
            {deltaSuffix}
          </span>
        ) : null}
      </div>
    </div>
  )
}

/** Horizontal progress meter (0–100). */
export function Meter({
  pct,
  className,
  barClassName,
}: {
  pct: number
  className?: string
  barClassName?: string
}) {
  return (
    <div
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-muted",
        className
      )}
    >
      <div
        className={cn(
          "h-full rounded-full bg-gradient-to-r from-brand to-lime",
          barClassName
        )}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  )
}

/** A compact SVG area sparkline. */
export function Sparkline({
  values,
  className,
  strokeClassName = "text-brand",
  fillClassName = "text-brand/15",
}: {
  values: number[]
  className?: string
  strokeClassName?: string
  fillClassName?: string
}) {
  const w = 100
  const h = 32
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const step = values.length > 1 ? w / (values.length - 1) : w
  const pts = values.map((v, i) => {
    const x = i * step
    const y = h - ((v - min) / span) * (h - 4) - 2
    return [x, y] as const
  })
  const line = pts.map(([x, y]) => `${x},${y}`).join(" ")
  const area = `0,${h} ${line} ${w},${h}`
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={cn("h-8 w-full", className)}
      aria-hidden
    >
      <polygon points={area} className={cn("fill-current", fillClassName)} />
      <polyline
        points={line}
        fill="none"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        className={cn("stroke-current", strokeClassName)}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** Vertical bar chart (values normalized to the max). */
export function MiniBars({
  values,
  labels,
  highlight,
  className,
}: {
  values: number[]
  labels?: React.ReactNode[]
  /** Index to accent with the lime gradient (e.g. today / peak). */
  highlight?: number
  className?: string
}) {
  const max = Math.max(...values, 1)
  return (
    <div className={cn("flex items-end gap-1.5", className)}>
      {values.map((v, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex h-28 w-full items-end">
            <div
              className={cn(
                "w-full rounded-lg transition-all",
                i === highlight
                  ? "bg-gradient-to-t from-brand to-lime"
                  : "bg-brand/20"
              )}
              style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
            />
          </div>
          {labels ? (
            <span className="font-mono text-[10px] text-muted-foreground">
              {labels[i]}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

/** A single-value SVG donut/ring with a centered label. */
export function Ring({
  pct,
  size = 88,
  thickness = 9,
  children,
  trackClassName = "text-muted",
  ringClassName = "text-brand",
}: {
  pct: number
  size?: number
  thickness?: number
  children?: React.ReactNode
  trackClassName?: string
  ringClassName?: string
}) {
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const dash = (Math.max(0, Math.min(100, pct)) / 100) * c
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${pct}%`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={thickness}
          className={cn("stroke-current", trackClassName)}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          className={cn("stroke-current", ringClassName)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}

/** Empty-state line shared across venue lists. */
export function VenueEmpty({ text }: { text: string }) {
  return (
    <p className="rounded-3xl bg-muted/50 px-4 py-8 text-center text-sm text-muted-foreground">
      {text}
    </p>
  )
}

/**
 * A required-reason prompt for any reservation action the API rejects without
 * one (decline, cancel). Shared by the reservations table and the schedule
 * event popover so both flows send the same shape of reason back to the API.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  reasonLabel,
  reasonPlaceholder,
  cancelLabel,
  confirmLabel,
  reason,
  onReasonChange,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description: React.ReactNode
  reasonLabel: React.ReactNode
  reasonPlaceholder: string
  cancelLabel: React.ReactNode
  confirmLabel: React.ReactNode
  reason: string
  onReasonChange: (reason: string) => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Field className="my-2">
          <FieldLabel htmlFor="reason-dialog-reason">{reasonLabel}</FieldLabel>
          <Textarea
            id="reason-dialog-reason"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder={reasonPlaceholder}
            rows={3}
            maxLength={200}
            autoFocus
          />
        </Field>
        <DialogFooter className="flex-row justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="rounded-full"
            disabled={reason.trim().length < 3}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
