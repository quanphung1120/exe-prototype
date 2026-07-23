"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
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
import { formatVnd } from "@/lib/shared"
import { VenueEmpty } from "@/features/venue/shared"
import {
  createDiscount,
  deleteDiscount,
  updateDiscount,
} from "@/features/admin/admin-actions"
import type {
  AdminDiscountInput,
  AdminDiscountRow,
} from "@/features/admin/admin-types"

type DiscountType = "percent" | "fixed"

/** One dialog target — `null` closed, otherwise which mode to render in. */
type DialogTarget = { mode: "create" } | { mode: "edit"; row: AdminDiscountRow }

/** `ISO string -> "YYYY-MM-DDTHH:mm"` for a `datetime-local` input's value. */
function toDatetimeLocal(iso?: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`
}

function formatValidity(row: AdminDiscountRow): string {
  if (!row.validFrom && !row.validUntil) return "—"
  const fmt = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString("vi-VN") : "∞"
  return `${fmt(row.validFrom)} – ${fmt(row.validUntil)}`
}

export function AdminDiscountsView({
  discounts,
}: {
  discounts: AdminDiscountRow[]
}) {
  const t = useTranslations("AdminDiscounts")
  const [rows, setRows] = React.useState(discounts)
  const [dialogTarget, setDialogTarget] = React.useState<DialogTarget | null>(
    null
  )
  const [togglingCode, setTogglingCode] = React.useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] =
    React.useState<AdminDiscountRow | null>(null)
  const [deletePending, setDeletePending] = React.useState(false)

  const handleSaved = (row: AdminDiscountRow, mode: "create" | "edit") => {
    setRows((current) =>
      mode === "create"
        ? [...current, row]
        : current.map((r) => (r.code === row.code ? row : r))
    )
  }

  const handleToggle = async (row: AdminDiscountRow) => {
    setTogglingCode(row.code)
    try {
      const updated = await updateDiscount(row.code, { active: !row.active })
      setRows((current) =>
        current.map((r) => (r.code === updated.code ? updated : r))
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed")
    } finally {
      setTogglingCode(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeletePending(true)
    try {
      await deleteDiscount(deleteTarget.code)
      setRows((current) => current.filter((r) => r.code !== deleteTarget.code))
      setDeleteTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed")
    } finally {
      setDeletePending(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button
          className="rounded-full"
          onClick={() => setDialogTarget({ mode: "create" })}
        >
          {t("create")}
        </Button>
      </div>

      {rows.length === 0 ? (
        <VenueEmpty text={t("empty")} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.code")}</TableHead>
              <TableHead>{t("table.description")}</TableHead>
              <TableHead>{t("table.value")}</TableHead>
              <TableHead>{t("table.conditions")}</TableHead>
              <TableHead>{t("table.validity")}</TableHead>
              <TableHead>{t("table.usage")}</TableHead>
              <TableHead>{t("table.status")}</TableHead>
              <TableHead className="text-right">{t("table.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.code}>
                <TableCell className="font-mono text-sm font-medium">
                  {row.code}
                </TableCell>
                <TableCell className="max-w-[220px] truncate">
                  {row.description}
                </TableCell>
                <TableCell>
                  {row.type === "percent" ? (
                    <span>
                      {row.value}%
                      {row.maxDiscount !== undefined ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({t("dialog.maxDiscount")}:{" "}
                          {formatVnd(row.maxDiscount)})
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    formatVnd(row.value)
                  )}
                </TableCell>
                <TableCell>
                  {row.minOrder !== undefined ? formatVnd(row.minOrder) : "—"}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {formatValidity(row)}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {row.usedCount}/{row.usageLimit ?? t("unlimited")}
                  {row.perUserLimit !== undefined ? (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({t("table.perUser", { count: row.perUserLimit })})
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Badge variant={row.active ? "default" : "secondary"}>
                    {row.active ? t("status.active") : t("status.inactive")}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => setDialogTarget({ mode: "edit", row })}
                    >
                      {t("actions.edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      disabled={togglingCode === row.code}
                      onClick={() => void handleToggle(row)}
                    >
                      {row.active ? t("actions.disable") : t("actions.enable")}
                    </Button>
                    {row.usedCount === 0 ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="rounded-full"
                        onClick={() => setDeleteTarget(row)}
                      >
                        {t("actions.delete")}
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <DiscountFormDialog
        target={dialogTarget}
        onClose={() => setDialogTarget(null)}
        onSaved={handleSaved}
        t={t}
      />

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("delete.title")}</DialogTitle>
            <DialogDescription>
              {t("delete.description", { code: deleteTarget?.code ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t("delete.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={deletePending}
              onClick={() => void handleDelete()}
            >
              {deletePending ? t("delete.pending") : t("delete.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DiscountFormDialog({
  target,
  onClose,
  onSaved,
  t,
}: {
  target: DialogTarget | null
  onClose: () => void
  onSaved: (row: AdminDiscountRow, mode: "create" | "edit") => void
  t: ReturnType<typeof useTranslations>
}) {
  const [code, setCode] = React.useState("")
  const [type, setType] = React.useState<DiscountType>("percent")
  const [value, setValue] = React.useState("")
  const [maxDiscount, setMaxDiscount] = React.useState("")
  const [minOrder, setMinOrder] = React.useState("")
  const [usageLimit, setUsageLimit] = React.useState("")
  const [perUserLimit, setPerUserLimit] = React.useState("")
  const [validFrom, setValidFrom] = React.useState("")
  const [validUntil, setValidUntil] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [isPending, startTransition] = React.useTransition()

  // Reset the form whenever a new target arrives — derived-during-render
  // state sync (not a `useEffect`), matching `WalkInDialog`/`BlockDialog`.
  const [prevTarget, setPrevTarget] = React.useState(target)
  if (target !== prevTarget) {
    setPrevTarget(target)
    if (target?.mode === "edit") {
      const row = target.row
      setCode(row.code)
      setType(row.type)
      setValue(String(row.value))
      setMaxDiscount(
        row.maxDiscount !== undefined ? String(row.maxDiscount) : ""
      )
      setMinOrder(row.minOrder !== undefined ? String(row.minOrder) : "")
      setUsageLimit(row.usageLimit !== undefined ? String(row.usageLimit) : "")
      setPerUserLimit(
        row.perUserLimit !== undefined ? String(row.perUserLimit) : ""
      )
      setValidFrom(toDatetimeLocal(row.validFrom))
      setValidUntil(toDatetimeLocal(row.validUntil))
      setDescription(row.description)
    } else if (target?.mode === "create") {
      setCode("")
      setType("percent")
      setValue("")
      setMaxDiscount("")
      setMinOrder("")
      setUsageLimit("")
      setPerUserLimit("")
      setValidFrom("")
      setValidUntil("")
      setDescription("")
    }
  }

  const handleSubmit = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!target) return
    startTransition(async () => {
      try {
        // In edit mode, an emptied field means "clear it" (`null`, applied
        // by the PATCH's null-clearing semantics); in create mode there is
        // nothing to clear, so an empty field is simply omitted.
        const cleared = target.mode === "edit" ? null : undefined
        const patch: Partial<AdminDiscountInput> = {
          type,
          value: Number(value),
          maxDiscount:
            type === "percent" && maxDiscount ? Number(maxDiscount) : cleared,
          minOrder: minOrder ? Number(minOrder) : cleared,
          usageLimit: usageLimit ? Number(usageLimit) : cleared,
          perUserLimit: perUserLimit ? Number(perUserLimit) : cleared,
          validFrom: validFrom ? new Date(validFrom).toISOString() : cleared,
          validUntil: validUntil ? new Date(validUntil).toISOString() : cleared,
          description,
        }
        if (target.mode === "create") {
          const created = await createDiscount({
            ...patch,
            code,
          } as AdminDiscountInput)
          onSaved(created, "create")
        } else {
          const updated = await updateDiscount(target.row.code, patch)
          onSaved(updated, "edit")
        }
        onClose()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Request failed")
      }
    })
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {target?.mode === "edit"
              ? t("dialog.editTitle")
              : t("dialog.createTitle")}
          </DialogTitle>
        </DialogHeader>
        {target ? (
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t("dialog.code")}
              <Input
                required
                disabled={target.mode === "edit"}
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t("dialog.type.label")}
                <Select
                  value={type}
                  onValueChange={(v) => setType(v as DiscountType)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v) => t(`dialog.type.${v as DiscountType}`)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">
                      {t("dialog.type.percent")}
                    </SelectItem>
                    <SelectItem value="fixed">
                      {t("dialog.type.fixed")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t("dialog.value")}
                <Input
                  required
                  min={1}
                  type="number"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                />
              </label>
            </div>
            {type === "percent" ? (
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t("dialog.maxDiscount")}
                <Input
                  min={1}
                  type="number"
                  value={maxDiscount}
                  onChange={(event) => setMaxDiscount(event.target.value)}
                />
              </label>
            ) : null}
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t("dialog.minOrder")}
              <Input
                min={1}
                type="number"
                value={minOrder}
                onChange={(event) => setMinOrder(event.target.value)}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t("dialog.usageLimit")}
                <Input
                  min={1}
                  type="number"
                  value={usageLimit}
                  onChange={(event) => setUsageLimit(event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t("dialog.perUserLimit")}
                <Input
                  min={1}
                  type="number"
                  value={perUserLimit}
                  onChange={(event) => setPerUserLimit(event.target.value)}
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t("dialog.validFrom")}
                <Input
                  type="datetime-local"
                  value={validFrom}
                  onChange={(event) => setValidFrom(event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t("dialog.validUntil")}
                <Input
                  type="datetime-local"
                  value={validUntil}
                  onChange={(event) => setValidUntil(event.target.value)}
                />
              </label>
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t("dialog.description")}
              <Input
                required
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {t("dialog.cancel")}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? t("dialog.saving") : t("dialog.submit")}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
