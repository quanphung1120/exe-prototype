// Hardcoded venue-workspace records — the operator surface's source of truth,
// served by the API. Like the player data, every value is static/deterministic
// so the web app's server and client renders stay in sync.
//
// AI-generated *content* (the monitor's insights) carries its own { en, vi }
// strings here instead of living in the i18n message files — it reads more like
// data than UI chrome, and keeps the provider, the floating dock and the
// Monitor view reading one source of truth.

import type {
  ChannelMixPoint,
  PeakHourPoint,
  Reservation,
  RevenuePoint,
  SportMixPoint,
  Venue,
  VenueCourt,
  VenueCustomer,
  VenueInsight,
  VenueSeed,
  VenueStats,
} from "../shared/index.js"

export const VENUE: Venue = {
  id: "v1",
  name: "Shuttle Republic",
  initials: "SR",
  district: "Quận Cầu Giấy",
  city: "Hà Nội",
  sports: ["badminton", "pickleball"],
  openFrom: "06:00",
  openTo: "22:00",
  rating: 4.8,
  reviews: 1240,
  manager: { name: "Lê Quang", initials: "LQ" },
  now: "18:00",
  lat: 21.0333,
  lng: 105.7908,
}

export const VENUE_COURTS: VenueCourt[] = [
  {
    id: "vc1",
    name: "Sân 1",
    sport: "badminton",
    surface: "Sàn gỗ lò xo",
    state: "in-play",
    until: "19:30",
    occupant: "Nhóm cầu lông",
    utilToday: 86,
    pricePerHour: 360000,
  },
  {
    id: "vc2",
    name: "Sân 2",
    sport: "badminton",
    surface: "Sàn gỗ lò xo",
    state: "available",
    utilToday: 64,
    pricePerHour: 360000,
  },
  {
    id: "vc3",
    name: "Sân 3",
    sport: "badminton",
    surface: "Sàn gỗ lò xo",
    state: "upcoming",
    until: "19:00",
    occupant: "Trần Huy +3",
    utilToday: 78,
    pricePerHour: 360000,
  },
  {
    id: "vc4",
    name: "Sân 4",
    sport: "badminton",
    surface: "Sàn gỗ lò xo",
    state: "maintenance",
    note: "Phủ lại mặt sàn",
    utilToday: 0,
    pricePerHour: 360000,
  },
  {
    id: "vc5",
    name: "Sân 5",
    sport: "pickleball",
    surface: "Acrylic đệm",
    state: "in-play",
    until: "18:45",
    occupant: "Lê Lan +2",
    utilToday: 71,
    pricePerHour: 240000,
  },
  {
    id: "vc6",
    name: "Sân 6",
    sport: "pickleball",
    surface: "Acrylic đệm",
    state: "available",
    utilToday: 52,
    pricePerHour: 240000,
  },
]

export const VENUE_STATS: VenueStats = {
  occupancy: 78,
  occupancyDelta: 6,
  revenueToday: 8640000,
  revenueDelta: 12,
  bookingsToday: 34,
  bookingsDelta: 4,
  noShowRate: 7,
  noShowDelta: -2,
  newCustomers: 5,
  newCustomersDelta: 2,
  utilization: 71,
}

