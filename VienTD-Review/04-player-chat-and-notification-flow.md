# 04. Player Chat And Notification Flow

## Flow mục tiêu

Flow này phục vụ việc:

- tạo chat liên quan tới room hoặc nhóm
- cho người chơi phối hợp trận đấu
- phát notification khi có thay đổi liên quan tới room, booking hoặc chat

## Luồng hiện tại trong repo

- Chat đang xuất hiện như một phần hỗ trợ cho room/team coordination.
- Notification có thể được tạo khi user tham gia room hoặc khi có team chat mới.
- Nhiều hành vi hiện đang suy ra từ membership state của room.
- Khi room đổi trạng thái, dữ liệu phụ như chat hoặc notification chưa có lifecycle nghiệp vụ chuẩn.

## Business rules nên có

### 1. Rule tạo chat

- Khi nào hệ thống tạo room chat.
- Chat được tạo khi:
  - request join
  - approved join
  - create room
  - create invite room
  - hay chỉ khi đã có booking
- 1 room có đúng 1 chat hay có thể có nhiều thread.

### 2. Rule membership của chat

- Người đang `requested` có được vào chat không.
- Người bị decline hoặc kick có bị remove khỏi chat không.
- Host rời room thì chat bị archive, transfer hay xóa.

### 3. Rule vòng đời notification

- Notification nào là transactional.
- Notification nào chỉ là activity feed.
- Notification cũ có bị invalid khi room hoặc booking đổi trạng thái không.

### 4. Rule đồng bộ với booking

- Hủy booking có phát notification cho toàn bộ participant hay không.
- Đổi thời gian/court có notify không.
- Nếu room còn tồn tại nhưng booking bị hủy thì chat còn dùng tiếp hay archive.

### 5. Rule retention và lịch sử

- Chat sau trận có giữ lại làm history không.
- Notification đã đọc có expiry hay không.
- Nếu user join lại cùng room thì có tạo notification mới hay tái sử dụng logic cũ.

## Ràng buộc nghiệp vụ nên ưu tiên chốt

| Nhóm rule | Nên chốt |
| --- | --- |
| Chat creation | Mốc nào mới được coi là đủ điều kiện tạo chat |
| Membership | Requested/pending/declined có được thấy chat không |
| Archive | Khi nào chat bị archive hoặc xóa |
| Transactional notifications | Những event nào bắt buộc phải notify |
| Invalid notifications | Notification cũ xử lý ra sao khi entity đổi trạng thái |

## Rủi ro nếu không chốt

- User thấy chat quá sớm hoặc quá muộn.
- Notification dẫn tới room/chat đã không còn hợp lệ.
- Hành vi sau leave/kick/cancel khó nhất quán giữa các màn hình.

## Quyết định cần xác nhận

1. Room chat được tạo ở mốc nào.
2. User `requested` có được vào chat không.
3. Khi room bị cancel, chat bị archive hay xóa.
4. Notification nào bắt buộc phải transactional.
5. Notification cũ có tự vô hiệu hóa khi room không còn hợp lệ hay không.

## Quyết định đã chốt (2026-07-13)

1. **Room chat tạo ở mốc nào** → **khi tạo room** (`createRoomChannel`), chỉ host là member lúc tạo — không seed mock player vào channel (quyết định #13).
2. **`requested` có được vào chat không** → **không**. Chỉ member **đã được host approve** mới được thêm vào channel (`addRoomMember`); decline/kick/leave → `removeRoomMember` ngay.
3. **Room bị cancel thì chat archive hay xóa** → **freeze** (`updatePartial({set:{frozen:true}})`), giữ nguyên lịch sử, khoá gửi tin mới — không xóa channel (quyết định #13).
4. **Notification nào bắt buộc transactional** → lưu server, không chỉ activity feed: **approve/decline booking, cancel kèm refund, no-show, join request, invite** (quyết định #14). Client poll ~30s + refetch khi focus/visibility; push để sau.
5. **Notification cũ có tự vô hiệu hóa không** → chưa nằm trong 16 quyết định đã chốt lần này; giữ nguyên (client tự tính "đã đọc"/thời gian tương đối, không có cơ chế invalidate ngược theo entity).

**Trạng thái triển khai**: toàn bộ mục 1–4 thuộc roadmap **Phase 7 (notification transactional)** và **Phase 8 (vòng đời Stream chat)**, **chưa triển khai** tại 2026-07-20 — hiện tại channel vẫn tạo lazy kèm mock players, không remove/archive khi cancel/kick/leave; notification vẫn là client tự sinh, quyết định của venue chỉ tới player khi reload seed.
