import { useTranslations } from "next-intl"
import { Spinner } from "@/components/ui/spinner"

export function RouteLoading() {
  const t = useTranslations("RouteLoading")
  return (
    <div
      role="status"
      aria-live="polite"
      className="grid min-h-[60vh] place-items-center p-6"
    >
      <div className="flex flex-col items-center gap-3">
        <Spinner className="size-8" />
        <span className="text-sm text-muted-foreground">{t("label")}</span>
      </div>
    </div>
  )
}
