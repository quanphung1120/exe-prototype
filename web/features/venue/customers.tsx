"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  ArrowDownRight,
  ArrowUpDown,
  ArrowUpRight,
  ArrowUp,
  ArrowDown,
  Plus,
  TrendingDown,
  Users,
} from "lucide-react"
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  getSortedRowModel,
  type SortingState,
  type ColumnDef,
  type Column,
} from "@tanstack/react-table"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  customerTierAccent,
  formatVnd,
  locStr,
  type CustomerTier,
  type VenueCustomer,
} from "@/features/venue/data"
import { useVenueData } from "@/features/venue/venue-data-provider"
import { createCustomer } from "@/features/venue/venue-actions"
import {
  VenueEmpty,
  VenuePanel,
} from "@/features/venue/shared"
import { SportTag } from "@/features/dashboard/shared"

type Segment = "all" | CustomerTier

const SEGMENTS: Segment[] = ["all", "vip", "regular", "new", "at-risk"]

function parseRelativeDate(localized: { en: string; vi: string }): number {
  const en = localized.en.toLowerCase()
  if (en.includes("today")) return 0
  if (en.includes("yesterday")) return 1
  const daysMatch = en.match(/(\d+)\s+days?\s+ago/)
  if (daysMatch && daysMatch[1]) return parseInt(daysMatch[1], 10)
  const weeksMatch = en.match(/(\d+)\s+weeks?\s+ago/)
  if (weeksMatch && weeksMatch[1]) return parseInt(weeksMatch[1], 10) * 7
  return 9999
}

