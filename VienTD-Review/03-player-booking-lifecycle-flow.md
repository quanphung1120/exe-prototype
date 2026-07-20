# 03. Player Booking Lifecycle Flow

## Flow mục tiêu

Flow này mô tả vòng đời của booking sau khi đã được tạo:

- confirmed
- pending
- completed
- cancelled
- rebook
- mở thêm team cho booking solo

## Luồng hiện tại trong repo

- Bookings page hiện hiển thị danh sách booking và lịch.
- Có action:
  - new booking
  - cancel booking
  - rebook
  - add team to session
- Với room booking, khi cancel có thể làm room quay về `forming`.
- Với solo booking, cancel hiện chủ yếu đổi trạng thái local.
- Completion và historical lifecycle chưa được định nghĩa đủ chặt.

## Business rules nên có

### 1. Rule về state machine booking

- `pending` dùng trong trường hợp nào.
- `confirmed` dùng trong trường hợp nào.
- `completed` được set bởi event nào.
- `cancelled` có phải terminal state không.
- Có cần thêm state như `payment_failed`, `refunded`, `expired` hay không.

### 2. Rule về cancel

- Ai được cancel booking.
- Cancel trước giờ chơi bao lâu thì miễn phí.
- Cancel sát giờ có bị mất cọc hoặc mất toàn bộ tiền hay không.
- Cancel booking gắn với room thì roster bị ảnh hưởng thế nào.

### 3. Rule về complete

- Booking tự complete khi qua giờ kết thúc hay không.
- Venue phải check-in hoặc check-out thì mới complete hay không.
- Booking không check-in thì complete thành `no-show` hay `cancelled`.

### 4. Rule về rebook

- Rebook copy lại những gì:
  - court
  - format
  - duration
  - team
  - fill mode
- Rebook có giữ giá cũ hay áp giá mới.
- Rebook có cần re-approval từ venue hay không.

### 5. Rule về add team sau khi book solo

- Có cho phép mở booking solo thành room/team booking không.
- Có cutoff time trước giờ chơi để thêm người hay không.
- Khi thêm team sau, participant mới có phải thanh toán hoặc confirm gì không.

## Ràng buộc nghiệp vụ nên ưu tiên chốt

| Nhóm rule | Nên chốt |
| --- | --- |
| State machine | Nghĩa chính xác của pending, confirmed, completed, cancelled |
| Cancel policy | Refund, fee, cutoff time |
| Completion | Điều kiện để booking hoàn tất |
| Rebook | Dữ liệu nào được clone, dữ liệu nào phải chọn lại |
| Team growth | Booking solo có được biến thành team booking hay không |

## Rủi ro nếu không chốt

- Analytics và history sẽ không đáng tin.
- Payment/refund không thể nối thật.
- Team không thể thống nhất QA expected behavior.
- Booking page và venue side dễ diễn giải khác nhau về cùng một booking.

## Quyết định cần xác nhận

1. `completed` được set tự động hay bởi venue action.
2. Cancel sát giờ có mất phí hay không.
3. Rebook có copy team không.
4. Booking solo có được mở thành team booking không.
5. Có cần thêm state mới ngoài 4 state hiện tại không.

## Quyết định đã chốt (2026-07-13)

1. **`completed` tự động hay venue action** → cả hai theo trình tự: **venue check-in** (thủ công) → **auto-complete sau giờ kết thúc** (scheduler). Nếu chưa check-in, **no-show đánh được sau 30 phút** quá giờ bắt đầu (quyết định #7).
2. **Cancel sát giờ có mất phí không** → có, theo policy: **≥24h trước giờ chơi: hoàn 100%; <24h: hoàn 50%; sau giờ bắt đầu hoặc no-show: hoàn 0%** (quyết định #6). Venue decline (không phải player cancel) luôn hoàn 100% bất kể mốc thời gian.
3. **Rebook có copy team không** → chưa nằm trong 16 quyết định đã chốt lần này, giữ nguyên hành vi hiện tại (không đổi).
4. **Booking solo có được mở thành team booking không** → giữ nguyên, phù hợp quyết định #16 (Room = lớp phối hợp trên PlaySession) — "add team to session" tiếp tục là cách hợp lệ để mở rộng booking solo thành room.
5. **Cần thêm state mới không** → có. Bảng chuyển trạng thái chuẩn (`BOOKING_TRANSITIONS`, thay `RESERVATION_TRANSITIONS` của Phase 0) là: `awaiting_payment → (IPN) pending → (duyệt | timeout 30 phút) confirmed → checked-in → completed`, cộng `expired` (hết hạn hold/link thanh toán), `cancelled` (kèm `cancelReason` bắt buộc), `no-show`. Một bảng transition dùng chung cho cả API guard lẫn trạng thái nút trên web.

**Trạng thái triển khai**: state machine `RESERVATION_TRANSITIONS` (4→7 state cũ) đã **DONE ở Phase 0** cho reservation hiện tại; `BOOKING_TRANSITIONS` đầy đủ (bao gồm `awaiting_payment`/`expired`) và cancel-policy 24h/50%/0% thuộc roadmap **Phase 2–4**, **chưa triển khai** tại 2026-07-20.