export const RESERVATIONS: Reservation[] = [
  {
    id: "rv1",
    customer: { name: "Nguyễn Bảo", initials: "NB" },
    sport: "badminton",
    courtId: "vc2",
    court: "Sân 2",
    day: { en: "Today", vi: "Hôm nay" },
    time: "19:00 – 20:00",
    party: 4,
    source: "app",
    status: "pending",
    price: 360000,
    noShowRisk: 14,
    isRegular: false,
  },
  {
    id: "rv2",
    customer: { name: "Trịnh Long", initials: "TL" },
    sport: "pickleball",
    courtId: "vc6",
    court: "Sân 6",
    day: { en: "Today", vi: "Hôm nay" },
    time: "20:00 – 21:00",
    party: 4,
    source: "app",
    status: "pending",
    price: 240000,
    noShowRisk: 62,
    isRegular: false,
  },
  {
    id: "rv3",
    customer: { name: "Trần Huy", initials: "TH" },
    sport: "badminton",
    courtId: "vc3",
    court: "Sân 3",
    day: { en: "Today", vi: "Hôm nay" },
    time: "19:00 – 20:30",
    party: 4,
    source: "app",
    status: "confirmed",
    price: 540000,
    noShowRisk: 8,
    isRegular: true,
  },
  {
    id: "rv4",
    customer: { name: "Lê Lan", initials: "LL" },
    sport: "pickleball",
    courtId: "vc5",
    court: "Sân 5",
    day: { en: "Today", vi: "Hôm nay" },
    time: "17:45 – 18:45",
    party: 3,
    source: "app",
    status: "checked-in",
    price: 240000,
    noShowRisk: 5,
    isRegular: true,
  },
  {
    id: "rv5",
    customer: { name: "Phạm Quân", initials: "PQ" },
    sport: "badminton",
    courtId: "vc1",
    court: "Sân 1",
    day: { en: "Today", vi: "Hôm nay" },
    time: "18:00 – 19:30",
    party: 2,
    source: "app",
    status: "checked-in",
    price: 540000,
    noShowRisk: 11,
    isRegular: true,
  },
  {
    id: "rv6",
    customer: { name: "Đỗ Anh", initials: "ĐA" },
    sport: "pickleball",
    courtId: "vc6",
    court: "Sân 6",
    day: { en: "Tomorrow", vi: "Ngày mai" },
    time: "07:00 – 08:00",
    party: 4,
    source: "walk-in",
    status: "confirmed",
    price: 240000,
    noShowRisk: 9,
    isRegular: false,
  },
  {
    id: "rv7",
    customer: { name: "Vũ Hà", initials: "VH" },
    sport: "badminton",
    courtId: "vc2",
    court: "Sân 2",
    day: { en: "Tomorrow", vi: "Ngày mai" },
    time: "19:00 – 20:00",
    party: 4,
    source: "app",
    status: "confirmed",
    price: 360000,
    noShowRisk: 21,
    isRegular: true,
  },
  {
    id: "rv8",
    customer: { name: "Bùi Khang", initials: "BK" },
    sport: "badminton",
    courtId: "vc1",
    court: "Sân 1",
    day: { en: "Mon, 16 Jun", vi: "Th 2, 16/6" },
    time: "20:00 – 21:00",
    party: 2,
    source: "app",
    status: "completed",
    price: 360000,
    noShowRisk: 0,
    isRegular: true,
  },
  {
    id: "rv9",
    customer: { name: "Ngô Sơn", initials: "NS" },
    sport: "pickleball",
    courtId: "vc5",
    court: "Sân 5",
    day: { en: "Sun, 15 Jun", vi: "CN, 15/6" },
    time: "18:00 – 19:00",
    party: 4,
    source: "app",
    status: "no-show",
    price: 240000,
    noShowRisk: 71,
    isRegular: false,
  },
  {
    id: "rv10",
    customer: { name: "Đặng Thu", initials: "ĐT" },
    sport: "badminton",
    courtId: "vc3",
    court: "Sân 3",
    day: { en: "Sun, 15 Jun", vi: "CN, 15/6" },
    time: "09:00 – 10:00",
    party: 2,
    source: "app",
    status: "completed",
    price: 360000,
    noShowRisk: 0,
    isRegular: true,
  },
]