export function VenueCustomersView({
  embedded = false,
}: {
  embedded?: boolean
} = {}) {
  const t = useTranslations("VenueCustomers")
  const locale = useLocale()
  const {
    venueId,
    venueCustomers: VENUE_CUSTOMERS,
    addCustomer,
  } = useVenueData()
  const [segment, setSegment] = React.useState<Segment>("all")
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [isAddOpen, setIsAddOpen] = React.useState(false)

  const total = VENUE_CUSTOMERS.length

  const countFor = React.useCallback(
    (seg: Segment) =>
      seg === "all"
        ? total
        : VENUE_CUSTOMERS.filter((c) => c.tier === seg).length,
    [total, VENUE_CUSTOMERS]
  )

  const rows = React.useMemo(
    () =>
      VENUE_CUSTOMERS.filter(
        (c) => segment === "all" || c.tier === segment
      ).slice(),
    [segment, VENUE_CUSTOMERS]
  )

  const tierLabel = React.useCallback(
    (tier: CustomerTier) => t(`tiers.${tier}`),
    [t]
  )


  const headerCell = React.useCallback((label: string, column: Column<VenueCustomer, unknown>) => {
    return (
      <button
        type="button"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="group inline-flex items-center gap-1 hover:text-foreground text-left font-mono text-[11px] tracking-wider uppercase text-muted-foreground transition-colors"
      >
        {label}
        {column.getIsSorted() === "asc" ? (
          <ArrowUp className="size-3 text-brand" />
        ) : column.getIsSorted() === "desc" ? (
          <ArrowDown className="size-3 text-brand" />
        ) : (
          <ArrowUpDown className="size-3 opacity-30 group-hover:opacity-100 transition-opacity" />
        )}
      </button>
    )
  }, [])

  const headerCellRight = React.useCallback((label: string, column: Column<VenueCustomer, unknown>) => {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="group inline-flex items-center gap-1 hover:text-foreground text-right font-mono text-[11px] tracking-wider uppercase text-muted-foreground transition-colors"
        >
          {label}
          {column.getIsSorted() === "asc" ? (
            <ArrowUp className="size-3 text-brand" />
          ) : column.getIsSorted() === "desc" ? (
            <ArrowDown className="size-3 text-brand" />
          ) : (
            <ArrowUpDown className="size-3 opacity-30 group-hover:opacity-100 transition-opacity" />
          )}
        </button>
      </div>
    )
  }, [])

  const columns = React.useMemo<ColumnDef<VenueCustomer>[]>(() => {
    return [
      {
        accessorKey: "name",
        header: ({ column }) => headerCell(t("col.customer"), column),
        cell: ({ row }) => {
          const c = row.original
          return (
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarFallback className="bg-secondary text-xs font-medium text-secondary-foreground">
                  {c.initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-foreground">{c.name}</span>
                  <TierChip tier={c.tier} label={tierLabel(c.tier)} />
                </div>
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                  {t("visitsUnit", { count: c.visits })}
                </span>
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: "id",
        header: ({ column }) => headerCell(t("col.phone"), column),
        cell: ({ row }) => (
          <span className="font-mono text-sm text-muted-foreground">
            {row.original.id}
          </span>
        ),
      },
      {
        accessorKey: "favoriteSport",
        header: ({ column }) => headerCell(t("col.sport"), column),
        cell: ({ row }) => <SportTag sport={row.original.favoriteSport} />,
      },
      {
        accessorKey: "visits",
        header: ({ column }) => headerCellRight(t("col.visits"), column),
        cell: ({ row }) => (
          <div className="text-right font-heading text-sm font-semibold tabular-nums text-foreground">
            {row.original.visits}
          </div>
        ),
      },
      {
        accessorKey: "lastVisit",
        header: ({ column }) => headerCell(t("col.lastVisit"), column),
        cell: ({ row }) => {
          const c = row.original
          const trendUp = c.trend >= 0
          const flat = c.trend === 0
          return (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {locStr(c.lastVisit, locale)}
              </span>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold tabular-nums",
                  flat
                    ? "text-muted-foreground"
                    : trendUp
                      ? "text-brand"
                      : "text-destructive"
                )}
              >
                {flat ? (
                  <TrendingDown className="size-3.5 opacity-40" />
                ) : trendUp ? (
                  <ArrowUpRight className="size-3.5" />
                ) : (
                  <ArrowDownRight className="size-3.5" />
                )}
                {flat ? "—" : `${trendUp ? "+" : ""}${c.trend}%`}
              </span>
            </div>
          )
        },
        sortingFn: (rowA, rowB) => {
          const aVal = parseRelativeDate(rowA.original.lastVisit)
          const bVal = parseRelativeDate(rowB.original.lastVisit)
          return aVal - bVal
        },
      },
      {
        accessorKey: "ltv",
        header: ({ column }) => headerCellRight(t("col.ltv"), column),
        cell: ({ row }) => (
          <div className="text-right font-heading text-sm font-semibold text-brand tabular-nums">
            {formatVnd(row.original.ltv)}
          </div>
        ),
      },
      {
        accessorKey: "noShowRate",
        header: ({ column }) => headerCellRight(t("col.noShow"), column),
        cell: ({ row }) => {
          const c = row.original
          return (
            <div
              className={cn(
                "text-right text-sm font-medium tabular-nums",
                c.noShowRate >= 15
                  ? "text-destructive"
                  : c.noShowRate > 0
                    ? "text-muted-foreground"
                    : "text-muted-foreground/50"
              )}
            >
              {c.noShowRate}
              <span className="text-[11px] text-muted-foreground/70">
                {t("noShowSuffix")}
              </span>
            </div>
          )
        },
      },
    ]
  }, [t, locale, tierLabel, headerCell, headerCellRight])

  const table = useReactTable({
    data: rows,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

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

      <VenuePanel
        title={t("listTitle")}
        icon={Users}
        action={
          <div className="flex items-center gap-3">
            <Tabs value={segment} onValueChange={(v) => setSegment(v as Segment)}>
              <TabsList variant="line" className="flex-wrap">
                {SEGMENTS.map((seg) => (
                  <TabsTrigger key={seg} value={seg}>
                    {t(`segments.${seg}`)}
                    <span className="ml-1.5 font-mono text-[10px] text-muted-foreground tabular-nums">
                      {countFor(seg)}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button
              size="sm"
              onClick={() => setIsAddOpen(true)}
              className="rounded-full"
            >
              <Plus className="mr-1 size-4" />
              {t("addButton")}
            </Button>
          </div>
        }
      >
        {rows.length ? (
          <div className="rounded-2xl border border-border/60 overflow-hidden bg-card/50">
            <Table>
              <TableHeader className="bg-muted/30">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className="hover:bg-transparent">
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} className="h-10 px-4 py-2">
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className={cn(
                      "transition-colors",
                      row.original.tier === "at-risk"
                        ? "bg-destructive/[0.02] hover:bg-destructive/[0.06] data-[state=selected]:bg-destructive/[0.08]"
                        : "hover:bg-muted/40"
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="px-4 py-3 align-middle">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <VenueEmpty text={t("empty")} />
        )}
      </VenuePanel>
      <AddCustomerDialog
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onAdd={addCustomer}
        venueId={venueId}
        customersList={VENUE_CUSTOMERS}
      />
    </div>
  )
}

function TierChip({ tier, label }: { tier: CustomerTier; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        customerTierAccent[tier]
      )}
    >
      {label}
    </span>
  )
}

interface AddCustomerDialogProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (customer: VenueCustomer) => void
  venueId: string
  customersList: VenueCustomer[]
}

function AddCustomerDialog({ isOpen, onClose, onAdd, venueId, customersList }: AddCustomerDialogProps) {
  const t = useTranslations("VenueCustomers")
  const tc = useTranslations("Common")
  const [name, setName] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [sport, setSport] = React.useState<"badminton">("badminton")
  const [isPending, startTransition] = React.useTransition()
  const [error, setError] = React.useState("")

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")

    const trimmedPhone = phone.trim()
    const trimmedName = name.trim()
    if (!trimmedPhone || !trimmedName) return

    // Cheap client-side duplicate guard for instant feedback; the server also
    // enforces this (unique phone → 409) and is the source of truth.
    const exists = customersList.some((c) => c.id === trimmedPhone)
    if (exists) {
      setError(t("addDialog.duplicate"))
      return
    }

    startTransition(async () => {
      try {
        const created = await createCustomer(venueId, {
          name: trimmedName,
          phone: trimmedPhone,
          favoriteSport: sport,
        })
        onAdd(created)
        toast.success(t("addDialog.added"))
        setName("")
        setPhone("")
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : t("addDialog.addError"))
      }
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("addDialog.title")}</DialogTitle>
          <DialogDescription>{t("addDialog.description")}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {error && (
            <div className="text-sm font-medium text-destructive">
              {error}
            </div>
          )}
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("addDialog.name")}
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("addDialog.namePlaceholder")}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("addDialog.phone")}
            <Input
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t("addDialog.phonePlaceholder")}
            />
          </label>
          <div className="flex flex-col gap-1.5 text-sm font-medium">
            <span>{t("addDialog.sport")}</span>
            <Select
              value={sport}
              onValueChange={(v) => setSport(v as "badminton")}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v) => tc(`sports.${v as "badminton"}`)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="badminton">{tc("sports.badminton")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              {t("addDialog.cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("addDialog.saving") : t("addDialog.submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
