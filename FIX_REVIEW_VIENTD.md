# FIX_REVIEW_VIENTD — Market-Readiness Plan

Ngày: 2026-07-13. Đầu vào: bộ tài liệu `VienTD-Review/` (8 flows), đối chiếu lại với source hiện tại (bao gồm thay đổi chưa commit: account-type onboarding), và 16 quyết định nghiệp vụ đã được chốt cùng product owner.

## 1. Kết quả validate VienTD-Review (docs vs source, 2026-07-13)

### Đã lỗi thời — code đã đi trước tài liệu

- **Booking ↔ Reservation đã cross-write hai chiều**: `sessions.service.ts` `syncReservation()` tạo venue reservation (`source:"app"`, `status:"pending"`) khi player book; `applyReservationStatus()` map quyết định của venue ngược về player session (kèm notification tiếng Việt, cờ `refunded` giả lập). Link bằng `sessionId`/`reservationId`/`venueId`.
- **Court catalog đã hợp nhất**: `courts.service.ts` delegate sang `VenuesService.catalogCourts()`; catalog `c*` cũ trong `api/src/data/player.ts` là dead code. Id sống là `vc*`; reservation lưu `courtId` + tên denormalized (không còn chỉ name-string).
- **`TODAY_ISO` không còn tồn tại** — nhưng day keys vẫn tĩnh (`today/tomorrow/sat/sun/mon` trong `shared/config.ts`).
- **App booking → `pending` → venue duyệt** đã là hành vi hiện tại (`venues.service.ts:744`).
- Công việc chưa commit: onboarding chọn loại tài khoản Player/Venue/Both (`api/src/features/account/`, `web/features/onboarding/`, redirect gate ở dashboard layout) — đã implement đầy đủ theo TODO.md, có test.

### Gap xác nhận đúng như docs

- Payment giả lập hoàn toàn: QR trang trí, thu 5% cọc (`session.tsx:1828`), decline giả 20% lần đầu.
- **Không có scheduler nào** → không có SLA pending, không auto-complete, không auto no-show, hold 20 phút chỉ ở client.
- API sessions là "dumb store": `PUT /sessions/:id` không validate gì (overlap/capacity/hosted-cap/state machine đều ở client). Rule server duy nhất là overlap ở tầng venue reservation.
- Endpoint status reservation không có state machine (status nào → status nào cũng được); decline reason chỉ bắt buộc ở web UI, optional ở API.
- Block court = toast (`schedule.tsx:1129`); chỉ có cờ `maintenance` theo cả court.
- Venue/court hard delete; không chặn khi còn reservation tương lai; reservation mồ côi là hành vi được chấp nhận trong comment.
- Chưa enforce: court name unique, court sport ∈ venue.sports, openFrom < openTo.
- Walk-in không sinh CRM customer; visits/LTV/tier không bao giờ recompute. Analytics: chỉ 4 KPI derive từ reservation thật (revenueToday, utilization, noShowRate, newCustomers); toàn bộ chart series/insights là seed.
- Stream chat: channel tạo lazy kèm mock players; không remove/archive khi cancel/kick/leave. Notification là client tự sinh; quyết định của venue chỉ tới player khi reload seed.
- Matchmaking giả lập: host approve bằng timer 1.6s, join request giả từ mock players, invite decline ~20% theo hash.

## 2. Quyết định nghiệp vụ đã chốt (2026-07-13)