export const VENUE_CUSTOMERS: VenueCustomer[] = [
  {
    id: "0901234501",
    name: "Trần Huy",
    initials: "TH",
    favoriteSport: "badminton",
    visits: 64,
    lastVisit: { en: "2 days ago", vi: "2 ngày trước" },
    ltv: 21800000,
    noShowRate: 2,
    tier: "vip",
    trend: 12,
  },
  {
    id: "0901234502",
    name: "Lê Lan",
    initials: "LL",
    favoriteSport: "pickleball",
    visits: 48,
    lastVisit: { en: "Today", vi: "Hôm nay" },
    ltv: 14200000,
    noShowRate: 4,
    tier: "vip",
    trend: 8,
  },
  {
    id: "0901234503",
    name: "Phạm Quân",
    initials: "PQ",
    favoriteSport: "badminton",
    visits: 31,
    lastVisit: { en: "Today", vi: "Hôm nay" },
    ltv: 9600000,
    noShowRate: 6,
    tier: "regular",
    trend: 5,
  },
  {
    id: "0901234504",
    name: "Vũ Hà",
    initials: "VH",
    favoriteSport: "badminton",
    visits: 27,
    lastVisit: { en: "3 weeks ago", vi: "3 tuần trước" },
    ltv: 8100000,
    noShowRate: 18,
    tier: "at-risk",
    trend: -34,
  },
  {
    id: "0901234505",
    name: "Bùi Khang",
    initials: "BK",
    favoriteSport: "badminton",
    visits: 22,
    lastVisit: { en: "5 days ago", vi: "5 ngày trước" },
    ltv: 6900000,
    noShowRate: 9,
    tier: "regular",
    trend: 3,
  },
  {
    id: "0901234506",
    name: "Đỗ Anh",
    initials: "ĐA",
    favoriteSport: "pickleball",
    visits: 14,
    lastVisit: { en: "1 week ago", vi: "1 tuần trước" },
    ltv: 3300000,
    noShowRate: 7,
    tier: "regular",
    trend: 19,
  },
  {
    id: "0901234507",
    name: "Ngô Sơn",
    initials: "NS",
    favoriteSport: "pickleball",
    visits: 5,
    lastVisit: { en: "Yesterday", vi: "Hôm qua" },
    ltv: 1100000,
    noShowRate: 22,
    tier: "new",
    trend: 0,
  },
  {
    id: "0901234508",
    name: "Đặng Thu",
    initials: "ĐT",
    favoriteSport: "badminton",
    visits: 3,
    lastVisit: { en: "4 days ago", vi: "4 ngày trước" },
    ltv: 980000,
    noShowRate: 0,
    tier: "new",
    trend: 0,
  },
]

/** Last 7 days of revenue (oldest → today), VND. */
export const REVENUE_SERIES: RevenuePoint[] = [
  { label: { en: "Mon", vi: "T2" }, value: 6200000 },
  { label: { en: "Tue", vi: "T3" }, value: 5800000 },
  { label: { en: "Wed", vi: "T4" }, value: 6900000 },
  { label: { en: "Thu", vi: "T5" }, value: 7400000 },
  { label: { en: "Fri", vi: "T6" }, value: 9100000 },
  { label: { en: "Sat", vi: "T7" }, value: 11200000 },
  { label: { en: "Sun", vi: "CN" }, value: 8640000 },
]

export const SPORT_MIX: SportMixPoint[] = [
  { sport: "badminton", bookings: 412, pct: 68 },
  { sport: "pickleball", bookings: 194, pct: 32 },
]

export const CHANNEL_MIX: ChannelMixPoint[] = [
  { source: "app", pct: 82 },
  { source: "walk-in", pct: 18 },
]

/** Busiest hours of the week, for the peak-demand callout. */
export const PEAK_HOURS: PeakHourPoint[] = [
  { hour: "19:00", util: 96 },
  { hour: "20:00", util: 91 },
  { hour: "18:00", util: 88 },
  { hour: "21:00", util: 74 },
]

