# 05. Venue Reservation And Approval Flow

## Flow mục tiêu

Flow này phục vụ phía chủ sân khi cần:

- xem danh sách reservation
- approve hoặc decline request
- theo dõi trạng thái trong ngày
- rà soát lịch sử booking

## Luồng hiện tại trong repo

- Venue workspace có màn `Reservations`.
- UI hiện thể hiện các trạng thái như:
  - pending
  - confirmed
  - checked-in
  - completed
  - cancelled
  - no-show
- Có approve/decline action, **đã persist xuống Mongo** (`venues.service.ts updateReservationStatus`) **và đã cross-write hai chiều với player side**: player book → `syncReservation()` tạo venue reservation (`source:"app"`, `status:"pending"`); venue duyệt/từ chối → `applyReservationStatus()` map ngược về player session kèm notification VN + cờ `refunded` giả lập. *(Đính chính 2026-07-13 — claim "chưa thống nhất" trong bản gốc đã lỗi thời so với source; xem `FIX_REVIEW_VIENTD.md` mục 1.)*

## Business rules nên có

### 1. Rule về source of request

- Reservation đến từ app booking có mặc định `confirmed` hay phải `pending`.
- Walk-in có đi vào cùng queue approval hay auto-confirm.
- Reservation do operator tạo thủ công có rule riêng hay không.

### 2. Rule approve/decline

- Operator được duyệt trong khoảng thời gian nào.
- Nếu quá thời gian chưa duyệt thì:
  - auto-expire
  - auto-confirm
  - hay giữ pending
- Decline có phải kèm reason không.

### 3. Rule trạng thái

- `pending` khác `confirmed` ở đâu.
- `checked-in` được set bởi ai.
- `completed` được set lúc nào.
- `cancelled` do ai tạo.
- `no-show` được xác định khi nào.

### 4. Rule tương tác với player side

- Khi venue decline reservation, player side phải thấy gì.
- Khi venue confirm reservation, payment và notification xử lý ra sao.
- Khi venue update trạng thái, booking bên player có đồng bộ theo hay không.

### 5. Rule lịch sử

- Reservation lịch sử có được sửa trạng thái không.
- Reservation completed/no-show có được rollback không.
- Lịch sử có dùng cho CRM và analytics như source chính hay không.

## Ràng buộc nghiệp vụ nên ưu tiên chốt

| Nhóm rule | Nên chốt |
| --- | --- |
| Approval | Booking từ app có phải venue duyệt hay không |
| SLA | Pending tồn tại bao lâu |
| Status machine | Checked-in, completed, no-show vận hành thế nào |
| Sync | Player booking và venue reservation có đồng bộ 1-1 không |
| Reasoning | Decline/cancel/no-show có cần lý do lưu lại không |

## Rủi ro nếu không chốt

- Chủ sân và người chơi thấy cùng một booking theo hai nghĩa khác nhau.
- Analytics doanh thu và utilization bị sai.
- CRM và no-show policy không thể dùng thật.

## Quyết định cần xác nhận

1. Booking từ app có cần venue approve hay auto-confirm.
2. Pending reservation hết hạn sau bao lâu.
3. Decline có bắt buộc reason hay không.
4. No-show được xác định sau bao nhiêu phút chưa check-in.
5. Venue reservation và player booking có phải cùng một record hay không.

## Quyết định đã chốt (2026-07-13)

1. **Booking từ app cần venue approve hay auto-confirm** → **pending → venue duyệt**, trả tiền trước (quyết định #2) — đây **đã là hành vi hiện tại** (`venues.service.ts:744`), không phải thay đổi mới.
2. **Pending hết hạn sau bao lâu** → **SLA duyệt 30 phút**: nếu venue không quyết định trong 30 phút, hệ thống **im lặng = auto-confirm** (quyết định #5). Venue chỉ được decline **trong** cửa sổ 30 phút này.
3. **Decline có bắt buộc reason không** → **có**, ở cả API lẫn UI (`ReservationStatusDto` → `@ValidateIf(status==="cancelled") @IsString() @Length(3,200) reason`) — quick-win default, đã áp dụng từ Phase 0.
4. **No-show xác định sau bao nhiêu phút** → **30 phút** sau giờ bắt đầu (`startAt`) mà chưa check-in (quyết định #7).
5. **Venue reservation và player booking có phải cùng 1 record** → **có**, mục tiêu là **hợp nhất thành một collection `bookings` chuẩn** (quyết định #1), thay cho mô hình hiện tại là hai record (`PlaySession` + `Reservation`) cross-write hai chiều qua `sessionId`/`reservationId`.

**Trạng thái triển khai**: mục 1 và 3 **đã DONE** (Phase 0 + hành vi có sẵn). Mục 2 (SLA 30 phút + scheduler auto-confirm) là roadmap **Phase 5**; mục 4 (no-show 30 phút) là **Phase 3/5**; mục 5 (hợp nhất một record) là **Phase 2** — cả ba **chưa triển khai** tại 2026-07-20; hiện chưa có scheduler nào chạy (không SLA pending, không auto-complete, không auto no-show).
