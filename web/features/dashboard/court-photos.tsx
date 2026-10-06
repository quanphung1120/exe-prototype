"use client"

import * as React from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { ChevronLeft, ChevronRight, Images } from "lucide-react"

import { cn } from "@/lib/utils"
import type { Court } from "@/lib/shared"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * "Photos (n)" pill that opens the venue's photo gallery, so a player can see
 * the place before booking. Renders nothing when the venue has no photos.
 * `className` positions the pill (it sits over clickable court cards, so it
 * stops its click from also selecting the card).
 */
export function CourtPhotosButton({
  court,
  className,
}: {
  court: Court
  className?: string
}) {
  const t = useTranslations("CourtPhotos")
  const [open, setOpen] = React.useState(false)
  const photos = court.photos ?? []
  if (!photos.length) return null

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className={cn(
          "pointer-events-auto h-7 gap-1 rounded-full px-2.5 text-xs",
          className
        )}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        <Images className="size-3.5" />
        {t("open", { count: photos.length })}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="player-play-overlay gap-4 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{court.name}</DialogTitle>
            <DialogDescription>
              {[court.ward, court.province].filter(Boolean).join(", ")}
            </DialogDescription>
          </DialogHeader>
          {/* Mounted only while open, so it restarts at the cover each time. */}
          {open ? <Gallery photos={photos} name={court.name} /> : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

function Gallery({ photos, name }: { photos: string[]; name: string }) {
  const t = useTranslations("CourtPhotos")
  const [index, setIndex] = React.useState(0)
  const go = (delta: number) =>
    setIndex((i) => (i + delta + photos.length) % photos.length)

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-muted">
        <Image
          src={photos[index]}
          alt={t("alt", { name, n: index + 1 })}
          fill
          sizes="(min-width: 640px) 640px, 100vw"
          className="object-cover"
          priority
        />
        {photos.length > 1 ? (
          <>
            <Button
              size="icon-sm"
              variant="secondary"
              className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full"
              aria-label={t("previous")}
              onClick={() => go(-1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              size="icon-sm"
              variant="secondary"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full"
              aria-label={t("next")}
              onClick={() => go(1)}
            >
              <ChevronRight />
            </Button>
            <span className="absolute right-3 bottom-3 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white tabular-nums">
              {index + 1}/{photos.length}
            </span>
          </>
        ) : null}
      </div>
      {photos.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((url, i) => (
            <button
              key={url}
              type="button"
              aria-label={t("alt", { name, n: i + 1 })}
              aria-current={i === index}
              onClick={() => setIndex(i)}
              className={cn(
                "relative h-14 w-20 shrink-0 overflow-hidden rounded-xl ring-2 transition-opacity",
                i === index
                  ? "ring-brand"
                  : "opacity-70 ring-transparent hover:opacity-100"
              )}
            >
              <Image
                src={url}
                alt=""
                fill
                sizes="80px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