export const VENUE_INSIGHTS: VenueInsight[] = [
  {
    id: "in1",
    kind: "underutilized",
    severity: "warn",
    title: {
      en: "Court 5 & 6 sit idle 14:00–16:00",
      vi: "Sân 5 & 6 trống khung 14:00–16:00",
    },
    detail: {
      en: "Weekday afternoons on the pickleball courts run at 22% utilization — well below the 71% house average.",
      vi: "Chiều các ngày trong tuần ở sân pickleball chỉ đạt 22% công suất — thấp hơn nhiều so với mức trung bình 71%.",
    },
    reasoning: {
      en: [
        "Compared the last 30 afternoons against the venue average",
        "Found pickleball 14:00–16:00 booked 22% of the time",
        "Demand model: a 15% off-peak price would lift fill to ~58%",
        "Net revenue still rises despite the lower rate",
      ],
      vi: [
        "So sánh 30 buổi chiều gần nhất với mức trung bình của sân",
        "Phát hiện pickleball 14:00–16:00 chỉ kín 22% thời lượng",
        "Mô hình cầu: giảm 15% giờ thấp điểm nâng tỷ lệ lấp đầy ~58%",
        "Doanh thu thuần vẫn tăng dù đơn giá thấp hơn",
      ],
    },
    action: {
      en: "Apply 15% off-peak rate",
      vi: "Áp giá giờ thấp điểm -15%",
    },
    impact: { en: "+1.2M / week", vi: "+1,2Tr / tuần" },
    target: { en: "Court 5–6 · 14:00–16:00", vi: "Sân 5–6 · 14:00–16:00" },
    priceMove: { direction: "down", pct: 15, from: 240000, to: 204000 },
    effect: { metric: "revenueToday", delta: 280000 },
  },
  {
    id: "in2",
    kind: "revenue",
    severity: "warn",
    title: {
      en: "Regulars pre-pay single hours — sell them a pack",
      vi: "Khách quen trả trước từng giờ lẻ — hãy bán gói",
    },
    detail: {
      en: "Your top regulars pre-pay 4+ separate hours a month. A pre-paid 10-hour pack locks that revenue in up front and keeps them booking here.",
      vi: "Nhóm khách quen hàng đầu trả trước hơn 4 giờ lẻ mỗi tháng. Gói 10 giờ trả trước giúp chốt doanh thu ngay từ đầu và giữ chân họ.",
    },
    reasoning: {
      en: [
        "Top 12 regulars average 4.6 pre-paid hours each month",
        "They book one hour at a time — no commitment beyond the slot",
        "A 10-hour pack at 10% off still nets more than single bookings",
        "Auto-offering the pack at checkout converts ~1 in 4 regulars",
      ],
      vi: [
        "12 khách quen hàng đầu trung bình 4,6 giờ trả trước mỗi tháng",
        "Họ đặt từng giờ một — không cam kết ngoài lượt đó",
        "Gói 10 giờ giảm 10% vẫn thu về nhiều hơn đặt lẻ",
        "Tự động mời mua gói khi thanh toán chuyển đổi ~1/4 khách quen",
      ],
    },
    action: {
      en: "Launch 10-hour pre-paid pack",
      vi: "Mở gói 10 giờ trả trước",
    },
    impact: { en: "+2.3M / month", vi: "+2,3Tr / tháng" },
    target: {
      en: "Regulars · pre-paid packs",
      vi: "Khách quen · gói trả trước",
    },
    effect: { metric: "revenueToday", delta: 300000 },
  },
  {
    id: "in3",
    kind: "demand-surge",
    severity: "info",
    title: {
      en: "Saturday evening is selling out fast",
      vi: "Tối thứ Bảy đang kín chỗ rất nhanh",
    },
    detail: {
      en: "19:00–21:00 Saturday is 96% booked five days out. Prime slots are clearing 2 days earlier than usual.",
      vi: "Khung 19:00–21:00 thứ Bảy đã kín 96% dù còn 5 ngày. Giờ vàng hết sớm hơn thường lệ 2 ngày.",
    },
    reasoning: {
      en: [
        "Saturday 19:00–21:00 fill is 96% with 5 days lead",
        "Booking pace is 2 days ahead of the trailing month",
        "Willingness-to-pay supports a +10% prime-time rate",
        "Opening a waitlist captures the overflow demand",
      ],
      vi: [
        "Tỷ lệ lấp đầy thứ Bảy 19:00–21:00 đạt 96% khi còn 5 ngày",
        "Tốc độ đặt nhanh hơn 2 ngày so với tháng trước",
        "Mức sẵn lòng chi trả cho phép tăng giá giờ vàng +10%",
        "Mở danh sách chờ để giữ lượng cầu vượt mức",
      ],
    },
    action: {
      en: "Raise Sat prime rate +10%",
      vi: "Tăng giá giờ vàng T7 +10%",
    },
    impact: { en: "+1.8M / week", vi: "+1,8Tr / tuần" },
    target: { en: "Court 1 · Sat 19:00–21:00", vi: "Sân 1 · T7 19:00–21:00" },
    priceMove: { direction: "up", pct: 10, from: 360000, to: 396000 },
    effect: { metric: "revenueToday", delta: 360000 },
  },
  {
    id: "in4",
    kind: "maintenance",
    severity: "warn",
    title: {
      en: "Court 1 flooring nearing service interval",
      vi: "Mặt sân 1 sắp đến hạn bảo trì",
    },
    detail: {
      en: "Court 1 has logged 1,180 play-hours since the last re-coat — usage models flag grip loss within ~2 weeks.",
      vi: "Sân 1 đã chạy 1.180 giờ chơi kể từ lần phủ gần nhất — mô hình dự báo giảm độ bám trong khoảng 2 tuần.",
    },
    reasoning: {
      en: [
        "Court 1 is the most-played court at 86% today",
        "1,180 play-hours since the last surface treatment",
        "Wear curve predicts grip complaints in ~14 days",
        "Booking a low-demand Tuesday avoids lost revenue",
      ],
      vi: [
        "Sân 1 được chơi nhiều nhất, hôm nay 86%",
        "1.180 giờ chơi kể từ lần xử lý mặt sân gần nhất",
        "Đường cong hao mòn dự báo than phiền độ bám trong ~14 ngày",
        "Đặt lịch vào thứ Ba ít khách để tránh mất doanh thu",
      ],
    },
    action: {
      en: "Schedule Tue maintenance",
      vi: "Lên lịch bảo trì thứ Ba",
    },
    impact: { en: "Avoid downtime", vi: "Tránh gián đoạn" },
    target: { en: "Court 1", vi: "Sân 1" },
  },
  {
    id: "in5",
    kind: "retention",
    severity: "warn",
    title: {
      en: "Vũ Hà hasn't booked in 3 weeks",
      vi: "Vũ Hà chưa đặt sân 3 tuần",
    },
    detail: {
      en: "A regular (27 visits) has gone quiet — visit cadence dropped 34%. Churn model puts win-back odds highest this week.",
      vi: "Một khách quen (27 lượt) đã im ắng — tần suất giảm 34%. Mô hình rời bỏ cho thấy tuần này khả năng kéo lại cao nhất.",
    },
    reasoning: {
      en: [
        "27-visit regular, normally weekly",
        "Last visit was 3 weeks ago — 34% below cadence",
        "Churn model: win-back odds peak in the next 7 days",
        "A free off-peak hour historically re-activates 1 in 3",
      ],
      vi: [
        "Khách quen 27 lượt, thường tuần nào cũng chơi",
        "Lần cuối cách đây 3 tuần — thấp hơn nhịp 34%",
        "Mô hình rời bỏ: khả năng kéo lại đỉnh trong 7 ngày tới",
        "Tặng 1 giờ thấp điểm thường kích hoạt lại 1/3 khách",
      ],
    },
    action: {
      en: "Send win-back offer",
      vi: "Gửi ưu đãi kéo lại",
    },
    impact: { en: "Save 8.1M LTV", vi: "Giữ 8,1Tr giá trị" },
    target: { en: "Vũ Hà · at-risk", vi: "Vũ Hà · nguy cơ rời" },
  },
  {
    id: "in6",
    kind: "weather",
    severity: "info",
    title: {
      en: "Rain forecast Thursday — promote indoor courts",
      vi: "Dự báo mưa thứ Năm — đẩy sân trong nhà",
    },
    detail: {
      en: "85% chance of rain Thu evening. Indoor demand historically jumps 28% — a timely push fills the badminton hall.",
      vi: "85% khả năng mưa tối thứ Năm. Cầu sân trong nhà thường tăng 28% — đẩy thông báo đúng lúc sẽ lấp đầy nhà thi đấu cầu lông.",
    },
    reasoning: {
      en: [
        "Forecast: 85% rain Thursday 17:00–22:00",
        "On past rainy evenings indoor bookings rose 28%",
        "Thu evening still has 9 open badminton slots",
        "A push notification converts ~15% of nearby players",
      ],
      vi: [
        "Dự báo: 85% mưa thứ Năm 17:00–22:00",
        "Những tối mưa trước, đặt sân trong nhà tăng 28%",
        "Tối thứ Năm còn 9 lượt cầu lông trống",
        "Thông báo đẩy chuyển đổi ~15% người chơi lân cận",
      ],
    },
    action: {
      en: "Push indoor promo",
      vi: "Đẩy ưu đãi sân trong nhà",
    },
    impact: { en: "+900K Thu", vi: "+900K thứ Năm" },
    target: { en: "Badminton hall · Thu", vi: "Nhà cầu lông · T5" },
    effect: { metric: "occupancy", delta: 2 },
  },
]

