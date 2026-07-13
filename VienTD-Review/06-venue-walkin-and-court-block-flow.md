# 06. Venue Walk-in And Court Block Flow

## Flow mục tiêu

Flow này phục vụ chủ sân khi cần:

- thêm khách vãng lai vào lịch
- giữ chỗ nhanh cho khách tại quầy
- block sân để maintenance hoặc dùng nội bộ
- xử lý các khoảng trống trong schedule

## Luồng hiện tại trong repo

- Schedule hiện cho phép add walk-in từ free band.
- Walk-in đang có một số validation kỹ thuật:
  - court không được maintenance
  - thời lượng theo bước 15 phút
  - phải nằm trong opening hours
  - không overlap với reservation đang active
  - có tên và số điện thoại
- Block court hiện chủ yếu mới dừng ở UX/action level, chưa có object nghiệp vụ hoàn chỉnh.

## Business rules nên có

### 1. Rule tạo walk-in

- Walk-in có bắt buộc số điện thoại không.
- Walk-in có bắt buộc tên thật không.
- Walk-in có bắt buộc nhập số người, sport, note hay không.
- Walk-in tạo xong vào `confirmed` hay `checked-in`.

### 2. Rule thanh toán walk-in

- Walk-in có phải trả tiền ngay không.
- Có cho nợ hoặc đánh dấu unpaid không.
- Nếu khách không đến sau khi đã giữ chỗ tại quầy thì chuyển trạng thái gì.

### 3. Rule ưu tiên slot

- Walk-in và app booking bên nào có ưu tiên cao hơn.
- Operator có được override conflict hay không.
- Slot đang pending approval từ app có được phép nhét walk-in vào không.

### 4. Rule block court

- Block court dùng cho những trường hợp nào:
  - maintenance
  - giải nội bộ
  - giữ sân cho khách VIP
  - nghỉ giữa ca
- Block có phải nhập reason không.
- Block có start/end time rõ ràng không.
- Ai có quyền tạo và gỡ block.

### 5. Rule liên quan tới CRM

- Walk-in customer có được tạo luôn thành customer record hay không.
- Merge theo phone hay theo tiêu chí khác.
- Walk-in completed có cộng visit và LTV hay không.

## Ràng buộc nghiệp vụ nên ưu tiên chốt

| Nhóm rule | Nên chốt |
| --- | --- |
| Walk-in state | Tạo xong là confirmed hay checked-in |
| Walk-in fields | Có bắt buộc phone, party size, note không |
| Priority | Walk-in có được override app booking không |
| Block policy | Reason, time window, quyền tạo/gỡ |
| CRM linkage | Walk-in có sinh customer record hay không |

## Rủi ro nếu không chốt

- Front desk và app booking tranh chấp cùng 1 slot.
- Doanh thu walk-in không thể theo dõi đúng.
- CRM dễ bị duplicate hoặc thiếu dữ liệu.
- Court block không có audit reason.

## Quyết định cần xác nhận

1. Walk-in tạo xong là `confirmed` hay `checked-in`.
2. Walk-in có bắt buộc số điện thoại không.
3. Operator có được override slot đã có app booking không.
4. Block court có bắt buộc nhập lý do không.
5. Walk-in có tự sinh customer record và cộng LTV hay không.
