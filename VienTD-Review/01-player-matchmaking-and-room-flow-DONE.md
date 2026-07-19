# 01. Player Matchmaking And Room Flow

## Flow mục tiêu

Flow này phục vụ việc người chơi:

- tìm room có sẵn để tham gia
- tạo room mới để host trận
- quick join / quick match khi chưa có room phù hợp
- quản lý roster của room trước khi trận được book sân

## Luồng hiện tại trong repo

- Player có thể vào tab `Play` để xem danh sách room.
- Có thể `join room`, `quick join`, `create room`, hoặc được tạo seed room từ quick-match fallback.
- Room hiện đi qua các trạng thái nghiệp vụ gần đúng: `forming`, `booked`, `completed`, `cancelled`.
- Join request hiện đang đi theo hướng `requested -> approved`, nhưng trong tài liệu/spec cũ vẫn còn dấu vết của direct join.
- Host có thể:
  - tăng/giảm capacity
  - invite player
  - kick player
  - leave room
- App hiện cho phép multi-room ở mức state model.

## Business rules nên có

### 1. Rule về quyền tham gia room

- 1 người được phép tham gia tối đa bao nhiêu room tại cùng 1 thời điểm.
- 1 người được phép có bao nhiêu join request đang chờ duyệt.
- Có cho phép join nhiều room nếu không trùng lịch hay không.
- Có cho phép vừa là host của room A vừa là member của room B hay không.

### 2. Rule về loại room

- Public room có join trực tiếp hay phải host approval.
- Invite-only room có khác public room về approval hay không.
- Quick-match room có phải loại room riêng hay chỉ là một cách tạo room.
- Room đã book sân có còn mở cho user khác join hay không.

### 3. Rule về host

- 1 host được tạo tối đa bao nhiêu open rooms.
- Host có được hủy room chủ động hay chỉ được rời room.
- Host rời room thì:
  - room bị disband
  - room đổi host
  - hay room bị hủy
- Host có được kick member sau khi room đã book sân hay không.

### 4. Rule về capacity và roster

- Capacity tối thiểu/tối đa theo format.
- Singles có được tăng từ 2 lên 4 hay không.
- Room full rồi thì request đang chờ được xử lý ra sao.
- Declined player có được request lại không.
- Invited player có thời hạn phản hồi không.

### 5. Rule về vòng đời room

- Room `forming` tồn tại tối đa bao lâu nếu không đủ người.
- Room không hoạt động có tự đóng hay không.
- Room đã đầy nhưng chưa book sân có timeout hay không.
- Room bị cancel thì chat, notification và active-room badge xử lý thế nào.

## Ràng buộc nghiệp vụ nên ưu tiên chốt

| Nhóm rule | Nên chốt |
| --- | --- |
| Membership | Mỗi user có tối đa bao nhiêu room active và request pending |
| Approval | Room nào cần host duyệt, room nào join trực tiếp |
| Capacity | Giới hạn theo format, sport và loại room |
| Host control | Khi nào host được kick, cancel, disband |
| TTL | Room forming và invite pending tồn tại bao lâu |

## Rủi ro nếu không chốt

- Người chơi có thể tham gia nhiều room trùng giờ.
- Host và member hiểu khác nhau về trạng thái “đã vào room”.
- Matchmaking pool bị đầy bởi room cũ hoặc room rác.
- Chat và notification sinh ra sai thời điểm.
- Khi nối persistence thật, state machine của room sẽ rất khó ổn định.

## Quyết định cần xác nhận

1. 1 user được giữ bao nhiêu room active.
2. Public room có cần host duyệt không.
3. Host rời room thì room bị hủy, chuyển host hay disband.
4. Invite/request có expiry hay không.
5. Room forming quá bao lâu thì tự đóng.
