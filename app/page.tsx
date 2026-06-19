import {
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  MapPin,
  MessageSquare,
  MessagesSquare,
  Search,
  Shield,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react"

import { Faq, type FaqItem } from "@/components/faq"
import { Logo } from "@/components/logo"
import { Reveal } from "@/components/reveal"
import { SiteHeader } from "@/components/site-header"
import { WaitlistForm } from "@/components/waitlist-form"

const SPORTS = ["Tennis", "Padel", "Pickleball", "Cầu lông", "Bóng quần"]

const TRUST_LOGOS = [
  "Ace Tennis Club",
  "Padel Republic",
  "Smash Pickleball",
  "Baseline Athletic",
  "Courtside Collective",
  "Net Gain Sports",
  "Rally Point Club",
  "Topspin Center",
]

const PLAYER_FEATURES = [
  {
    icon: Sparkles,
    title: "Trợ lý đặt sân AI",
    body: "Chỉ cần nói điều Quý khách muốn — “padel tối nay sau 7 giờ, gần đây, người chơi cùng trình độ.” Trợ lý sẽ lo phần còn lại: sân, giờ và người chơi.",
    featured: true,
  },
  {
    icon: Users,
    title: "Ghép theo trình độ",
    body: "Được ghép với những người chơi cùng trình độ để mỗi trận đều cân sức — không còn cảnh một chiều.",
  },
  {
    icon: CalendarCheck,
    title: "Đặt sân tức thì",
    body: "Tình trạng sân trống theo thời gian thực tại các địa điểm gần Quý khách. Giữ chỗ chỉ trong vài giây, không cần gọi điện.",
  },
  {
    icon: MapPin,
    title: "Sân gần Quý khách",
    body: "Các khung giờ trống theo thời gian thực tại những câu lạc bộ quanh Quý khách, xếp theo khoảng cách, giá và mặt sân.",
  },
  {
    icon: MessagesSquare,
    title: "Trò chuyện & phối hợp",
    body: "Tính năng trò chuyện, nhắc lịch và đặt sân chung tích hợp sẵn giúp cả nhóm luôn nắm chung thông tin.",
  },
]

const STEPS = [
  {
    icon: MessageSquare,
    title: "Nói cho AI biết Quý khách muốn gì",
    body: "Gõ như đang nhắn tin cho bạn bè: “Pickleball đánh đôi, sáng thứ Bảy, trình độ trung cấp.”",
  },
  {
    icon: Search,
    title: "AI tìm sân + người chơi",
    body: "Trợ lý quét các địa điểm gần đó, khung giờ trống và người chơi cùng trình độ — rồi đề xuất lựa chọn phù hợp nhất.",
  },
  {
    icon: CheckCircle2,
    title: "Xác nhận và chơi",
    body: "Một chạm để đặt sân và thông báo cho mọi người. Chỉ việc đến và chơi.",
  },
]

const VENUE_BENEFITS = [
  {
    icon: TrendingUp,
    title: "Lấp đầy sân giờ thấp điểm",
    body: "AI khéo léo hướng người chơi gần đó đến những khung giờ trống, biến giờ vắng khách thành lượt đặt sân.",
  },
  {
    icon: Users,
    title: "Ghép trận tự động",
    body: "Những trận còn thiếu người được tự động lấp đầy bằng người chơi đúng trình độ.",
  },
  {
    icon: BarChart3,
    title: "Phân tích công suất sân",
    body: "Xem tỷ lệ sử dụng, nhu cầu cao điểm và xu hướng doanh thu của từng sân theo thời gian thực.",
  },
  {
    icon: Shield,
    title: "Đặt sân hạn chế vắng mặt",
    body: "Xác nhận thông minh và danh sách chờ giúp giảm tình trạng vắng mặt và giữ cho sân luôn sinh lời.",
  },
]

const STATS = [
  { value: "3.200+", label: "Người chơi trong danh sách chờ" },
  { value: "40+", label: "Câu lạc bộ đối tác đang tham gia" },
  { value: "<60 giây", label: "Từ yêu cầu đến đặt xong" },
  { value: "5", label: "Môn thể thao vợt được hỗ trợ" },
]

const TESTIMONIALS = [
  {
    quote:
      "Trước đây tôi tốn thời gian nhắn tin trong nhóm chat hơn cả thời gian chơi. Giờ tôi chỉ cần nói với ứng dụng và nó lo luôn cả sân lẫn người chơi.",
    name: "Maya R.",
    role: "Padel · 3.5",
    initials: "MR",
  },
  {
    quote:
      "Khả năng ghép trình độ chính xác đến đáng kinh ngạc. Trận nào cũng cân sức — điều chưa từng có với những trận đánh ngẫu hứng trước đây.",
    name: "Daniel K.",
    role: "Tennis · 4.0",
    initials: "DK",
  },
  {
    quote:
      "Là một câu lạc bộ, khung 2–5 giờ chiều các ngày trong tuần của chúng tôi từng vắng tanh. Giờ tính năng ghép trận âm thầm lấp đầy chúng. Mọi thứ tự chạy trong nền.",
    name: "Priya S.",
    role: "Quản lý câu lạc bộ",
    initials: "PS",
  },
]

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "SportMatch AI hỗ trợ những môn thể thao nào?",
    answer:
      "Chúng tôi ra mắt với nhóm các môn thể thao vợt: tennis, padel, pickleball, cầu lông và bóng quần. Các môn khác sẽ được bổ sung dựa trên nơi cộng đồng của chúng tôi chơi nhiều nhất.",
  },
  {
    question: "Trợ lý AI thực sự đặt sân như thế nào?",
    answer:
      "Quý khách mô tả điều mình muốn bằng ngôn ngữ tự nhiên. Trợ lý kiểm tra tình trạng sân trống theo thời gian thực tại các địa điểm đối tác, tìm người chơi gần trình độ của Quý khách và đề xuất một kế hoạch hoàn chỉnh — sân, giờ và người chơi. Quý khách xác nhận chỉ bằng một chạm.",
  },
  {
    question: "Tính năng ghép người chơi hoạt động ra sao?",
    answer:
      "Mỗi người chơi có một mức đánh giá trình độ và mức này tăng dần khi Quý khách chơi. Các trận được gợi ý trong một khoảng trình độ sát nhau và khoảng cách do Quý khách đặt ra, để các trận luôn cân sức và thuận tiện.",
  },
  {
    question: "Ứng dụng đã hoạt động chưa?",
    answer:
      "Chúng tôi đang trong giai đoạn truy cập sớm và mở rộng dần theo từng thành phố. Hãy đăng ký danh sách chờ và chúng tôi sẽ gửi email cho Quý khách ngay khi các sân trong khu vực của Quý khách sẵn sàng.",
  },
  {
    question: "Tôi điều hành một câu lạc bộ — làm sao để được đưa lên hệ thống?",
    answer:
      "Hãy yêu cầu một buổi demo dành cho đối tác bên dưới. Chúng tôi sẽ kết nối lịch đặt sân của Quý khách, hiển thị các sân trống tới người chơi gần đó và giúp Quý khách lấp đầy các khung giờ thấp điểm — không cần thay mới toàn bộ hệ thống.",
  },
]

