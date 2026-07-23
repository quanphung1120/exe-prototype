"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Banknote,
  CalendarClock,
  Check,
  Clock,
  Footprints,
  Smartphone,
  Users,
  X,
} from "lucide-react"
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type SortingState,
} from "@tanstack/react-table"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SportTag } from "@/features/dashboard/shared"
import {
  MicroLabel,
  ReasonDialog,
  VenueEmpty,
  VenuePanel,
} from "@/features/venue/shared"
import { useVenueData } from "@/features/venue/venue-data-provider"
import { decideReservation } from "@/features/venue/venue-actions"
import {
  BOOKING_TRANSITIONS,
  formatVnd,
  locStr,
  reservationStatusAccent,
  type BookingSource,
  type RefundQueueItem,
  type Reservation,
  type ReservationStatus,
} from "@/features/venue/data"

type Translate = ReturnType<typeof useTranslations>

type Decision = "approved" | "declined"

type FilterKey = "all" | "pending" | "confirmed" | "today" | "history"

const HISTORY_STATUSES: ReservationStatus[] = [
  "completed",
  "cancelled",
  "no-show",
]

const SOURCE_ICON: Record<
  BookingSource,
  React.ComponentType<{ className?: string }>
> = {
  app: Smartphone,
  "walk-in": Footprints,
}

/**
 * Per-column alignment / responsive-visibility classes, applied to both the
 * header cell and every body cell of that column so they hide together.
 */
const COLUMN_CLASS: Record<string, string> = {
  party: "hidden md:table-cell",
  source: "hidden lg:table-cell",
  price: "text-right",
  actions: "text-right",
}

function matchesFilter(r: Reservation, filter: FilterKey): boolean {
  switch (filter) {
    case "all":
      return true
    case "pending":
      return r.status === "pending"
    case "confirmed":
      return r.status === "confirmed"
    case "today":
      return (
        r.dayKey === "today" &&
        (r.status === "confirmed" ||
          r.status === "checked-in" ||
          r.status === "pending")
      )
    case "history":
      return HISTORY_STATUSES.includes(r.status)
  }
}

/** Effective status reflects an operator decision on a pending row. */
function effectiveStatus(
  r: Reservation,
  decision?: Decision
): ReservationStatus {
  if (decision === "approved") return "confirmed"
  if (decision === "declined") return "cancelled"
  return r.status
}

const columnHelper = createColumnHelper<Reservation>()

/**
 * Bookings table columns. Cells close over the operator's in-flight decisions
 * and callbacks; columns rebuild on change, which is free here since the table
 * is small and React Compiler already opts this component out of memoization.
 */