| # | Rule | Quyết định |
|---|---|---|
| 1 | Booking ≡ Reservation | **Một record duy nhất** — hội tụ thành một entity chuẩn |
| 2 | Booking thành công | **Pending → venue duyệt** (trả tiền trước, duyệt sau) |
| 3 | Số tiền thanh toán | **100% pre-paid** (bỏ mô hình cọc 5%) |
| 4 | Mô hình thời gian | **ISO datetime thật, Asia/Ho_Chi_Minh**, backend là nguồn chuẩn |
| 5 | SLA duyệt | **30 phút → auto-confirm** (im lặng = đồng ý; venue chỉ được decline trong cửa sổ) |
| 6 | Cancel/refund | **≥24h: hoàn 100% · <24h: 50% · sau giờ bắt đầu/no-show: 0** |
| 7 | Completion | **Venue check-in; auto-complete sau giờ kết thúc; no-show đánh được sau 30 phút không check-in** |
| 8 | Self-overlap | **Hard block, enforce server-side** |
| 9 | Cổng thanh toán | **SePay / VietQR** qua `sepay-pg-node` (IPN confirm, có sandbox; refund thủ công — không có refund API) |
| 10 | Mock/giả lập | **Gỡ dần** — demo liquidity gắn nhãn rõ, mock không bao giờ tham gia giao dịch thật |
| 11 | Xoá venue/court | **Archive; chặn khi còn reservation pending/confirmed tương lai** (phải cancel+refund trước) |
| 12 | Block court | **Entity thật: start/end + reason bắt buộc; chặn booking & walk-in; không đè lên reservation confirmed** |
| 13 | Room chat | **Tạo khi tạo room; chỉ member đã approve; kick/leave → remove; cancel → freeze/archive** |
| 14 | Notification | **Collection transactional lưu server** (approve/decline/cancel+refund/no-show/join/invite); client poll; push để sau |
| 15 | Walk-in vs pending | **Pending giữ slot**; operator phải decline (reason + auto-refund) trước khi thêm walk-in |
| 16 | Mô hình Room | **Lớp phối hợp pre-booking** (projection của PlaySession, như hiện tại) |

**Default hợp lý áp dụng luôn (quick-wins trong docs, không cần hỏi):** decline reason bắt buộc ở API; court name unique trong venue; court sport ∈ venue.sports; openFrom < openTo; walk-in tạo/merge CRM customer theo phone; visits/LTV recompute từ reservation completed; endpoint status có state machine hợp lệ.

## 3. Roadmap triển khai

Thứ tự theo dependency chain của README (08 → 02 → 05 → 03 → 06 → 07 → 04): xương sống trước, tiền sau, vận hành venue, rồi lớp social/phái sinh. Mỗi phase ship độc lập được. **Mọi thay đổi shared types phải sửa CẢ HAI bản `api/src/shared/` và `web/lib/shared/` trong cùng commit.** DTO dùng class-validator (không zod); lỗi throw HttpException qua `AllExceptionsFilter {error}`; config qua `ConfigService`; copy VN-first vào cả hai catalog `web/messages/{en,vi}.json`.

### Phase 0 — Quick wins (không phụ thuộc gì, ship trước) - DONE

1. **State machine reservation**: thêm `RESERVATION_TRANSITIONS` + `canTransitionReservation()` vào cả hai `shared/helpers.ts` (pending→confirmed/cancelled; confirmed→checked-in/cancelled/no-show; checked-in→completed/cancelled; completed/cancelled/no-show terminal). Enforce trong `venues.service.ts updateReservationStatus` bên trong `withVersionRetry` hiện có → `ConflictException` khi transition sai; PUT cùng status = no-op idempotent. Web: ẩn action không hợp lệ trong `reservations.tsx` bằng cùng bảng.
2. **Decline reason bắt buộc ở API**: `ReservationStatusDto` → `@ValidateIf(o => o.status === "cancelled") @IsString() @Length(3,200) reason`. Web `schedule.tsx cancelEvent` thêm dialog nhập reason — extract dialog decline sẵn có trong `reservations.tsx` (~line 297) thành `ReasonDialog` trong `venue/shared.tsx`, dùng chung.
3. **Integrity CRUD**: enforce court name unique trong venue, court sport ∈ `venue.info.sports` (trong `addCourt`/`updateCourt`), `openFrom < openTo`.
4. Mở rộng `decisionNotification` cho no-show + cancel-kèm-refund (copy VN).

### Phase 1 — Mô hình thời gian thật (nền tảng; blast radius lớn nhất — land riêng) - DONE

- Lưu **ISO string offset cố định +07:00** (VN-only, không DST): `startAt`/`endAt` + denormalized `dateKey: "YYYY-MM-DD"` + `start: "HH:MM"` để các helper `toMinutes`/`rangesOverlap`/`slotRange` giữ nguyên.
- Shared: thay `BOOKING_DAYS`/`VENUE_DAYS` tĩnh trong `shared/config.ts` bằng `bookingDays(anchorIso)` cửa sổ 7 ngày trượt (label Hôm nay/Ngày mai/thứ); thêm `vnNowIso`, `addDaysIso`, `combineDateTime`, `isoToHHMM` vào `shared/helpers.ts`; `PlaySession.dayKey` thành ISO date.
- Seed payload thêm `serverNow: string` (tính server-side trong `seed.service.ts`); `DataProvider` expose làm anchor render (repo cấm `Date.now()` trong render). `web/features/booking/calendar.ts` bỏ anchor tĩnh, nhận param.
- Cập nhật consumer: day chips `book.tsx`, `bookings.tsx`, `calendar-ui.tsx`, `venue/schedule.tsx`, `venue/reservations.tsx`, `play/session.tsx` (`EMPTY_DRAFT.dayKey`), `QuickJoinFilters.day`.
- **Chấp nhận reseed phá huỷ** (prototype): drop collection `venues` + `sessions`; seed-on-first-read convert demo reservation sang date thật theo anchor.

