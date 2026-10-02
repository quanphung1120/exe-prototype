"use client"

import { useState, type ReactNode } from "react"
import Image from "next/image"
import { useLocale, useTranslations } from "next-intl"
import { ArrowRight, Clock3, MapPin, Search, Star, Users, Zap } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { hasCoordinates } from "@/lib/shared/location"
import { useData } from "@/features/dashboard/data-provider"
import { CourtMap } from "@/features/play/court-map"
import { useSession } from "@/features/play/session"
import { formatVnd } from "@/features/dashboard/data"

const art = {
  court: "/e42e9841354b4ff0e4b8f1da29efc7bcb5b0b2c8.png",
  right: "/4e1489ef75c40c81925a318f078a63a3dbf086c9.png",
  left: "/58f807168247ee67c3cc674f3c7df3619d1d9941.png",
  tag: "/8321355891a8a575f035c362894f3bd2281dbc34.png",
  hand: "/e5e166fc8d2d38138b18decee02a39e3524aeaaf.png",
  star: "/9fef9e72b783aefbcbb079dd0cad3c2d1d2896d5.png",
}

const players = [
  "/34401653753550da64baa8faaff5e25aae4fe8f4.png",
  "/3279719c11352d5050f371d6946698edbfe4834e.png",
  "/98b50bde8a094813f2eca3263846268723361a13.png",
  "/3b2b9cc9ae1c305a085d180b4fc32ee4147d0c13.png",
  "/9f6df729514f9e5bf3c5deb3ffef3a76104f3c79.png",
]