// ── Additional venues ────────────────────────────────────────────────────────
// The operator runs more than one center. These two are seeded alongside the
// flagship above; they start with a few courts but no booking history yet, so
// the operational views render their empty states until activity accrues.

/** Zeroed KPIs for a freshly onboarded venue (no history yet). */
export const EMPTY_STATS: VenueStats = {
  occupancy: 0,
  occupancyDelta: 0,
  revenueToday: 0,
  revenueDelta: 0,
  bookingsToday: 0,
  bookingsDelta: 0,
  noShowRate: 0,
  noShowDelta: 0,
  newCustomers: 0,
  newCustomersDelta: 0,
  utilization: 0,
}

export const VENUE_2: Venue = {
  id: "v2",
  name: "Smash Arena",
  initials: "SA",
  district: "Quận Đống Đa",
  city: "Hà Nội",
  sports: ["badminton"],
  openFrom: "06:00",
  openTo: "23:00",
  rating: 4.6,
  reviews: 532,
  manager: { name: "Phạm Vy", initials: "PV" },
  now: "18:00",
  lat: 21.0122,
  lng: 105.8267,
}

export const VENUE_2_COURTS: VenueCourt[] = [
  {
    id: "v2c1",
    name: "Sân 1",
    sport: "badminton",
    surface: "Sàn gỗ lò xo",
    state: "available",
    utilToday: 0,
    pricePerHour: 320000,
  },
  {
    id: "v2c2",
    name: "Sân 2",
    sport: "badminton",
    surface: "Sàn gỗ lò xo",
    state: "available",
    utilToday: 0,
    pricePerHour: 320000,
  },
  {
    id: "v2c3",
    name: "Sân 3",
    sport: "badminton",
    surface: "Sàn gỗ lò xo",
    state: "available",
    utilToday: 0,
    pricePerHour: 420000,
  },
]

