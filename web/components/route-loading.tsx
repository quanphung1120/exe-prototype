import { useTranslations } from "next-intl"
import { Skeleton } from "@/components/ui/skeleton"

export function RouteLoading() {
  const t = useTranslations("RouteLoading")
  return (
    <div role="status" aria-live="polite" className="space-y-6 p-6">
      <span className="sr-only">{t("label")}</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-64 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