const containerCx = "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8"

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 inline-flex items-center gap-2 text-sm font-semibold tracking-wide text-primary uppercase">
      <span className="h-px w-6 bg-primary/50" aria-hidden="true" />
      {children}
    </p>
  )
}

export default function Page() {
  return (
    <>
      <SiteHeader />
      <main id="top">
        {/* ── Hero ─────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          {/* Decorative background */}
          <div
            className="pointer-events-none absolute -top-32 -left-24 size-[28rem] rounded-full bg-primary/20 blur-[120px]"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -top-20 right-0 size-[26rem] rounded-full bg-lime/20 blur-[120px]"
            aria-hidden="true"
          />

          <div
            className={`${containerCx} relative py-16 sm:py-24 lg:py-28`}
          >
            <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
              <h1 className="mt-6 font-heading text-5xl leading-[1.1] font-bold tracking-tight uppercase sm:text-6xl lg:text-7xl">
                Tìm sân.
                <span className="block bg-gradient-to-r from-primary to-lime bg-clip-text pb-2 text-transparent">
                  Tìm đối thủ phù hợp.
                </span>
              </h1>

              <p className="mt-5 max-w-xl text-lg text-muted-foreground sm:text-xl">
                Trợ lý đặt sân AI của Quý khách cho các môn thể thao vợt. Đặt sân
                tennis, padel, pickleball, cầu lông và bóng quần chỉ trong vài
                giây — và được ghép với những người chơi cùng trình độ.
              </p>

              <div id="waitlist" className="mt-8 w-full max-w-xl scroll-mt-24">
                <WaitlistForm audience="player" inputId="hero-email" />
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
                <span className="text-sm text-muted-foreground">Dành cho:</span>
                {SPORTS.map((sport) => (
                  <span
                    key={sport}
                    className="rounded-full border border-border bg-card px-3 py-1 text-sm font-medium text-foreground"
                  >
                    {sport}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Trust marquee ────────────────────────────────── */}
        <section className="border-y border-border bg-muted/40 py-8">
          <div className={containerCx}>
            <p className="text-center text-sm font-medium text-muted-foreground">
              Được các câu lạc bộ và người chơi trong giới thể thao vợt tin dùng
            </p>
          </div>
          <div
            className="group/marquee relative mt-6 flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_8%,#000_92%,transparent)]"
            aria-hidden="true"
          >
            <div className="flex w-max animate-marquee items-center gap-x-12 pr-12">
              {[...TRUST_LOGOS, ...TRUST_LOGOS].map((name, i) => (
                <span
                  key={i}
                  className="font-heading text-xl font-semibold whitespace-nowrap text-muted-foreground/70"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── Player features ──────────────────────────────── */}
        <section id="features" className="scroll-mt-20 py-20 sm:py-28">
          <div className={containerCx}>
            <Reveal className="max-w-2xl">
              <Eyebrow>Dành cho người chơi</Eyebrow>
              <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
                Bớt sắp xếp. Chơi nhiều hơn.
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Mọi thứ Quý khách cần để ra sân và vào một trận đấu hay — không
                còn cảnh nhóm chat hỗn loạn.
              </p>
            </Reveal>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PLAYER_FEATURES.map((feature, i) => (
                <Reveal
                  key={feature.title}
                  delayMs={i * 60}
                  className={feature.featured ? "sm:col-span-2" : ""}
                >
                  <article
                    className={`group flex h-full flex-col rounded-3xl border p-6 transition-colors ${
                      feature.featured
                        ? "border-primary/30 bg-gradient-to-br from-primary/[0.07] to-lime/[0.07]"
                        : "border-border bg-card hover:border-primary/40"
                    }`}
                  >
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <feature.icon className="size-6" />
                    </span>
                    <h3 className="mt-5 font-heading text-xl font-bold">
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-muted-foreground">{feature.body}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────── */}
        <section
          id="how-it-works"
          className="scroll-mt-20 bg-muted/40 py-20 sm:py-28"
        >
          <div className={containerCx}>
            <Reveal className="mx-auto max-w-2xl text-center">
              <Eyebrow>Cách hoạt động</Eyebrow>
              <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
                Đặt sân và ghép trận chỉ với ba chạm.
              </h2>
            </Reveal>

            <div className="relative mt-14 grid gap-8 md:grid-cols-3">
              {/* connector line on desktop */}
              <div
                className="pointer-events-none absolute top-7 right-[16.66%] left-[16.66%] hidden border-t-2 border-dashed border-border md:block"
                aria-hidden="true"
              />
              {STEPS.map((step, i) => (
                <Reveal key={step.title} delayMs={i * 100}>
                  <div className="relative flex flex-col items-center text-center">
                    <span className="relative z-10 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
                      <step.icon className="size-6" />
                      <span className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-lime font-mono text-xs font-bold text-lime-foreground">
                        {i + 1}
                      </span>
                    </span>
                    <h3 className="mt-5 font-heading text-xl font-bold">
                      {step.title}
                    </h3>
                    <p className="mt-2 max-w-xs text-muted-foreground">
                      {step.body}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Stats ────────────────────────────────────────── */}
        <section className="py-20 sm:py-24">
          <div className={containerCx}>
            <Reveal>
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-border bg-border lg:grid-cols-4">
                {STATS.map((stat) => (
                  <div
                    key={stat.label}
                    className="flex flex-col items-center gap-1 bg-card px-6 py-10 text-center"
                  >
                    <dt className="sr-only">{stat.label}</dt>
                    <dd className="font-heading text-4xl font-bold tracking-tight text-primary tabular-nums sm:text-5xl">
                      {stat.value}
                    </dd>
                    <p className="text-sm font-medium text-muted-foreground">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
        </section>

        {/* ── For venues (B2B dark band) ───────────────────── */}
        <section id="venues" className="scroll-mt-20 py-12 sm:py-16">
          <div className={containerCx}>
            <div className="relative overflow-hidden rounded-[2rem] bg-zinc-950 px-6 py-14 text-zinc-50 sm:px-12 sm:py-20">
              <div
                className="pointer-events-none absolute inset-0 bg-court-grid opacity-40"
                aria-hidden="true"
              />
              <div
                className="pointer-events-none absolute -right-20 -bottom-24 size-96 rounded-full bg-emerald-500/20 blur-[120px]"
                aria-hidden="true"
              />
              <div className="relative grid gap-12 lg:grid-cols-2 lg:items-center">
                <div>
                  <p className="mb-3 inline-flex items-center gap-2 text-sm font-semibold tracking-wide text-lime-300 uppercase">
                    <span
                      className="h-px w-6 bg-lime-300/60"
                      aria-hidden="true"
                    />
                    Dành cho địa điểm &amp; câu lạc bộ
                  </p>
                  <h2 className="font-heading text-4xl font-bold tracking-tight sm:text-5xl">
                    Lấp đầy mọi sân.
                    <br />
                    Để AI lo phần còn lại.
                  </h2>
                  <p className="mt-4 max-w-lg text-lg text-zinc-300">
                    Kết nối lịch đặt sân của Quý khách và SportMatch AI sẽ âm
                    thầm đưa người chơi vào những sân trống — ghép trận, sắp lịch
                    và nhắc nhở để Quý khách không phải bận tâm.
                  </p>

                  <dl className="mt-8 grid gap-x-6 gap-y-6 sm:grid-cols-2">
                    {VENUE_BENEFITS.map((benefit) => (
                      <div key={benefit.title} className="flex gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                          <benefit.icon className="size-5" />
                        </span>
                        <div>
                          <dt className="font-heading text-lg font-bold">
                            {benefit.title}
                          </dt>
                          <dd className="mt-0.5 text-sm text-zinc-400">
                            {benefit.body}
                          </dd>
                        </div>
                      </div>
                    ))}
                  </dl>
                </div>

                {/* Mock occupancy dashboard + venue waitlist */}
                <div className="lg:pl-6">
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-heading text-lg font-bold">
                        Công suất sân
                      </p>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                        <TrendingUp className="size-3.5" />
                        +32% giờ thấp điểm
                      </span>
                    </div>
                    <div className="mt-6 flex items-end justify-between gap-2">
                      {[40, 55, 38, 72, 61, 88, 76].map((h, i) => (
                        <div
                          key={i}
                          className="flex flex-1 flex-col items-center gap-2"
                        >
                          <div className="flex h-28 w-full items-end">
                            <div
                              className="w-full rounded-t-md bg-gradient-to-t from-emerald-500 to-lime-300"
                              style={{ height: `${h}%` }}
                            />
                          </div>
                          <span className="font-mono text-[10px] text-zinc-500">
                            {["T2", "T3", "T4", "T5", "T6", "T7", "CN"][i]}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-6 grid grid-cols-3 gap-3 border-t border-white/10 pt-5 text-center">
                      <div>
                        <p className="font-heading text-2xl font-bold tabular-nums">
                          86%
                        </p>
                        <p className="text-xs text-zinc-500">Tỷ lệ sử dụng</p>
                      </div>
                      <div>
                        <p className="font-heading text-2xl font-bold tabular-nums">
                          128
                        </p>
                        <p className="text-xs text-zinc-500">Lượt đặt / tuần</p>
                      </div>
                      <div>
                        <p className="font-heading text-2xl font-bold tabular-nums">
                          4.9
                        </p>
                        <p className="text-xs text-zinc-500">Đánh giá người chơi</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5">
                    <WaitlistForm audience="venue" inputId="venue-email" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Testimonials ─────────────────────────────────── */}
        <section className="py-20 sm:py-28">
          <div className={containerCx}>
            <Reveal className="mx-auto max-w-2xl text-center">
              <Eyebrow>Được người dùng thử yêu thích</Eyebrow>
              <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
                Người chơi đã bị cuốn hút.
              </h2>
            </Reveal>

            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {TESTIMONIALS.map((t, i) => (
                <Reveal key={t.name} delayMs={i * 80}>
                  <figure className="flex h-full flex-col rounded-3xl border border-border bg-card p-6">
                    <div
                      className="flex gap-0.5 text-primary"
                      aria-label="Đánh giá 5 trên 5 sao"
                    >
                      {Array.from({ length: 5 }).map((_, s) => (
                        <Star
                          key={s}
                          className="size-4 fill-current"
                          aria-hidden="true"
                        />
                      ))}
                    </div>
                    <blockquote className="mt-4 flex-1 text-foreground">
                      “{t.quote}”
                    </blockquote>
                    <figcaption className="mt-5 flex items-center gap-3 border-t border-border pt-4">
                      <span className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-lime text-sm font-bold text-primary-foreground">
                        {t.initials}
                      </span>
                      <div>
                        <p className="text-sm font-semibold">{t.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.role}
                        </p>
                      </div>
                    </figcaption>
                  </figure>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────── */}
        <section id="faq" className="scroll-mt-20 bg-muted/40 py-20 sm:py-28">
          <div className={`${containerCx} max-w-3xl`}>
            <Reveal className="text-center">
              <Eyebrow>Câu hỏi thường gặp</Eyebrow>
              <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
                Giải đáp thắc mắc.
              </h2>
            </Reveal>
            <Reveal className="mt-10">
              <Faq items={FAQ_ITEMS} />
            </Reveal>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────── */}
        <section className="py-20 sm:py-28">
          <div className={containerCx}>
            <div className="relative overflow-hidden rounded-[2rem] border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-lime/10 px-6 py-16 text-center sm:px-12 sm:py-20">
              <div
                className="pointer-events-none absolute inset-0 bg-court-grid"
                aria-hidden="true"
              />
              <div className="relative mx-auto max-w-2xl">
                <h2 className="mt-5 font-heading text-4xl font-bold tracking-tight uppercase sm:text-6xl">
                  Hãy là người đầu tiên ra sân.
                </h2>
                <p className="mt-4 text-lg text-muted-foreground">
                  Đăng ký danh sách chờ và chúng tôi sẽ gửi email lời mời ngay
                  khi SportMatch AI ra mắt tại thành phố của Quý khách.
                </p>
                <div className="mx-auto mt-8 max-w-xl text-left">
                  <WaitlistForm audience="player" inputId="cta-email" />
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="border-t border-border bg-card">
        <div className={`${containerCx} py-14`}>
          <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <div className="max-w-xs">
              <Logo />
              <p className="mt-4 text-sm text-muted-foreground">
                Trợ lý đặt sân AI cho các môn thể thao vợt. Tìm sân, tìm đối thủ
                và cứ thế chơi thôi.
              </p>
              <div className="mt-5 flex gap-4 text-sm font-medium text-muted-foreground">
                <a
                  href="#waitlist"
                  className="transition-colors hover:text-foreground"
                >
                  X / Twitter
                </a>
                <a
                  href="#waitlist"
                  className="transition-colors hover:text-foreground"
                >
                  Instagram
                </a>
                <a
                  href="#waitlist"
                  className="transition-colors hover:text-foreground"
                >
                  LinkedIn
                </a>
              </div>
            </div>

            <FooterColumn
              title="Sản phẩm"
              links={[
                { label: "Tính năng", href: "#features" },
                { label: "Cách hoạt động", href: "#how-it-works" },
                { label: "Câu hỏi thường gặp", href: "#faq" },
                { label: "Đăng ký danh sách chờ", href: "#waitlist" },
              ]}
            />
            <FooterColumn
              title="Dành cho địa điểm"
              links={[
                { label: "Chương trình đối tác", href: "#venues" },
                { label: "Yêu cầu demo", href: "#venues" },
                { label: "Phân tích", href: "#venues" },
              ]}
            />
            <FooterColumn
              title="Công ty"
              links={[
                { label: "Giới thiệu", href: "#top" },
                { label: "Bảo mật", href: "#top" },
                { label: "Điều khoản", href: "#top" },
              ]}
            />
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row">
            <p>© 2026 SportMatch AI. Dành cho người chơi.</p>
            <p className="font-mono text-xs">
              Nhấn <kbd className="rounded bg-muted px-1.5 py-0.5">L</kbd> để đổi
              giao diện
            </p>
          </div>
        </div>
      </footer>
    </>
  )
}

function FooterColumn({
  title,
  links,
}: {
  title: string
  links: { label: string; href: string }[]
}) {
  return (
    <div>
      <h3 className="font-heading text-sm font-bold tracking-wide uppercase">
        {title}
      </h3>
      <ul className="mt-4 space-y-3">
        {links.map((link) => (
          <li key={link.label}>
            <a
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
