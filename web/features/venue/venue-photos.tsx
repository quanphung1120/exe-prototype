"use client"

import * as React from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { ImagePlus, Images, Star, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useVenueData } from "@/features/venue/venue-data-provider"
import { VenuePanel } from "@/features/venue/shared"
import {
  saveVenuePhotos,
  signVenuePhotoUpload,
} from "@/features/venue/venue-actions"

/** Mirrors the api's MAX_VENUE_PHOTOS (venue-photos.service.ts). */
const MAX_PHOTOS = 8
/** Largest file accepted before upload (Cloudinary's free plan caps at 10MB). */
const MAX_BYTES = 5 * 1024 * 1024
const ACCEPT = "image/jpeg,image/png,image/webp"

/** Upload one file straight to Cloudinary with a fresh api-made signature. */
async function uploadPhoto(venueId: string, file: File): Promise<string> {
  const sig = await signVenuePhotoUpload(venueId)
  const form = new FormData()
  form.append("file", file)
  form.append("api_key", sig.apiKey)
  form.append("timestamp", String(sig.timestamp))
  form.append("folder", sig.folder)
  form.append("allowed_formats", sig.allowedFormats)
  form.append("signature", sig.signature)
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`,
    { method: "POST", body: form }
  )
  const body = (await res.json().catch(() => null)) as {
    secure_url?: string
    error?: { message?: string }
  } | null
  if (!res.ok || !body?.secure_url) {
    throw new Error(body?.error?.message ?? "Upload failed")
  }
  return body.secure_url
}

/**
 * The operator's photo gallery for the current branch — illustrative photos
 * players see on the court cards and the booking page. The first photo is
 * the cover. Files upload browser → Cloudinary directly; the api signs each
 * upload and stores the resulting URLs.
 */
export function VenuePhotosPanel() {
  const t = useTranslations("VenuePhotos")
  const { venueId, venue } = useVenueData()
  // Local copy so the grid updates immediately; the server copy catches up
  // through `saveVenuePhotos`' revalidation.
  const [photos, setPhotos] = React.useState<string[]>(venue.photos ?? [])
  const [uploading, setUploading] = React.useState(0)
  const [saving, startSaving] = React.useTransition()
  const inputRef = React.useRef<HTMLInputElement>(null)

  const busy = uploading > 0 || saving
  const remaining = MAX_PHOTOS - photos.length

  const persist = (next: string[], successMessage: string) => {
    const previous = photos
    setPhotos(next)
    startSaving(async () => {
      try {
        setPhotos(await saveVenuePhotos(venueId, next))
        toast.success(successMessage)
      } catch (err) {
        setPhotos(previous)
        toast.error(err instanceof Error ? err.message : t("saveError"))
      }
    })
  }

  const onFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? [])
    if (inputRef.current) inputRef.current.value = ""
    if (!files.length) return

    const accepted = files.filter((f) => ACCEPT.split(",").includes(f.type))
    const sized = accepted.filter((f) => f.size <= MAX_BYTES)
    if (sized.length < files.length) {
      toast.error(t("rejected", { mb: MAX_BYTES / 1024 / 1024 }))
    }
    const batch = sized.slice(0, remaining)
    if (sized.length > remaining) {
      toast.error(t("tooMany", { max: MAX_PHOTOS }))
    }
    if (!batch.length) return

    setUploading(batch.length)
    const results = await Promise.allSettled(
      batch.map((file) => uploadPhoto(venueId, file))
    )
    setUploading(0)
    const urls = results.flatMap((r) =>
      r.status === "fulfilled" ? [r.value] : []
    )
    if (urls.length < batch.length) toast.error(t("uploadError"))
    if (urls.length) {
      persist([...photos, ...urls], t("uploaded", { count: urls.length }))
    }
  }

  return (
    <VenuePanel
      title={t("title")}
      icon={Images}
      action={
        <Button
          size="sm"
          className="rounded-full"
          disabled={busy || remaining <= 0}
          onClick={() => inputRef.current?.click()}
        >
          {uploading > 0 ? <Spinner /> : <ImagePlus className="size-4" />}
          {uploading > 0 ? t("uploading", { count: uploading }) : t("add")}
        </Button>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => void onFiles(e.target.files)}
      />
      <p className="-mt-1 text-xs text-muted-foreground">
        {t("hint", { max: MAX_PHOTOS })}
      </p>

      {photos.length === 0 ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/40"
        >
          <ImagePlus className="size-6" />
          {t("empty")}
        </button>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((url, i) => (
            <li
              key={url}
              className="group relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted ring-1 ring-foreground/5"
            >
              <Image
                src={url}
                alt={t("photoAlt", { name: venue.name, n: i + 1 })}
                fill
                sizes="(min-width: 1024px) 220px, (min-width: 640px) 30vw, 45vw"
                className="object-cover"
              />
              {i === 0 ? (
                <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
                  {t("cover")}
                </span>
              ) : null}
              <div
                className={cn(
                  "absolute inset-x-2 bottom-2 flex justify-end gap-1.5 transition-opacity",
                  "opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
                )}
              >
                {i > 0 ? (
                  <Button
                    size="icon-sm"
                    variant="secondary"
                    className="rounded-full"
                    disabled={busy}
                    aria-label={t("makeCover")}
                    title={t("makeCover")}
                    onClick={() =>
                      persist(
                        [url, ...photos.filter((p) => p !== url)],
                        t("coverSet")
                      )
                    }
                  >
                    <Star />
                  </Button>
                ) : null}
                <Button
                  size="icon-sm"
                  variant="destructive"
                  className="rounded-full"
                  disabled={busy}
                  aria-label={t("remove")}
                  title={t("remove")}
                  onClick={() =>
                    persist(
                      photos.filter((p) => p !== url),
                      t("removed")
                    )
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </VenuePanel>
  )
}
