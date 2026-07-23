# 07. Venue Management Flow

## Flow mục tiêu

Flow này phục vụ chủ sân khi cần:

- tạo venue
- sửa venue
- xóa venue
- thêm sân
- sửa sân
- xóa sân
- chuyển active venue trong workspace

## Luồng hiện tại trong repo

- Venue management hiện có CRUD cho venue và court.
- App đã có một số validation shape ở API layer.
- Có rule kỹ thuật là không cho xóa venue cuối cùng.
- Chưa có nhiều business rules cascade cho reservation, analytics, pricing và ownership.

## Business rules nên có

### 1. Rule tạo/sửa venue

- Venue có bắt buộc ít nhất 1 sport không.
- `openFrom` phải nhỏ hơn `openTo`.
- Có cho overnight hours hay không.
- 1 operator được quản lý tối đa bao nhiêu venue.

### 2. Rule xóa venue

- Có được xóa venue đang có reservation tương lai hay không.
- Nếu xóa venue thì:
  - reservation đi đâu
  - customer history đi đâu
  - analytics có giữ lại không
- Xóa là hard delete hay archive.

### 3. Rule tạo/sửa court

- Court sport có bắt buộc nằm trong `venue.sports` hay không.
- Court name có phải unique trong cùng venue không.
- Giá sân có giới hạn nghiệp vụ hay không.
- Có được sửa sport của court đang có lịch sử booking hay không.

### 4. Rule xóa court

- Có được xóa court đang có reservation tương lai hay không.
- Có cần chuyển sang `inactive/archive` thay vì delete.
- Nếu xóa thì reservation cũ giữ snapshot name hay bị orphan.

### 5. Rule active venue

- Khi đổi active venue, các màn:
  - schedule
  - reservations
  - analytics
  - customers
  phải đọc cùng 1 source hay không.
- Active venue có persist theo user/session không.

### 6. Rule phân quyền

- Có chỉ 1 manager hay nhiều staff.
- Ai được:
  - tạo venue
  - xóa venue
  - thêm/xóa court
  - đổi giá
  - block sân
  - duyệt reservation

## Ràng buộc nghiệp vụ nên ưu tiên chốt

| Nhóm rule | Nên chốt |
| --- | --- |
| Delete policy | Hard delete hay archive cho venue/court |
| Cascade | Reservation tương lai và lịch sử bị ảnh hưởng thế nào |
| Integrity | Court sport, court name, opening hours |
| Multi-venue | 1 operator có bao nhiêu venue |
| RBAC | Ai có quyền thao tác gì |

## Rủi ro nếu không chốt

- Dễ tạo dữ liệu venue/court không hợp lệ.
- Reservation cũ hoặc tương lai dễ bị mồ côi.
- Khi có nhiều staff sẽ không biết ai được quyền gì.

## Quyết định cần xác nhận

1. Venue/court dùng hard delete hay archive.
2. Có cho xóa court có reservation tương lai không.
3. Court name có phải unique trong venue không.
4. Court sport có phải thuộc `venue.sports` không.
5. Workspace venue có cần RBAC nhiều cấp hay không.

## Quyết định đã chốt (2026-07-13)

1. **Venue/court dùng hard delete hay archive** → **archive** (quyết định #11), thay cho hard delete hiện tại.
2. **Có cho xóa court có reservation tương lai không** → **không** — guard: còn `pending`/`confirmed` **tương lai** (theo `startAt` thật, có từ Phase 1) → chặn (`ConflictException`, copy gợi ý "…cancel và refund trước"). Phải cancel + refund hết trước khi archive.
3. **Court name unique trong venue** → **có** (default quick-win, đã trong Phase 0).
4. **Court sport thuộc `venue.sports`** → **có** (default quick-win, đã trong Phase 0), cùng với `openFrom < openTo`.
5. **Workspace venue có cần RBAC nhiều cấp không** → **chưa nằm trong 16 quyết định đã chốt lần này** — giữ nguyên mô hình 1 owner/venue (không chốt multi-staff RBAC ở vòng này).

**Flag cho product** (ghi nhận từ rủi ro #5 trong `FIX_REVIEW_VIENTD.md`): venue đã archive vẫn chiếm slot trong ràng buộc "one-venue-per-owner" (unique index `ownerId`) — UI màn quản lý sẽ cần nút "Khôi phục" thay vì cho tạo venue mới khi owner đã có venue archived.

**Trạng thái triển khai**: mục 3–4 (integrity CRUD) **đã DONE ở Phase 0**. Mục 1–2 (archive thay delete + guard cascade) thuộc roadmap **Phase 6**, **chưa triển khai** tại 2026-07-20 — venue/court hiện vẫn hard delete, không chặn khi còn reservation tương lai (reservation mồ côi là hành vi được chấp nhận, ghi rõ trong comment code).
