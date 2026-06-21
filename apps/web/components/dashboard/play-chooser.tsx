"use client"

import { useTranslations } from "next-intl"
import { ChevronRight, MapPin, Users, Zap } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useBooking } from "@/components/dashboard/booking"
import { useRouter } from "@/i18n/navigation"

export function PlayChooser() {
  const t = useTranslations("Play")
  const { playOpen, closePlay, openBooking } = useBooking()
  const router = useRouter()

  const options = [
    {
      key: "book",
      icon: MapPin,
      title: t("bookCourt"),
      desc: t("bookCourtDesc"),
      onClick: () => openBooking(null, { fillMode: "court" }),
    },
    {
      key: "teammates",
      icon: Users,
      title: t("findTeammates"),
      desc: t("findTeammatesDesc"),
      onClick: () => {
        closePlay()
        router.push("/dashboard/play")
      },
    },
    {
      key: "both",
      icon: Zap,
      title: t("both"),
      desc: t("bothDesc"),
      onClick: () => openBooking(null, { fillMode: "find" }),
    },
  ]

  return (
    <Dialog open={playOpen} onOpenChange={(o) => !o && closePlay()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("title")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={o.onClick}
              className="flex items-center gap-3 rounded-3xl border border-border p-4 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand/12 text-brand">
                <o.icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-heading font-semibold">
                  {o.title}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {o.desc}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