export function DashboardWelcome({
  composer,
  onPrompt,
  onBook,
}: {
  composer: ReactNode
  onPrompt: (text: string) => void
  onBook: (courtId: string) => void
}) {
  const t = useTranslations("AiDashboard")
  const locale = useLocale()
  const { courts, venuePins, userLoc } = useData()
  const { bookings } = useSession()
  const [mapSelectedId, setMapSelectedId] = useState<string | null>(null)
  const mapCourts = courts.filter(hasCoordinates)
  const mapVenues = venuePins.filter(hasCoordinates)
  const upcoming = bookings
    .filter((booking) => booking.status === "confirmed" || booking.status === "pending")
    .sort((a, b) => (a.dayKey ?? "").localeCompare(b.dayKey ?? ""))
    .slice(0, 4)

  const actions = [
    { key: "badmintonNearMe", icon: MapPin },
    { key: "bookTomorrow", icon: Clock3 },
    { key: "sameLevelPlayers", icon: Users },
    { key: "quickMatch", icon: Zap },
  ] as const
  const recent = [
    { key: "booking", avatar: players[0] },
    { key: "players", avatar: players[2] },
    { key: "summary", avatar: players[1] },
  ] as const

  return (
    <div className="shuttio-home text-[#173bc8]">
      <section className="relative isolate overflow-hidden bg-black pb-9 text-white sm:pb-11">
        <div className="absolute inset-0 bg-[url('/e42e9841354b4ff0e4b8f1da29efc7bcb5b0b2c8.png')] bg-[length:100%_100%] bg-center bg-no-repeat opacity-85" aria-hidden />
        <div className="relative mx-auto flex max-w-6xl flex-col items-center px-5 pt-14 sm:pt-20">
          <Image src={art.left} alt="" width={240} height={90} className="absolute left-1 top-12 w-36 -rotate-6 sm:left-5 sm:w-48" />
          <Image src={art.tag} alt="" width={190} height={82} className="absolute right-0 top-44 w-28 rotate-6 sm:right-4 sm:w-40" />
          <Image src={art.hand} alt="" width={95} height={105} className="absolute right-[20%] top-3 hidden w-16 rotate-12 sm:block" />
          <Image src={art.star} alt="" width={75} height={75} className="absolute left-[8%] top-44 hidden w-12 sm:block" />
          <Image src={art.right} alt="" width={210} height={205} className="absolute -right-2 top-[265px] z-10 w-28 sm:top-[290px] sm:w-40" />
          <div className="z-10 mt-7 w-full max-w-[750px] rounded-full bg-[#a5ff12] p-1.5 text-[#1c3cdb] shadow-[8px_8px_0_#e959bd] sm:mt-10">
            <div className="flex items-center gap-3 pl-3 sm:pl-7">
              <div className="min-w-0 flex-1 [&_[data-flip-id]]:!bg-transparent [&_[data-flip-id]]:!ring-0 [&_[data-flip-id]]:!p-0 [&_textarea]:!text-[#1c3cdb] [&_textarea]:placeholder:!text-[#1c3cdb] [&_svg]:!text-[#1c3cdb] [&_kbd]:hidden [&_button]:!bg-[#1c3cdb] [&_button_svg]:!text-white">{composer}</div>
              <Search className="mr-3 hidden size-7 shrink-0 sm:block" aria-hidden />
            </div>
          </div>
          <div className="relative z-10 mt-10 flex h-32 w-full max-w-2xl items-end justify-center gap-3 sm:h-44 sm:gap-7">
            {players.map((src, i) => (
              <Image key={src} src={src} alt="" width={145} height={175} className={`h-auto w-[18%] max-w-[112px] object-contain ${i % 2 ? "-rotate-6" : "rotate-3"}`} />
            ))}
          </div>
          <h2 className="relative z-10 mt-14 text-xl font-black tracking-wide sm:mt-16">{t("quickActionsLabel")}</h2>
          <div className="relative z-10 mt-4 grid w-full max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
            {actions.map(({ key, icon: Icon }) => (
              <button key={key} type="button" onClick={() => onPrompt(t(`prompts.${key}`))} className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#2046ed] px-3 text-xs font-semibold text-white transition-transform hover:-translate-y-1 sm:text-sm">
                <Icon className="size-5 shrink-0" />{t(`promptsShort.${key}`)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="relative mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <Image src={art.star} alt="" width={70} height={70} className="absolute left-0 top-28 hidden w-14 -rotate-12 lg:block" />
        <Image src={art.star} alt="" width={70} height={70} className="absolute right-0 bottom-8 hidden w-14 rotate-12 lg:block" />
        <h2 className="text-center text-2xl font-black tracking-wide">{t("recentChats")}</h2>
        <div className="mx-auto mt-8 max-w-[720px] space-y-4">
          {recent.map(({ key, avatar }) => (
            <button key={key} type="button" onClick={() => onPrompt(t(`recent.${key}.desc`))} className="flex w-full items-center gap-4 rounded-full bg-[#a5ff12] p-2 text-left text-[#173bc8] transition-transform hover:translate-x-1">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white"><Image src={avatar} alt="" width={36} height={36} className="size-9 object-contain" /></span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold sm:text-base">{t(`recent.${key}.title`)}</span>
              <span className="hidden text-xs sm:block">{t(`recent.${key}.time`)}</span>
              <ArrowRight className="mr-4 size-4 shrink-0" />
            </button>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="rounded-[36px] border-2 border-[#2046ed] px-5 py-8 sm:px-10">
          <div className="flex items-center justify-between gap-4 border-b-2 border-[#2046ed] pb-5">
            <h2 className="text-xl font-black sm:text-2xl">{t("upcomingBookings")}</h2>
            <Link href="/app/bookings" className="shrink-0 text-xs font-bold hover:underline">{t("viewAll")} →</Link>
          </div>
          {upcoming.length ? (
            <div className="grid gap-6 py-8 md:grid-cols-2">
              {upcoming.map((booking) => {
                const date = new Date(`${booking.dayKey}T00:00:00`)
                return <Link key={booking.id} href="/app/bookings" className="flex items-center gap-4 rounded-xl p-2 transition-colors hover:bg-[#eff2ff]">
                  <span className="flex size-20 shrink-0 flex-col items-center justify-center rounded-lg bg-[#2046ed] text-white"><span className="text-xs">{new Intl.DateTimeFormat(locale, { month: "short" }).format(date)}</span><strong className="text-3xl text-[#a5ff12]">{date.getDate()}</strong></span>
                  <span className="min-w-0 text-[#111]"><strong className="block truncate text-base">{booking.time}</strong><span className="block truncate text-sm">{booking.venue}</span><span className="mt-1 block text-xs text-[#2046ed]">{t("playersCount", { count: booking.withPlayers.length + 1 })}</span></span>
                  <span className="ml-auto hidden shrink-0 rounded-full bg-[#a5ff12] px-2 py-1 text-[10px] font-bold text-[#173bc8] sm:block">{t(`status.${booking.status}`)}</span>
                </Link>
              })}
            </div>
          ) : <p className="py-10 text-center text-sm text-[#52619d]">Chưa có lịch đặt sắp tới. Chọn một sân để bắt đầu chơi!</p>}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20">
        <h2 className="mb-8 text-center text-2xl font-black">Các sân gần bạn</h2>
        <div className="relative h-72 overflow-hidden rounded-[30px] bg-[#202328] text-white sm:h-96">
          <CourtMap
            courts={mapCourts}
            venues={mapVenues}
            selectedId={mapSelectedId}
            onSelect={setMapSelectedId}
            userLoc={userLoc}
          />
          <Link href="/app/play" className="absolute right-4 bottom-4 z-10 rounded-full bg-[#a5ff12] px-4 py-2 text-xs font-bold text-[#173bc8]">Xem bản đồ →</Link>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {courts.slice(0, 4).map((court) => (
            <article key={court.id} className="overflow-hidden rounded-[28px] bg-[#2046ed] text-white">
              <div className="h-36 bg-[url('/hero-court.jpg')] bg-cover bg-center opacity-90" />
              <div className="p-4"><div className="flex items-start justify-between gap-2"><h3 className="line-clamp-1 font-bold">{court.name}</h3><span className="flex items-center gap-1 text-xs"><Star className="size-3 fill-[#a5ff12] text-[#a5ff12]" />{court.rating}</span></div>
                <p className="mt-2 flex items-center gap-1 text-xs text-white/80"><MapPin className="size-3" />{court.ward} · {court.distanceKm?.toFixed(1) ?? "—"} km</p>
                <div className="mt-5 flex items-center justify-between gap-2"><strong>{formatVnd(court.pricePerHour)}<span className="text-xs font-normal">/giờ</span></strong><button type="button" onClick={() => onBook(court.id)} className="rounded-full bg-[#a5ff12] px-3 py-2 text-xs font-bold text-[#173bc8] hover:bg-white">Đặt sân ngay</button></div>
              </div>
            </article>
          ))}
        </div>
        <div className="mt-8 text-center"><Link href="/app/play" className="inline-flex rounded-full bg-[#a5ff12] px-7 py-3 text-sm font-bold text-[#173bc8]">Xem thêm</Link></div>
      </section>
    </div>
  )
}