### Phase 2 — Collection `bookings` chuẩn (quyết định #1: một record)

- Feature mới `api/src/features/bookings/` (module/controller/service/schema/dto). `booking.schema.ts`: `{bookingId, venueId, courtId, courtName, sport, source: "app"|"walk-in", userId?, sessionId?, customer{name,initials,phone?}, startAt, endAt, dateKey, start, durationMin, price, status, paymentStatus: awaiting|paid|refunded|partial_refund|none, holdExpiresAt?, confirmDeadlineAt?, checkedInAt?, declineReason?, cancelReason?, refund?{pct,amount,at,ref}, statusHistory[]}`. Index: `{venueId,courtId,dateKey}`, `{userId,startAt}`, `{sessionId}`, `{status,holdExpiresAt}`, `{status,confirmDeadlineAt}`.
- Status model: `awaiting_payment → (IPN) pending → (duyệt | timeout 30 phút) confirmed → checked-in → completed`, cộng `expired` (hết hạn link/hold), `cancelled` (decline kèm reason bắt buộc = hoàn 100%; player cancel theo policy 24h), `no-show`. Một bảng `BOOKING_TRANSITIONS` chung (thay thế bảng Phase 0) dùng cho cả API guard + trạng thái nút trên web.
- `ops.reservations` embedded trong venue doc trở thành **projection lúc đọc**: `activeBundle` compose `Reservation[]` từ booking docs — shape UI venue không đổi. Walk-in cũng là booking doc (`status:"confirmed"`, `paymentStatus:"none"`).
- Rewire: walk-in/reschedule/status trong `venues.service.ts` delegate sang `BookingsService`; xoá `createOrSyncAppReservation`/`overlapsReservation` (logic chuyển sang bookings, check+insert chạy trong **Mongoose transaction** — verify Atlas tier; fallback lock doc per-court). `sessions.service.ts` bỏ `syncReservation`/`applyReservationStatus`; session derive status/hold/refunded từ booking đã link; vòng `forwardRef` Sessions↔Venues tan.

### Phase 3 — Endpoint hẹp, validate server-side (quyết định #8)

- `POST /api/bookings` `{courtId, dateKey, start, durationMin, sessionId?}` → validate opening hours, overlap court, **self-overlap của user (hard block)**, blocks (Phase 6) → tạo `awaiting_payment` với `holdExpiresAt = now+20min` (hold server thay client `HOLD_MS`).
- `POST /api/bookings/:id/cancel` (check owner; áp ≥24h 100% / <24h 50% / sau giờ 0), `/decision` (venue: approve/decline+reason), `/check-in`, `/no-show` (reject trừ khi `now ≥ startAt+30min` và chưa check-in), `GET /api/bookings/mine`.
- `PUT /api/sessions/:id` hạ cấp thành coordination roster/room: server strip các field thuộc booking, validate capacity ≤ 8, roster ≤ capacity, MAX_HOSTED_ROOMS = 3 → `ConflictException`.
- Web: `pay`/`confirmBooking`/`cancelBooking` trong `session.tsx` thành server action awaited (`web/features/play/booking-actions.ts`); check conflict client giữ làm pre-check UX, server là chuẩn (409 → toast conflict sẵn có).

### Phase 4 — SePay Payment Gateway / VietQR (quyết định #3, #9)

Cổng đã chốt: **SePay** qua SDK `sepay-pg-node` (thay PayOS — PayOS không có refund API lẫn sandbox; SePay cũng không có refund API nhưng **có sandbox thật** `pgapi-sandbox.sepay.vn`).

