# 08. Cross-surface Data Consistency Flow

## Flow mục tiêu

Flow này không phải một màn hình riêng. Nó mô tả cách các thực thể nghiệp vụ nên nhất quán giữa:

- player side
- venue side
- booking
- reservation
- room
- court
- customer
- analytics

## Hiện trạng trong repo

- Player side và venue side vẫn là **hai record riêng** (`PlaySession` phía player, `Reservation`+`VenueCourt` phía venue) — nhưng **không tách biệt cô lập**: đã **cross-write hai chiều** qua `sessionId`/`reservationId`/`venueId` (`syncReservation()`/`applyReservationStatus()` trong `sessions.service.ts`). *(Đính chính 2026-07-13: câu "hai mô hình dữ liệu tách biệt" phía dưới không còn chính xác kể từ trước cả lần review 2026-07-10 — xem `FIX_REVIEW_VIENTD.md` mục 1.)*
- **Court catalog đã hợp nhất**: `courts.service.ts` delegate sang `VenuesService.catalogCourts()`; catalog `c*` cũ là dead code, id sống là `vc*`, reservation lưu `courtId` + tên denormalized. *(Đính chính 2026-07-13: "chưa dùng chung một source of truth" không còn đúng cho court catalog cụ thể — availability logic/reservation rendering thì vẫn còn là hai lớp state khác nhau như mô tả.)*
- Chat, notification, overview, analytics và CRM vẫn đang được dẫn dắt bởi nhiều lớp state khác nhau — claim này **vẫn đúng**, chưa có thay đổi.

## Business rules nên có

### 1. Rule về thực thể chuẩn

- `Booking` và `Reservation` có phải cùng một entity hay không.
- `Room` có phải chỉ là pre-booking coordination layer hay là entity độc lập lâu dài.
- `Court` của player side và `Court` của venue side có phải cùng một catalog.

### 2. Rule về trạng thái chuẩn

- Một thay đổi ở player side có phải sync ngay sang venue side hay không.
- Venue decline reservation thì booking player side đổi sang gì.
- Venue check-in thì player side history/streak có đổi hay không.

### 3. Rule về customer identity

- App user và walk-in customer có thể merge thành một profile không.
- Customer ở venue CRM có phải là projection của booking history hay entity riêng.

### 4. Rule về analytics

- Revenue lấy từ booking confirmed, completed hay paid.
- Utilization lấy từ slot booked hay slot checked-in.
- New customers tính theo account mới hay phone mới.
- No-show rate lấy từ venue action nào.

### 5. Rule về thời gian

- Ngày giờ chuẩn dùng timezone nào.
- `today`, `tomorrow`, `sat`, `sun`, `mon` có còn là key tĩnh hay phải thay bằng canonical date thật. *(Đính chính 2026-07-13: đã chốt và đã LANDED — xem mục "Quyết định đã chốt" bên dưới, quyết định #4.)*
- Booking start/end chuẩn được tính theo backend hay client.

## Ràng buộc nghiệp vụ nên ưu tiên chốt

| Nhóm rule | Nên chốt |
| --- | --- |
| Canonical entities | Booking, reservation, room, court có quan hệ chuẩn ra sao |
| Sync rules | Event nào phải đồng bộ player <-> venue |
| Customer identity | App user và walk-in customer nối với nhau thế nào |
| Analytics source | Revenue, utilization, no-show, LTV lấy từ status nào |
| Time model | Dùng key tĩnh hay date thật có timezone |

## Rủi ro nếu không chốt

- Cùng một court/time có thể hiển thị hai sự thật khác nhau.
- CRM, analytics và streak đều mất độ tin cậy.
- Khi nối database thật, team phải viết migration logic rất phức tạp.

## Quyết định cần xác nhận

1. Booking và reservation có phải cùng một record không.
2. Room chỉ là lớp phối hợp trước booking hay là entity tồn tại độc lập.
3. Court catalog có được hợp nhất giữa player side và venue side không.
4. Revenue/utilization/no-show tính từ status nào.
5. Có cần chuyển toàn bộ sang canonical date-time thật hay chưa.

## Quyết định đã chốt (2026-07-13)

Đây là "xương sống" — cả 16 quyết định nghiệp vụ đều bám vào entity model của doc này (xem `FIX_REVIEW_VIENTD.md` mục 2 cho bảng đầy đủ, mục 3 cho roadmap 08 → 02 → 05 → 03 → 06 → 07 → 04). Trả lời trực tiếp 5 câu hỏi:

1. **Booking và reservation có phải cùng một record không** → **có**, chốt hợp nhất thành collection `bookings` chuẩn duy nhất (quyết định #1), status model `awaiting_payment → pending → confirmed → checked-in → completed` (+ `expired`/`cancelled`/`no-show`). Hiện tại (2026-07-20) vẫn là **hai record cross-write hai chiều**, chưa hợp nhất — roadmap Phase 2.
2. **Room chỉ là lớp phối hợp hay entity độc lập** → **lớp phối hợp pre-booking** (projection của `PlaySession`), không phải entity độc lập lâu dài (quyết định #16) — **xác nhận đúng hành vi hiện tại**, không cần đổi model.
3. **Court catalog có được hợp nhất không** → **có, và đã hợp nhất từ trước khi có quyết định này** — `courts.service.ts` delegate sang `VenuesService.catalogCourts()`, id sống là `vc*`. Không phải việc cần làm, chỉ là đính chính tài liệu (xem "Hiện trạng trong repo" ở trên).
4. **Revenue/utilization/no-show tính từ status nào** → chưa có quyết định số riêng trong 16 mục, nhưng default kèm theo Phase 6 (CRM) áp dụng nguyên tắc chung: **derive lúc đọc từ booking `completed`/`paid`** (không ghi qua write-hook) — `computeRevenueSeries`, `computeSportMix`, `computeChannelMix`, `computePeakHours`, `utilizationHeatmap` là hàm thuần trên booking docs (roadmap Phase 10, venue có owner mới override; venue demo giữ series hardcode). noShowRate là KPI mô tả, không kèm cảnh báo phạt (vì pre-paid nên no-show không phải venue loss — xem `prepaid-only-no-cash` memory).
5. **Có cần chuyển sang canonical date-time thật không** → **có, và đã LANDED** (quyết định #4, **Phase 1 — DONE**): ISO datetime `+07:00` cố định (VN-only, không DST), `startAt`/`endAt` + `dateKey`/`start` denormalized; `bookingDays(anchorIso)`/`venueDays` (cửa sổ 7 ngày trượt) thay `TODAY_ISO` tĩnh; seed payload có `serverNow`, `DataProvider` expose làm render anchor.

**Trạng thái triển khai tổng quan**: quyết định #4/#16 (mục 2, 5 ở trên) **đã DONE**. Quyết định #1 (mục 1) và phần derive analytics (mục 4) **chưa triển khai** — roadmap Phase 2 và Phase 10 tương ứng. Court catalog (mục 3) không cần việc gì thêm.