function useReservationColumns(
  t: Translate,
  locale: string,
  decisions: Record<string, Decision>,
  onDecide: (r: Reservation, d: Decision) => void
) {
  return React.useMemo(
    () => [
      columnHelper.accessor((r) => r.customer.name, {
        id: "customer",
        header: () => t("col.customer"),
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original
          const declined = decisions[r.id] === "declined"
          return (
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarFallback className="bg-secondary text-xs font-medium text-secondary-foreground">
                  {r.customer.initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn("font-medium", declined && "line-through")}
                  >
                    {r.customer.name}
                  </span>
                  {r.isRegular ? (
                    <Badge className="bg-lime/20 text-brand">
                      {t("regular")}
                    </Badge>
                  ) : null}
                </div>
                {r.customer.phone ? (
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {r.customer.phone}
                  </div>
                ) : null}
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <SportTag sport={r.sport} />
                  <span aria-hidden>·</span>
                  <span>{r.court}</span>
                </div>
              </div>
            </div>
          )
        },
      }),
      columnHelper.accessor((r) => r.time, {
        id: "when",
        header: () => t("col.when"),
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original
          return (
            <div>
              <div className="inline-flex items-center gap-1 text-sm font-medium tabular-nums">
                <Clock className="size-3.5 text-muted-foreground" />
                {r.time}
              </div>
              <div className="mt-0.5 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                {locStr(r.day, locale)}
              </div>
            </div>
          )
        },
      }),
      columnHelper.accessor("party", {
        id: "party",
        header: ({ column }) => (
          <SortableHeader column={column}>{t("col.party")}</SortableHeader>
        ),
        cell: ({ getValue }) => (
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground tabular-nums">
            <Users className="size-3.5" />
            {getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("source", {
        id: "source",
        header: () => t("col.channel"),
        enableSorting: false,
        cell: ({ getValue }) => {
          const source = getValue()
          const Icon = SOURCE_ICON[source]
          return (
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <Icon className="size-3" />
              {t(`source.${source}`)}
            </Badge>
          )
        },
      }),
      columnHelper.accessor("status", {
        id: "status",
        header: () => t("col.status"),
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original
          const status = effectiveStatus(r, decisions[r.id])
          return (
            <Badge
              className={cn("capitalize", reservationStatusAccent[status])}
            >
              {t(`status.${status}`)}
            </Badge>
          )
        },
      }),
      columnHelper.accessor("price", {
        id: "price",
        header: ({ column }) => (
          <SortableHeader column={column}>{t("col.price")}</SortableHeader>
        ),
        cell: ({ getValue }) => (
          <span className="font-semibold tabular-nums">
            {formatVnd(getValue())}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: () => <span className="sr-only">{t("col.actions")}</span>,
        cell: ({ row }) => (
          <ReservationActions
            reservation={row.original}
            decision={decisions[row.original.id]}
            onDecide={onDecide}
            t={t}
          />
        ),
      }),
    ],
    [t, locale, decisions, onDecide]
  )
}

export function VenueReservationsView({
  embedded = false,
}: {
  embedded?: boolean
} = {}) {
  const t = useTranslations("VenueReservations")
  const locale = useLocale()
  const {
    venueId,
    reservations: RESERVATIONS,
    refundQueue: REFUND_QUEUE,
    updateReservation,
  } = useVenueData()

  const [filter, setFilter] = React.useState<FilterKey>("all")
  // Optimistic overlay of just-decided rows — shows the "decided" affordance and
  // status the instant the operator acts; the server action (below) persists the
  // real status and `updateReservation` folds it into the shared data.
  const [decisions, setDecisions] = React.useState<Record<string, Decision>>({})
  const [, startTransition] = React.useTransition()
  const [sorting, setSorting] = React.useState<SortingState>([])
  // A decline requires a reason (it flows back to the player's cancelled
  // booking), captured in this dialog before the action fires.
  const [declineTarget, setDeclineTarget] = React.useState<Reservation | null>(
    null
  )
  const [declineReason, setDeclineReason] = React.useState("")

  // ── Summary counts (against the source data, not the filtered slice) ──
  const pendingCount = RESERVATIONS.filter((r) => r.status === "pending").length
  const todayConfirmed = RESERVATIONS.filter(
    (r) =>
      r.day.en === "Today" &&
      (r.status === "confirmed" || r.status === "checked-in")
  ).length

  const data = React.useMemo(
    () => RESERVATIONS.filter((r) => matchesFilter(r, filter)),
    [filter, RESERVATIONS]
  )

  const decide = React.useCallback(
    (r: Reservation, decision: Decision, reason?: string) => {
      const name = r.customer.name
      // Optimistically mark the row, then persist. Roll the overlay back if the
      // server rejects it.
      setDecisions((prev) => ({ ...prev, [r.id]: decision }))
      startTransition(async () => {
        try {
          const updated = await decideReservation(
            venueId,
            r.id,
            decision,
            reason
          )
          updateReservation(r.id, {
            status: updated.status,
            declineReason: updated.declineReason,
          })
          if (decision === "approved") {
            toast.success(t("toast.approved", { name }))
          } else {
            toast(t("toast.declined", { name }))
          }
        } catch (error) {
          setDecisions((prev) => {
            const next = { ...prev }
            delete next[r.id]
            return next
          })
          toast.error(
            error instanceof Error ? error.message : "Failed to update booking"
          )
        }
      })
    },
    [t, venueId, updateReservation]
  )

  // Approve fires immediately; decline first collects a required reason.
  const handleDecide = React.useCallback(
    (r: Reservation, decision: Decision) => {
      if (decision === "declined") {
        setDeclineReason("")
        setDeclineTarget(r)
      } else {
        decide(r, "approved")
      }
    },
    [decide]
  )

  const confirmDecline = () => {
    const target = declineTarget
    const reason = declineReason.trim()
    if (!target || !reason) return
    setDeclineTarget(null)
    decide(target, "declined", reason)
  }

  const columns = useReservationColumns(t, locale, decisions, handleDecide)

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const FILTERS: { key: FilterKey; count?: number }[] = [
    { key: "all", count: RESERVATIONS.length },
    { key: "pending", count: pendingCount },
    { key: "confirmed" },
    { key: "today" },
    { key: "history" },
  ]

  return (
    <div className="flex flex-col gap-5">
      {!embedded ? (
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SummaryStat
          label={t("summary.pending")}
          value={pendingCount}
          icon={CalendarClock}
          tone="amber"
          hint={t("summary.pendingHint")}
        />
        <SummaryStat
          label={t("summary.todayConfirmed")}
          value={todayConfirmed}
          icon={Check}
          tone="brand"
          hint={t("summary.todayConfirmedHint")}
        />
      </div>

      <VenuePanel
        title={t("listTitle")}
        icon={Users}
        action={
          <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
            <TabsList variant="line" className="flex-wrap">
              {FILTERS.map((f) => (
                <TabsTrigger key={f.key} value={f.key}>
                  {t(`filters.${f.key}`)}
                  {typeof f.count === "number" ? (
                    <span className="ml-1 font-mono text-[11px] text-muted-foreground/70 tabular-nums">
                      {f.count}
                    </span>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={
                        !header.column.getCanSort()
                          ? undefined
                          : sorted === "asc"
                            ? "ascending"
                            : sorted === "desc"
                              ? "descending"
                              : "none"
                      }
                      className={cn(
                        "h-9 font-mono text-[11px] font-medium tracking-wider text-muted-foreground uppercase",
                        COLUMN_CLASS[header.column.id]
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => {
                const decision = decisions[row.original.id]
                return (
                  <TableRow
                    key={row.id}
                    className={cn(
                      decision === "declined"
                        ? "opacity-55 hover:bg-transparent"
                        : decision === "approved"
                          ? "bg-brand/5 hover:bg-brand/10"
                          : undefined
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={COLUMN_CLASS[cell.column.id]}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="p-0 pt-2">
                  <VenueEmpty text={t("empty")} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </VenuePanel>

      {/* Manual refund queue — SePay has no refund API, so every computed
          refund (decline/cancellation) waits here for a bank transfer by
          hand. Read-only: settling one still happens outside the app. */}
      {REFUND_QUEUE.length ? (
        <RefundQueuePanel items={REFUND_QUEUE} t={t} locale={locale} />
      ) : null}

      {/* Decline reason — required before the decline is sent to the player. */}
      <ReasonDialog
        open={declineTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeclineTarget(null)
        }}
        title={t("declineDialog.title")}
        description={t("declineDialog.description", {
          name: declineTarget?.customer.name ?? "",
        })}
        reasonLabel={t("declineDialog.reasonLabel")}
        reasonPlaceholder={t("declineDialog.reasonPlaceholder")}
        cancelLabel={t("declineDialog.cancel")}
        confirmLabel={t("declineDialog.confirm")}
        reason={declineReason}
        onReasonChange={setDeclineReason}
        onConfirm={confirmDecline}
      />
    </div>
  )
}

// ── Sortable column header ───────────────────────────────────────────────────

function SortableHeader({
  column,
  children,
}: {
  column: Column<Reservation, unknown>
  children: React.ReactNode
}) {
  const sorted = column.getIsSorted()
  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(sorted === "asc")}
      className="-mx-1 inline-flex items-center gap-1 rounded px-1 uppercase transition-colors hover:text-foreground"
    >
      {children}
      {sorted === "asc" ? (
        <ArrowUp className="size-3" aria-hidden />
      ) : sorted === "desc" ? (
        <ArrowDown className="size-3" aria-hidden />
      ) : (
        <ArrowUpDown className="size-3 opacity-40" aria-hidden />
      )}
    </button>
  )
}

// ── Row actions ──────────────────────────────────────────────────────────────

function ReservationActions({
  reservation: r,
  decision,
  onDecide,
  t,
}: {
  reservation: Reservation
  decision?: Decision
  onDecide: (r: Reservation, d: Decision) => void
  t: Translate
}) {
  if (decision != null) {
    return decision === "approved" ? (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand">
        <Check className="size-3.5" />
        {t("decidedApproved")}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <X className="size-3.5" />
        {t("decidedDeclined")}
      </span>
    )
  }

  // A "held" slot is payment-gated, not operator-actionable — it offers no
  // decision surface (and isn't a `BOOKING_TRANSITIONS` key). Guard before the
  // lookup so the six real operator statuses index cleanly below.
  if (r.status === "held") return null

  // Approve/decline is the pending-only decision surface: both target
  // statuses ("confirmed"/"cancelled") must be legal transitions off the
  // reservation's current status (see BOOKING_TRANSITIONS in
  // shared/helpers.ts) — today that only holds for "pending" — so the row
  // never offers an action the API would reject.
  const legalTargets = BOOKING_TRANSITIONS[r.status]
  const isPendingDecision =
    legalTargets.includes("confirmed") && legalTargets.includes("cancelled")
  if (isPendingDecision) {
    return (
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => onDecide(r, "declined")}
        >
          <X />
          {t("decline")}
        </Button>
        <Button
          size="sm"
          className="rounded-full"
          onClick={() => onDecide(r, "approved")}
        >
          <Check />
          {t("approve")}
        </Button>
      </div>
    )
  }

  return <span className="text-xs text-muted-foreground/50">—</span>
}

// ── Summary stat tile ────────────────────────────────────────────────────────

function SummaryStat({
  label,
  value,
  icon: Icon,
  tone,
  hint,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  tone: "brand" | "amber"
  hint: string
}) {
  const toneClass =
    tone === "amber" ? "bg-chart-3/15 text-chart-3" : "bg-brand/12 text-brand"
  return (
    <div className="flex items-center gap-4 rounded-4xl bg-card p-5 shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
      <div
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-2xl",
          toneClass
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <MicroLabel>{label}</MicroLabel>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="font-heading text-3xl leading-none font-bold tracking-tight tabular-nums">
            {value}
          </span>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  )
}

// ── Manual refund queue ──────────────────────────────────────────────────────

/**
 * SePay has no refund API (decision #3/#9) — a decline or a player
 * cancellation only *computes* the refund and stamps it `refund.status:
 * "manual"` (see `BookingsService#applyRefund`). This surfaces every such
 * booking as a read-only worklist so the operator can wire the money by
 * hand; there's no "mark as settled" action yet (a future phase's `ref`
 * field is where that would land).
 */
function RefundQueuePanel({
  items,
  t,
  locale,
}: {
  items: RefundQueueItem[]
  t: Translate
  locale: string
}) {
  return (
    <VenuePanel title={t("refundQueue.title")} icon={Banknote}>
      <p className="-mt-1 text-sm text-muted-foreground">
        {t("refundQueue.hint")}
      </p>
      <ul className="flex flex-col divide-y divide-border">
        {items.map((item) => (
          <li
            key={item.bookingId}
            className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="size-8 shrink-0">
                <AvatarFallback className="text-xs">
                  {item.customer.initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {item.customer.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.court} · {locStr(item.day, locale)} · {item.time}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm font-semibold tabular-nums">
                {formatVnd(item.refund.amount)}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("refundQueue.pct", { pct: item.refund.pct })}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </VenuePanel>
  )
}
