# Business Flows

Ngày cập nhật: 2026-07-09

## Mục đích

Bộ tài liệu này mô tả các flow chính trong hệ thống SportMatch và phân tích các business rules nên có cho từng flow.

Các file này dùng để:

- làm đầu vào cho BA/PM refine nghiệp vụ
- giúp dev hiểu rõ flow nào đang chạy theo prototype, flow nào đã có rule tương đối rõ
- chỉ ra các ràng buộc còn thiếu trước khi nối persistence, payment và analytics thật

## Danh sách flow

- [01. Player Matchmaking And Room Flow](./01-player-matchmaking-and-room-flow.md)
- [02. Player Booking And Payment Flow](./02-player-booking-and-payment-flow.md)
- [03. Player Booking Lifecycle Flow](./03-player-booking-lifecycle-flow.md)
- [04. Player Chat And Notification Flow](./04-player-chat-and-notification-flow.md)
- [05. Venue Reservation And Approval Flow](./05-venue-reservation-and-approval-flow.md)
- [06. Venue Walk-in And Court Block Flow](./06-venue-walkin-and-court-block-flow.md)
- [07. Venue Management Flow](./07-venue-management-flow.md)
- [08. Cross-surface Data Consistency Flow](./08-cross-surface-data-consistency-flow.md)

## Thứ tự triển khai đề xuất

Các flow không độc lập — chúng cùng dựa trên một "xương sống" dữ liệu chung, và flow 08 chính là thứ định nghĩa xương sống đó. Nếu fix một flow trước khi chốt entity model ở 08, phần lớn công sẽ phải làm lại khi 08 đáp đất (ví dụ: chốt status booking ở 02 rồi mới phát hiện Booking và Reservation phải là cùng một record). Vì vậy thứ tự giúp **đơn giản hoá tiến độ** là: chốt xương sống trước → làm nửa ghi + nửa đọc trên đó → state machine → cuối cùng là các lớp phái sinh.

Thứ tự đề xuất: **08 → 02 → 05 → 03 → 06 → 07 → 04** (01 đã DONE).

| # | Vai trò | Flow | Vì sao ở đây |
| --- | --- | --- | --- |
| 1 | Nền tảng | 08 Cross-surface consistency | Chốt 5 quyết định gốc **trước khi** đụng bất cứ thứ gì: Booking ≡ Reservation (một record)? Room chỉ là lớp phối hợp trước booking? Hợp nhất court catalog (`c*` ↔ `vc*`)? Dùng date thật thay key tĩnh? Mọi flow bên dưới thừa hưởng các quyết định này. |
| 2 | Đường ghi | 02 Booking & Payment | Đường **tạo** ra record chuẩn. Chốt reservation-hold + payment + self-overlap trên entity đã hợp nhất. |
| 3 | Đường đọc | 05 Venue Reservation & Approval | Bản đối xứng của 02 trên **cùng** record. Câu hỏi lõi ("booking từ app vào pending hay confirmed?") chính là exit state của 02 — làm liền kề để chốt contract một lần và đồng bộ player ↔ venue thành thật. |
| 4 | State machine | 03 Booking Lifecycle | completed/cancelled/no-show, phí huỷ, rebook. `checked-in`/`no-show` hiện chỉ tồn tại phía venue; flow này hoà giải vòng đời hai phía, cần record ở 02+05 đã chốt. |
| 5 | Vận hành venue | 06 Walk-in & Court Block | Walk-in đã chắc; chỉ còn thiếu entity block-court + ưu tiên walk-in vs app booking (phụ thuộc slot model của 05). Chủ yếu là bổ sung. |
| 6 | Quản lý venue | 07 Venue Management | CRUD đã chạy; phần còn lại là rule cascade (xoá court/venue còn reservation tương lai) — cần entity reservation từ 02/05 tồn tại trước. |
| 7 | Lớp phái sinh | 04 Chat & Notification | Vòng đời chat/notification bám theo chuyển trạng thái của room + booking. Làm cuối để wiring một lần trên state cuối, thay vì đấu lại sau mỗi thay đổi ở trên. |

