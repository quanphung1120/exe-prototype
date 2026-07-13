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

- Player side và venue side hiện vẫn mang nhiều dấu hiệu là hai mô hình dữ liệu tách biệt.
- Court catalog, availability logic và reservation rendering chưa dùng chung một source of truth hoàn chỉnh.
- Chat, notification, overview, analytics và CRM đang được dẫn dắt bởi nhiều lớp state khác nhau.

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
- `today`, `tomorrow`, `sat`, `sun`, `mon` có còn là key tĩnh hay phải thay bằng canonical date thật.
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
