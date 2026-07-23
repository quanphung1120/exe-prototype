# 02. Player Booking And Payment Flow

## Flow mục tiêu

Flow này phục vụ việc người chơi:

- chọn sân
- chọn ngày giờ
- chọn format
- tạo booking
- thanh toán hoặc đặt cọc
- gắn booking với room nếu cần

## Luồng hiện tại trong repo

- Player có thể mở booking từ:
  - Play
  - Find courts
  - Overview
  - Active room
  - AI-native dashboard
- Booking hiện đi qua wizard nhiều bước rồi tới fake payment.
- Booking chỉ được finalize sau khi fake payment success.
- Flow hiện hỗ trợ:
  - solo booking
  - booking cho room có sẵn
  - book rồi mở thêm team sau
- App có conflict checking ở nhiều điểm, nhưng policy nghiệp vụ chưa viết rõ.

## Business rules nên có

### 1. Rule về giữ sân

- Booking được coi là thành công ở thời điểm nào.
- Hệ thống có dùng full payment hay chỉ giữ chỗ tạm.
- Nếu payment đang xử lý thì slot được lock trong bao lâu.
- Nếu payment fail thì slot trả lại ngay hay có grace period.

### 2. Rule về số lượng booking

- 1 user được có tối đa bao nhiêu booking active.
- Có giới hạn theo ngày, theo tuần, theo venue hay không.
- Có cho phép tạo booking chồng giờ hay không.

### 3. Rule về overlap

- Self-overlap là hard-block hay soft warning.
- Overlap với room khác của cùng user có được phép không.
- Overlap với room đã request join nhưng chưa approved thì tính như thế nào.

### 4. Rule về ownership

- Ai là owner chính của booking.
- Participant có quyền xem hay hủy booking hay không.
- Room booking và solo booking có chung policy quyền hạn hay không.

### 5. Rule về thay đổi booking

- Sau khi booking thành công có được sửa:
  - court
  - time
  - format
  - roster
- Nếu không cho sửa, thì policy chuẩn là cancel + rebook.
- Nếu cho sửa, thì ai bị notify và payment có recalculation hay không.

### 6. Rule về payment

- Số tiền hiện tại là:
  - cọc
  - thanh toán đủ
  - hoa hồng nền tảng
  - hay chỉ là giả lập UX
- Refund được tính thế nào khi hủy.
- Nếu venue từ chối reservation thì xử lý payment ra sao.

## Ràng buộc nghiệp vụ nên ưu tiên chốt

| Nhóm rule | Nên chốt |
| --- | --- |
| Reservation hold | Slot được giữ trong lúc thanh toán bao lâu |
| Payment model | Cọc hay full payment |
| Overlap | Soft warning hay hard block |
| Ownership | Ai được hủy, ai được sửa |
| Mutation | Booking có được edit tại chỗ hay chỉ cancel + rebook |

## Rủi ro nếu không chốt

- User không biết lúc nào mình thực sự giữ được sân.
- Team dev không thống nhất được payment flow thật.
- Trạng thái booking dễ lệch với venue reservation.
- Sau này thêm payment gateway thật sẽ phải sửa logic lớn.

## Quyết định cần xác nhận

1. Booking thành công sau payment hay sau venue approve.
2. Slot giữ tối đa bao lâu trong lúc thanh toán.
3. Self-overlap là block hay warning.
4. Booking có được edit hay chỉ cancel + rebook.
5. Payment hiện đang đại diện cho cọc hay thanh toán đủ.

## Quyết định đã chốt (2026-07-13)

1. **Booking thành công sau payment hay sau venue approve** → cả hai, theo thứ tự: **trả tiền trước (payment thành công) → vào `pending` → venue duyệt** (quyết định #2). Im lặng 30 phút = tự động confirm (quyết định #5, chi tiết ở doc 05).
2. **Slot giữ tối đa bao lâu lúc thanh toán** → hold 20 phút do **server** cấp (`holdExpiresAt = now + 20min`), thay cho `HOLD_MS` client hiện tại — booking vào `awaiting_payment` cho tới khi IPN xác nhận hoặc hold hết hạn (roadmap Phase 3, sweeper Phase 5).
3. **Self-overlap** → **hard block, enforce server-side** (quyết định #8) — không còn chỉ là pre-check client.
4. **Booking có được edit hay chỉ cancel + rebook** → chưa nằm trong 16 quyết định đã chốt lần này; giữ nguyên **cancel + rebook**, không hỗ trợ edit tại chỗ cho tới khi có quyết định riêng.
5. **Payment hiện đại diện cho cọc hay đủ** → chốt **100% pre-paid**, bỏ hẳn mô hình cọc 5% (quyết định #3). Cổng thanh toán là **SePay/VietQR** qua SDK `sepay-pg-node` (IPN xác nhận, sandbox thật `pgapi-sandbox.sepay.vn`; refund **không có API** → xử lý thủ công qua hàng đợi operator, copy nói rõ "hoàn tiền trong 24–48h làm việc") (quyết định #9). Refund tính theo policy huỷ 24h/50%/0% — xem doc 03.

**Trạng thái triển khai**: `awaiting_payment`/hold server-side, self-overlap hard-block server-side, và SePay gateway đều thuộc roadmap **Phase 3–4**, **chưa triển khai** — hiện tại (2026-07-20) payment vẫn là fake QR + timer client (`PAY_MS`) với decline giả ~20% lần đầu, thu 5% cọc (`session.tsx`).