### Quick-wins song song (không phụ thuộc 08 — làm lúc nào cũng được)

- **07:** enforce court-name unique + sport ∈ `venue.sports` (chỉ là validation DTO/service).
- **06:** nâng block-court từ `toast()` thành block record thật (reason + start/end).
- **05:** thêm decline reason bắt buộc.

## Ghi chú validation (2026-07-10)

Đã đối chiếu toàn bộ tài liệu với source. Các review chính xác. Một vài đính chính nhỏ:

- Flow 05: approve/decline **đã persist xuống Mongo** (`venues.service.ts` `updateReservationStatus`, route `PUT …/reservations/:id/status`), không còn chỉ ở mức UI. Điểm cốt lõi của doc vẫn đúng: đã persist nhưng **chưa reconcile với player side**.
- Flow 01 DONE là thật: session store đã encode `MAX_HOSTED_ROOMS=3`, `HOLD_MS=20m`, `REQUEST_EXPIRY_MS=2h`, `INVITE_EXPIRY_MS=6h`, capacity cap, state machine `requested → approved`.
- Flow 08 xác nhận đầy đủ: `PlaySession` là entity chuẩn phía player (Booking + MatchRoom chỉ là projection); phía venue có `Reservation` + `VenueCourt` riêng, khác status enum, khác namespace id (`c*` vs `vc*`), reservation trỏ court bằng **name string**; time là key tĩnh với `TODAY_ISO = "2026-06-22"` làm mốc.

> **⚠️ Đính chính (2026-07-13) — 3 claim trên đã lỗi thời, code đã đi trước tài liệu ngay tại thời điểm review 07-10:**
> 1. **Cross-write đã hai chiều từ trước**, không chỉ "chưa reconcile": `sessions.service.ts` có `syncReservation()` (player book → tạo venue reservation `source:"app"`, `status:"pending"`) và `applyReservationStatus()` (venue duyệt/từ chối → map ngược về player session, kèm notification VN + cờ `refunded` giả lập). Liên kết bằng `sessionId`/`reservationId`/`venueId`.
> 2. **Court catalog đã hợp nhất**: `courts.service.ts` delegate sang `VenuesService.catalogCourts()`. Catalog `c*` cũ trong `api/src/data/player.ts` là dead code — id sống là `vc*`, reservation lưu `courtId` + tên denormalized, **không còn** chỉ name-string.
> 3. **`TODAY_ISO` không còn tồn tại** — Phase 1 (đã DONE, xem `FIX_REVIEW_VIENTD.md`) thay bằng ISO datetime thật (`+07:00`, Asia/Ho_Chi_Minh) và `bookingDays(anchorIso)`/`venueDays` (cửa sổ 7 ngày trượt) trong `shared/helpers.ts`. Day keys (`today/tomorrow/sat/sun/mon`) vẫn tồn tại nhưng chỉ còn là **nhãn hiển thị tương đối**, không phải mốc cố định.
>
> Xem chi tiết đầy đủ ở `FIX_REVIEW_VIENTD.md` mục 1, và mục "Quyết định đã chốt (2026-07-13)" ở cuối file này + cuối mỗi doc flow.

## Cách đọc

Mỗi file đều theo cùng cấu trúc:

- `Flow mục tiêu`: flow này dùng để làm gì
- `Luồng hiện tại trong repo`: app đang vận hành flow đó như thế nào
- `Business rules nên có`: các ràng buộc nên được chốt
- `Rủi ro nếu không chốt`: hệ quả nghiệp vụ nếu tiếp tục để mở
- `Quyết định cần xác nhận`: các câu hỏi BA/PM nên trả lời

## Ghi chú

- Bộ tài liệu này đi theo góc nhìn nghiệp vụ, không phải bug audit thuần kỹ thuật.
- Nhiều hành vi hiện tại trong app đang là prototype behavior hoặc hardcoded behavior, chưa nên coi là policy chính thức.

## Quyết định đã chốt (2026-07-13)