- Env (zod `env.validation.ts`): `SEPAY_ENV` (`sandbox|production`), `SEPAY_MERCHANT_ID`, `SEPAY_SECRET_KEY`, `SEPAY_RETURN_URL`; thêm `sepay-pg-node` (`SePayPgClient({env, merchant_id, secret_key})`).
- Feature mới `api/src/features/payments/` với `payment.schema.ts` (`invoiceNumber` unique = idempotency key), `sepay.client.ts` injectable (fake được trong test).
- `POST /api/payments/checkout {bookingId}` → dùng `client.checkout.initOneTimePaymentFields()` (100% giá) trả về form fields đã ký HMAC SHA256 + `initCheckoutUrl()`; web submit form ẩn sang trang checkout SePay (QR/thẻ). `POST /api/payments/ipn` — **`@Public()` + verify chữ ký HMAC theo docs IPN của SePay**, idempotent `findOneAndUpdate` (replay = no-op); khi paid: booking → `pending`, `confirmDeadlineAt = now+30min`, notify venue. `GET /api/payments/by-booking/:id` cho client poll (kết hợp `client.order.retrieve()` để đối soát).
- Hết hạn hold: `client.order.cancel()` (đơn QR chưa trả) khi sweeper set `expired`.
- **Refund = THỦ CÔNG ở phase này (đã verify 2026-07-13):** SePay không có refund API — chỉ có `voidTransaction()` (huỷ giao dịch thẻ chưa settle) và `cancel()` (huỷ đơn QR chưa trả), không hoàn được tiền đã thanh toán. Vì vậy: hệ thống chỉ **tính** số tiền hoàn theo policy 24h/50%/0 + decline = 100%, ghi `refund.status:"manual"` vào booking, đưa vào **hàng đợi hoàn tiền thủ công** cho operator (chuyển khoản tay), và copy cho player nói rõ "hoàn tiền trong vòng 24–48h làm việc". Không hứa hoàn tiền tức thì ở bất kỳ đâu trong UI.
- Web `book.tsx`: thay `FakeQr` + timer `PAY_MS` + decline giả 20% bằng redirect/form sang checkout SePay thật + poll status; thêm copy chính sách refund (VN-first) vào cả hai catalog.
- Dev/test: dùng **sandbox SePay** (env `sandbox`, mô phỏng giao dịch + VietQR không đụng tiền thật) + tunnel (ngrok/cloudflared) cho IPN — ghi vào README. Test tự động dùng `sepay.client` fake.

### Phase 5 — Scheduler (quyết định #5, #7) - DONE

- `@nestjs/schedule`, `ScheduleModule.forRoot()` trong `app.module.ts`; `bookings.sweeper.ts` `@Cron(EVERY_MINUTE)`, mỗi rule là guarded transition idempotent (filter kèm status hiện tại):
  - `awaiting_payment && holdExpiresAt ≤ now` → `expired` (+ `client.order.cancel()` bên SePay)
  - `pending && paid && confirmDeadlineAt ≤ now` → `confirmed` (im lặng = đồng ý) + notification
  - `checked-in && endAt ≤ now` → `completed`
