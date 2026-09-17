"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"

export function useAdminPagination(total: number) {
  const [requestedPage, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(requestedPage, pageCount)

  // Persist the clamped page when a mutation removes the last page.
  if (page !== requestedPage) setPage(page)

  return {
    total,
    page,
    pageSize,
    pageCount,
    offset: (page - 1) * pageSize,
    setPage,
    setPageSize: (size: number) => {
      setPageSize(size)
      setPage(1)
    },
  }
}

export function AdminPagination({
  pagination,
}: {
  pagination: ReturnType<typeof useAdminPagination>
}) {
  const t = useTranslations("AdminPagination")
  const { total, page, pageSize, pageCount, offset, setPage, setPageSize } =
    pagination

  if (total === 0) return null

  return (
    <nav
      aria-label={t("label")}
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t("range", {
          from: offset + 1,
          to: Math.min(offset + pageSize, total),
          total,
        })}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          {t("pageSize")}
          <select
            className="rounded-md border border-input bg-background px-2 py-1.5"
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
          >
            {[10, 20, 50].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          {t("previous")}
        </Button>
        <label className="flex items-center gap-2 text-sm">
          {t("page")}
          <select
            className="rounded-md border border-input bg-background px-2 py-1.5"
            value={page}
            onChange={(event) => setPage(Number(event.target.value))}
          >
            {Array.from({ length: pageCount }, (_, i) => i + 1).map(
              (number) => (
                <option key={number} value={number}>
                  {number}
                </option>
              )
            )}
          </select>
          / {pageCount}
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page === pageCount}
          onClick={() => setPage(page + 1)}
        >
          {t("next")}
        </Button>
      </div>
    </nav>
  )
}