export const VENUE_3: Venue = {
  id: "v3",
  name: "Ace Pavilion",
  initials: "AP",
  district: "Quận Tây Hồ",
  city: "Hà Nội",
  sports: ["pickleball"],
  openFrom: "05:30",
  openTo: "22:30",
  rating: 4.7,
  reviews: 318,
  manager: { name: "Hoàng Minh", initials: "HM" },
  now: "18:00",
  lat: 21.0703,
  lng: 105.8235,
}

export const VENUE_3_COURTS: VenueCourt[] = [
  {
    id: "v3c1",
    name: "Sân 1",
    sport: "pickleball",
    surface: "Acrylic đệm",
    state: "available",
    utilToday: 0,
    pricePerHour: 220000,
  },
  {
    id: "v3c2",
    name: "Sân 2",
    sport: "pickleball",
    surface: "Acrylic đệm",
    state: "available",
    utilToday: 0,
    pricePerHour: 400000,
  },
]

/** A venue's full operator bundle minus its profile (the mutable store nests this). */
export type VenueOps = Omit<VenueSeed, "info">

export interface VenueRecord {
  info: Venue
  ops: VenueOps
}

/** A zeroed 7-day revenue week (oldest → today) for a venue with no history. */
const EMPTY_REVENUE_SERIES: RevenuePoint[] = [
  { label: { en: "Mon", vi: "T2" }, value: 0 },
  { label: { en: "Tue", vi: "T3" }, value: 0 },
  { label: { en: "Wed", vi: "T4" }, value: 0 },
  { label: { en: "Thu", vi: "T5" }, value: 0 },
  { label: { en: "Fri", vi: "T6" }, value: 0 },
  { label: { en: "Sat", vi: "T7" }, value: 0 },
  { label: { en: "Sun", vi: "CN" }, value: 0 },
]