- No-show vẫn là action thủ công của venue (endpoint gate rule 30 phút). Expiry request/invite (2h/6h) giữ client-side (không dính tiền, room vẫn là coordination layer theo quyết định #16).
- **Ghi chú triển khai (2026-07-20):** Phase 2–4 (collection `bookings` chuẩn, endpoint hẹp, SePay checkout/IPN thật) **chưa land** khi Phase 5 này được implement — reservation vẫn là embedded doc trong venue (`ops.reservations`, Phase 0/1). Để sweeper có ý nghĩa ngay trên model hiện tại: mở rộng `Reservation`/`ReservationStatus` (cả hai bản `shared/`) thêm `awaiting_payment`/`expired`, `paymentStatus`, `holdExpiresAt`, `confirmDeadlineAt`; `createOrSyncAppReservation` stamp `paymentStatus:"paid"` + `confirmDeadlineAt` ngay khi tạo (checkout vẫn giả lập client-side trước đó) nên rule `pending→confirmed` chạy thật trên mọi app booking. Rule `awaiting_payment→expired` + `SepayClient` (`api/src/features/payments/sepay.client.ts`, hiện là stub log-only — thay bằng SDK thật khi Phase 4 land) được implement và test đầy đủ nhưng **chưa có endpoint nào tạo reservation ở trạng thái `awaiting_payment`** (đó là việc của Phase 3's `POST /api/bookings` hold-then-checkout flow) — khi Phase 2–4 land, rewire theo collection `bookings` mới và endpoint hold thật; sweeper's `VenuesService.sweepReservations()` là nơi mang logic đó sang (hoặc factor ra `BookingsService` nếu Phase 2 tách collection). `BOOKING_CONFIRM_SLA_MINUTES` (env, default 30) làm SLA configurable cho dev. Test: `api/test/bookings-sweeper.test.ts`, `api/test/venues-service.test.ts`.

### Phase 6 — Venue ops hardening (quyết định #11, #12, #15 + default CRM)

- **Court block (entity thật)**: `CourtBlock {id, courtId, dateKey, start, durationMin, reason: maintenance|internal|vip|break (bắt buộc), note?}` lưu trên venue ops (counter `blockSeq`, đọc `?? []` cho doc cũ); `POST/DELETE /api/venues/blocks[...]`; helper `overlapsBlock` ở cả hai bản shared; enforce trong cả đường tạo booking VÀ walk-in; reject block đè lên booking sống (pending/confirmed/checked-in). Web: nút block toast trong `schedule.tsx` FreeBand → `BlockDialog` thật (select reason, label VN) + action "Mở lại khung giờ" cho owner; overlay block qua `blockDayEvents` trong `venue-data-provider.tsx`.
- **Archive thay delete**: cờ `Venue.archived` / `VenueCourt.archived` sau route DELETE hiện có; guard: còn booking `pending|confirmed` tương lai (dễ với `startAt` thật) → `ConflictException("…cancel và refund trước")`. Archived bị loại khỏi `catalogCourts`, picker walk-in, block mới; `findVenueByCourtId` KHÔNG filter (lịch sử vẫn resolve). Restore qua `updateCourt {archived:false}`. **Flag cho product: venue archived vẫn chiếm slot one-venue-per-owner (unique index `ownerId`) — UI manage cho "Khôi phục" thay vì tạo mới.** Copy UI: "Lưu trữ" thay "Xoá"; 409 → gợi ý link sang màn reservations.
- **Walk-in vs pending**: overlap đã coi pending là blocking (đã verify) — bổ sung UX: toast 409 của walk-in ghi "Khung giờ đang giữ bởi đặt sân qua app — từ chối (kèm lý do, tự hoàn tiền) trước."
- **Walk-in → CRM**: `upsertWalkInCustomer` merge theo phone khi tạo walk-in (stats khởi tạo 0 — completion mới là visit); `visits/ltv/noShowRate/tier` của customer **derive lúc đọc** qua `computeCustomerStats(customers, bookings)` thuần trong `withComputedStats` (không write hook, luôn nhất quán).

### Phase 7 — Notification transactional (quyết định #14)

- Feature mới `api/src/features/notifications/`: schema `{userId(index), notifId(unique dedupe), kind, text(VN-first), href?, read, timestamps}`; `GET /api/notifications`, `PUT …/:id/read`, `PUT …/read-all`. Producer: booking decision/auto-confirm/cancel+refund/no-show (từ BookingsService), join/invite (Phase 9).
- Web `NotificationsProvider`: giữ item demo từ seed làm base; thêm poll ~30s + refetch khi focus/visibility qua `notification-actions.ts` mới, merge theo id, mark-read optimistic; xoá effect merge seed-reload; thời gian tương đối tính client-side từ `createdAt`. Item mới → toast sonner.

### Phase 8 — Vòng đời Stream chat (quyết định #13; SDK v9.x — có addMembers/removeMembers/updatePartial frozen)

- `stream.service.ts`: `createRoomChannel` (chỉ host là member lúc tạo — không mock), `addRoomMember`, `removeRoomMember`, `freezeRoomChannel` (`updatePartial({set:{frozen:true}})` giữ lịch sử, khoá gửi). Controller: `POST /api/stream/rooms`, `POST/DELETE …/members`, `POST …/freeze`; authorize theo `created_by` của channel cho tới khi Phase 9 có room model server chặt hơn.
- Điểm gọi web trong `session.tsx`: tạo room → `createRoomChat`; approve → add member (chỉ user thật); kick/decline/leave → remove member; host cancel → freeze. Venue huỷ booking → hook freeze server-side (try/catch, không được làm fail quyết định). `composer.tsx` disable khi frozen ("Phòng đã kết thúc"). Xoá `ensureRoomChannel` seeding mock ở Phase 9.

### Phase 9 — Gỡ giả lập matchmaking (quyết định #10; phase rủi ro nhất)

- **G1 (độ sạch giao dịch)**: xoá `scheduleHostApproval`, `scheduleJoinRequests`, `scheduleRsvp` + call sites khỏi `session.tsx`; đánh dấu seed `ROOMS`/`MATCH_SUGGESTIONS` `demo: true`; web render badge "Demo", nút Join disabled trên room demo ("Phòng demo — không thể tham gia"); mock không được vào session đã book sân.
- **G2 (room thật cross-user)**: mở rộng collection sessions (index `{data.listed, data.status}`): `GET /api/rooms` (room listed non-demo của mọi user), `POST /api/rooms/:id/requests` (server check capacity + notify host), `PUT …/requests/:userId {decision}` (chỉ host; approve → roster + chat member + notify), `DELETE …/members/me`. `SessionPlayer` thêm `userId?`. Web rewire request/approve/decline/leave sang server action; requester biết kết quả qua poll notification. **Thay đổi ngữ nghĩa trong `SessionProvider` (room đã join derive từ `GET /api/rooms`, không phải session doc của mình) — dành review lớn nhất ở đây; loại room của user khác khỏi seed merge per-user.**

### Phase 10 — Analytics trung thực

- Helper thuần trên booking docs (date thật làm mọi thứ đơn giản): `computeRevenueSeries` (7 ngày thật), `computeSportMix`, `computeChannelMix`, `computePeakHours`, `utilizationHeatmap` thật. `withComputedStats` override cho venue **có owner** (`info.ownerId`); venue demo không owner giữ series hardcode; AI insights vẫn seed → chip "Demo AI" cố định. Tắt filler giả `courtDayEvents` cho venue có owner (empty state trung thực trong `schedule.tsx`).

### Phase 11 — Tài liệu + release checklist

- Cập nhật `VienTD-Review/`: thêm mục "Quyết định đã chốt (2026-07-13)" cho từng doc với 16 quyết định + defaults; đính chính các claim lỗi thời trong README (catalog đã hợp nhất, TODAY_ISO không còn, cross-write đã tồn tại); đánh dấu DONE khi từng phase land.
- Release checklist: document env (`SEPAY_*`), setup tunnel IPN + quy trình test trên sandbox SePay, quy trình reseed, `pnpm build && pnpm lint && pnpm typecheck` cả hai app + `cd api && pnpm test` xanh, commit phần onboarding đang pending trước (đã hoàn chỉnh theo TODO.md).

## 4. Rủi ro chính

1. **Blast radius Phase 1** — day key len lỏi vào wizard, schedule, filter, seed generator; land + verify riêng.
2. **Race overlap sau khi de-embed** — cần Atlas transaction (verify tier) hoặc lock doc per-court.
3. **SePay không có refund API (đã verify 2026-07-13)** — hoàn tiền chắc chắn là thủ công ở phase này (hàng đợi operator + copy 24–48h). Bù lại SePay có sandbox thật nên test end-to-end không tốn tiền thật.
4. **Phase 9 G2** — thay đổi ngữ nghĩa lớn nhất (room chia sẻ giữa user); ship G1 trước.
5. **Venue archived chiếm slot one-venue-per-owner** — UX chỉ restore; flag cho product.

## 5. Verification

- Clerk đang trong Test Mode, bạn có thể dùng theo cách sau để test E2E: Emails: Add +clerk_test to your email prefix (e.g., user+clerk_test@example.com). Phone Numbers: Use any fictional phone number. Verification Code: Always bypasses standard OTPs using 424242.
- Mỗi phase: `cd api && pnpm test` (mở rộng test Node runner: bảng transitions, toán cancel-policy, idempotency sweeper, chữ ký/idempotency IPN với `sepay.client` fake), `pnpm typecheck && pnpm lint` cả hai app.
- End-to-end sau Phase 2–5: `docker compose up --build`, chạy golden path với hai account (player + venue owner): book → trả trên sandbox SePay → IPN → venue thấy pending → approve (và riêng: để SLA 30 phút auto-confirm với interval dev rút ngắn) → check-in → auto-complete; cancel ở mốc >24h và <24h verify refund record; decline verify reason bắt buộc + hoàn 100% + notification tới player qua poll.
- Venue ops: tạo block (reason bắt buộc) → verify cả booking lẫn walk-in 409 trên slot đó; thử archive court còn booking tương lai → bị chặn; walk-in sinh CRM customer; booking completed đẩy `visits/ltv`.
- De-mock: hai account thật chạy flow join/approve, membership chat bám roster, freeze khi cancel.