Toàn bộ 16 câu hỏi mở nằm rải rác trong 8 doc flow đã được product owner chốt thành quyết định nghiệp vụ ngày 2026-07-13, cùng roadmap triển khai theo phase. Nguồn chuẩn là `FIX_REVIEW_VIENTD.md` mục 2 (bảng quyết định) và mục 3 (roadmap) — bảng dưới đây là bản tóm tắt, mỗi doc flow có thêm một mục "Quyết định đã chốt" riêng trả lời trực tiếp 5 câu hỏi cuối file của doc đó.

| # | Rule | Quyết định | Doc liên quan | Trạng thái |
| --- | --- | --- | --- | --- |
| 1 | Booking ≡ Reservation | Một record duy nhất | 02, 05, 08 | Chưa triển khai (Phase 2) |
| 2 | Booking thành công | Pending → venue duyệt (trả tiền trước, duyệt sau) | 02, 05 | Đã đúng hành vi hiện tại (`venues.service.ts`) |
| 3 | Số tiền thanh toán | 100% pre-paid (bỏ cọc 5%) | 02 | Chưa triển khai (Phase 4) |
| 4 | Mô hình thời gian | ISO datetime thật, Asia/Ho_Chi_Minh, backend chuẩn | 08 | **DONE (Phase 1)** |
| 5 | SLA duyệt | 30 phút → auto-confirm (im lặng = đồng ý) | 05 | Chưa triển khai (Phase 5) |
| 6 | Cancel/refund | ≥24h hoàn 100% · <24h 50% · sau giờ bắt đầu/no-show 0% | 03 | Chưa triển khai (Phase 3/4) |
| 7 | Completion | Venue check-in; auto-complete sau giờ kết thúc; no-show sau 30 phút chưa check-in | 03, 05 | Chưa triển khai (Phase 3/5) |
| 8 | Self-overlap | Hard block, enforce server-side | 02 | Chưa triển khai (Phase 3) |
| 9 | Cổng thanh toán | SePay/VietQR qua `sepay-pg-node` (IPN, sandbox thật, refund thủ công) | 02 | Chưa triển khai (Phase 4) |
| 10 | Mock/giả lập | Gỡ dần, mock không tham gia giao dịch thật | 01 | Chưa triển khai (Phase 9) |
| 11 | Xoá venue/court | Archive; chặn khi còn reservation pending/confirmed tương lai | 07 | Chưa triển khai (Phase 6) |
| 12 | Block court | Entity thật: start/end + reason bắt buộc | 06 | Chưa triển khai (Phase 6) |
| 13 | Room chat | Tạo khi tạo room; chỉ member đã approve; kick/leave remove; cancel → freeze/archive | 04 | Chưa triển khai (Phase 8) |
| 14 | Notification | Collection transactional server-side, client poll | 04 | Chưa triển khai (Phase 7) |
| 15 | Walk-in vs pending | Pending giữ slot; phải decline (kèm reason, auto-refund) trước khi walk-in | 06 | Đã đúng hành vi hiện tại (overlap coi pending là blocking) |
| 16 | Mô hình Room | Lớp phối hợp pre-booking (projection của PlaySession) | 01, 08 | **Đã đúng hành vi hiện tại** |

**Default áp dụng luôn (quick-win, không cần hỏi thêm):** decline reason bắt buộc ở API; court name unique trong venue; court sport ∈ `venue.sports`; `openFrom < openTo`; walk-in tạo/merge CRM customer theo phone; visits/LTV recompute từ reservation completed; endpoint status có state machine hợp lệ.

**Roadmap & trạng thái từng phase**: xem `FIX_REVIEW_VIENTD.md` mục 3 — Phase 0 (quick wins) và Phase 1 (mô hình thời gian thật) đã **DONE** và merge vào `master`; Phase 2–10 (booking hợp nhất, endpoint validate server-side, SePay, scheduler, venue ops hardening, notification transactional, chat lifecycle, gỡ giả lập matchmaking, analytics trung thực) **chưa triển khai**, đi theo thứ tự phụ thuộc 08 → 02 → 05 → 03 → 06 → 07 → 04.