/** The standard booking channels at 0% — the analytics/Copilot panels index [0]. */
const EMPTY_CHANNEL_MIX: ChannelMixPoint[] = [
  { source: "app", pct: 0 },
  { source: "walk-in", pct: 0 },
]

/** The usual prime-time hours at 0% util — the panels index [0]. */
const EMPTY_PEAK_HOURS: PeakHourPoint[] = [
  { hour: "19:00", util: 0 },
  { hour: "20:00", util: 0 },
  { hour: "18:00", util: 0 },
  { hour: "21:00", util: 0 },
]

/**
 * Operator bundle for a venue with no activity yet. The chart series are
 * structurally valid but zeroed so the dashboards render an honest "no activity"
 * state instead of crashing when they index `[length-1]` / `[0]` into them
 * (the operator views assume flagship-shaped data). Reservations / customers /
 * insights stay genuinely empty — those views have real empty-state UI. New
 * objects per call so the in-memory store never shares mutable rows across venues.
 */
export function emptyOps(courts: VenueCourt[] = []): VenueOps {
  const sports = [...new Set(courts.map((c) => c.sport))]
  return {
    stats: { ...EMPTY_STATS },
    courts,
    reservations: [],
    refundQueue: [],
    customers: [],
    revenueSeries: EMPTY_REVENUE_SERIES.map((p) => ({ ...p })),
    sportMix: sports.map((sport) => ({ sport, bookings: 0, pct: 0 })),
    channelMix: EMPTY_CHANNEL_MIX.map((p) => ({ ...p })),
    peakHours: EMPTY_PEAK_HOURS.map((p) => ({ ...p })),
    insights: [],
  }
}

/** Seed list of every venue the operator manages — the store initializes from this. */
export const INITIAL_VENUES: VenueRecord[] = [
  {
    info: VENUE,
    ops: {
      stats: VENUE_STATS,
      courts: VENUE_COURTS,
      reservations: RESERVATIONS,
      // Seed venue docs carry no manual refunds — real ones only ever
      // appear via `composeBundle`'s live `listRefundQueue` projection,
      // same as `reservations` above (see the comment on `composeBundle`).
      refundQueue: [],
      customers: VENUE_CUSTOMERS,
      revenueSeries: REVENUE_SERIES,
      sportMix: SPORT_MIX,
      channelMix: CHANNEL_MIX,
      peakHours: PEAK_HOURS,
      insights: VENUE_INSIGHTS,
    },
  },
  { info: VENUE_2, ops: emptyOps(VENUE_2_COURTS) },
  { info: VENUE_3, ops: emptyOps(VENUE_3_COURTS) },
]
