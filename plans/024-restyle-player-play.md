# Plan 024: Remake style `/app/play` theo `/app`

- **Trạng thái:** TODO — chỉ lập kế hoạch, chưa sửa giao diện.
- **Route:** `/[locale]/app/play`, ưu tiên `/vi/app/play`, giữ hỗ trợ `en`.
- **Mục tiêu:** Play dùng cùng header, font, palette, bo góc và nhịp khoảng cách với trang chủ; giữ đầy đủ chức năng tìm sân, đặt sân, tìm người chơi và quản lý phòng.
- **Nguồn tham chiếu:** Code hiện tại của `dashboard-welcome.tsx`, `topbar.tsx`, `dashboard-frame.tsx`, theme và các component play. Server localhost phản hồi nhưng request không có phiên Clerk (`signed-out`); chưa có ảnh đối chiếu từ trình duyệt đã đăng nhập. Chụp baseline là bước đầu khi triển khai.

## 1. Hiện trạng và quyết định thiết kế

| Vùng | Hiện trạng trong code | Hướng remake |
|---|---|---|
| Shell | Home, chat, bookings dùng header xanh và bỏ sidebar; play còn sidebar và topbar trung tính. | Mở rộng shell người chơi sang đúng route `/app/play`, active mục Play trên desktop/mobile. |
| Theme | Dashboard ép dark; chat/bookings ép light. Home đặt nhiều màu trực tiếp và có hero tối. | Play ép light như bookings, nội dung trắng, header xanh. Bản đồ dùng style tối riêng để đồng bộ bản đồ home. |
| Play toolbar | Hai tab `courts`/`rooms`, `SportFilter`; ghép nhanh/tạo phòng hiện khi chọn rooms. | Giữ hai tab, đổi thành pill; thêm tiêu đề và mô tả ngắn; giữ CTA đúng ngữ cảnh. |
| Tìm sân | Desktop bản đồ 70%, danh sách 30%; mobile bản đồ trên, danh sách dưới. | Giữ thứ tự và liên kết map/list; tăng bề rộng danh sách để card và thao tác dễ đọc. |
| Phòng chơi | Grid 1/2/3 cột, card hiển thị môn, thể thức, trình độ, giờ, sân, thành viên, giá và host. | Giữ cấu trúc dữ liệu; card trắng, viền nhẹ, trạng thái và CTA rõ hơn. |
| Phòng đang tham gia | `ActiveRoomPill` và sheet quản lý được render trong topbar trung tính. Header xanh hiện không render component này. | Đưa `ActiveRoomPill` vào toolbar play, hiện ở cả hai tab; giữ component được mount ổn định để dock vẫn mở được manager. |
| State dùng chung | `SessionProvider`, `SportFilterProvider`, `PlayerChrome` nằm trong app layout. Booking điều hướng sang wizard; dialogs và dock dùng state chung. | Giữ vị trí/lifecycle provider, handlers và route booking hiện tại. |

Workspace đang có thay đổi chưa commit ở shell, theme, home, chat, bookings và `court-map.tsx`. Khi triển khai đọc lại diff và dùng code mới nhất làm baseline, bổ sung thay đổi nhỏ theo plan này.

## 2. Bố cục mục tiêu

```text
Header xanh chung: Logo | Trang chủ · Play active · Chat · Lịch đặt | Menu

Container căn giữa, nền trắng
  Tiêu đề Play + mô tả ngắn
  [Tìm sân | Phòng chơi] [Môn thể thao] [Phòng đang tham gia]
  Khi chọn Phòng chơi:                    [Ghép nhanh] [Tạo phòng]

  Tab Tìm sân
    [Bản đồ tối, bo góc lớn ~60%] [Tìm kiếm + sort + danh sách sân ~40%]
    [Nút định vị + trạng thái]     [Card: sân, vị trí, giá, Đặt sân, Chỉ đường]

  Tab Phòng chơi
    [Card phòng] [Card phòng] [Card phòng]
    Trạng thái rỗng có CTA ghép nhanh/tạo phòng

  Dock ghép nhanh dùng chung vẫn xuất hiện khi có tìm kiếm đang chạy
```

- Header tái sử dụng `DashboardTopbar`: xanh `#2046ed`, logo/neon `#a5ff12`, chiều cao hiện tại 88px; giữ thông báo, locale, menu tài khoản và các lối vào theo quyền.
- Nội dung dùng font Geist, `max-w-6xl`, padding ngang 20px trên mobile; khoảng cách section 24–32px. Tiêu đề khoảng 28–36px; mô tả và nội dung card đủ lớn để đọc.
- Không cần hero cao như home: phần tìm sân/phòng phải nhìn thấy ngay sau toolbar. Có thể dùng một chi tiết trang trí nhỏ từ asset sẵn có nếu không chiếm chỗ thao tác.
- Desktop map/list chia khoảng 60/40, danh sách tối thiểu khoảng 340px nếu viewport cho phép. Khi không đủ rộng chuyển sang một cột. Mobile map cao khoảng 280–320px, danh sách cuộn theo trang.
- Bỏ phụ thuộc chiều cao cũ `calc(100vh - 11rem)` của FindCourts. Tính vùng map/list theo shell và toolbar mới, hoặc dùng chiều cao responsive có giới hạn; chỉ danh sách cuộn riêng trên desktop khi vùng chứa có chiều cao xác định.
- Tab rooms dùng 1 cột mobile, 2 cột tablet, 3 cột desktop nếu card đủ rộng. CTA có nhãn dễ đọc cả trên mobile; vùng bấm khoảng 44px.

### Palette và scope

| Vai trò | Thiết kế |
|---|---|
| Nền trang/card | Trắng `#ffffff`, nền phụ `#f1f3f5`. |
| Chữ | Chính `#0b1224`/`#142050`, phụ `#596783`. |
| Brand/active | Xanh `#2046ed`, hover `#173bc8`; tab active xanh, chữ trắng. |
| CTA nổi bật | Neon `#a5ff12`, chữ xanh đen; chọn một CTA chính mỗi vùng. |
| Card | Bo 24–32px, viền nhẹ `#e5e7eb`, bóng nhẹ; sân được chọn có viền xanh rõ. |
| Trạng thái | Đã tham gia xanh; đang chờ duyệt hổ phách; hủy/rời hành động đỏ; đầy/trùng giờ/demo có nhãn và disabled rõ. |

Đặt token trong `.player-play` và `.player-play-overlay`; overlay qua portal phải nhận scope/variant phù hợp. Không đổi token toàn ứng dụng hoặc mặc định UI chung. Với component dùng chung, thêm variant tùy chọn hoặc className và giữ mặc định hiện tại. Đọc guide CSS và layouts/pages trong `web/node_modules/next/dist/docs/` trước khi sửa code theo `AGENTS.md`.

## 3. Ma trận chức năng bắt buộc giữ

| Nhóm | Hành vi cần giữ | Kiểm tra nghiệm thu |
|---|---|---|
| Tab/route | Mặc định courts; `?tab=rooms` mở rooms; chỉ panel active được mount. | Vào URL trực tiếp, refresh, đổi tab, back/forward theo hành vi baseline. Không tự thêm đồng bộ tab lên URL trong đợt restyle. |
| Môn thể thao | `SportFilter` dùng context chung, lọc cả sân và phòng. | Thay môn và chuyển route; lựa chọn vẫn theo lifecycle provider hiện tại. |
| Search/sort sân | Tìm theo tên/địa chỉ, không phân biệt dấu/hoa thường; xóa search; sort khoảng cách/giá/rating; đếm kết quả thật. | Query có dấu/không dấu, rỗng, không kết quả; khoảng cách chưa biết vẫn xử lý đúng. |
| Map/list | Pin sân và chi nhánh, vị trí người chơi, pan/zoom, chọn pin/card; flyTo và scroll tới card được chọn. | Hai chiều pin ↔ card; lọc bỏ sân đang chọn; sân thiếu tọa độ vẫn có trong list. |
| Định vị/chỉ đường | Giữ yêu cầu geolocation, trạng thái locating/on/từ chối/lỗi; Google Maps mở tab mới; disable chỉ đường nếu thiếu tọa độ. | Cho phép/từ chối vị trí; lỗi hoặc không hỗ trợ; bản đồ không tải vẫn dùng list/đặt sân được. |
| Đặt sân | CTA gọi đúng `openBooking(court.id)`, giữ draft, wizard, kiểm tra xung đột, giữ chỗ và checkout hiện tại. | Đi từ card tới booking với sân đúng; quay lại play không mất session; lỗi/loading vẫn hiện. |
| Card phòng | Tên, môn, thể thức, trình độ, host, sân/địa chỉ/khoảng cách, ngày/giờ, thành viên/sức chứa, giá. | Dữ liệu dài, đủ/chưa đủ người; không cắt mất trạng thái hoặc CTA. |
| Tham gia/rời phòng | Xin tham gia, chờ duyệt, hủy yêu cầu, đã tham gia và rời phòng. Phòng đầy/trùng giờ/demo giữ disabled và lý do. | Host/người chơi khác nhau, cập nhật sau duyệt/từ chối; hover/focus và thao tác mobile đều rõ. |
| Ghép nhanh | Dialog chọn sân, khoảng cách, ngày, thể thức, trình độ; chạy search; dock tìm kiếm/ready, hủy/dismiss và mở manager. | Giữ hành vi ghép nhanh hiện tại, kể cả phần mô phỏng; không thay bằng engine mới. Đổi tab/route khi search chạy không reset state. |
| Tạo phòng | Tên, môn hiện hỗ trợ, thể thức, sức chứa, sân, ngày/giờ, trình độ, ghi chú; quota và validation xung đột. | Sai thứ tự giờ, slot bị chiếm, vượt quota, form lỗi và tạo thành công; close/reset như hiện tại. |
| Quản lý phòng | Pill, đổi phòng active, trạng thái đã/chưa có sân; duyệt/từ chối, mời, loại thành viên, đổi sức chứa, đặt sân cho phòng, xem profile, mở chat, hủy phòng/rời và confirmation. | Pill có mặt ở hai tab; dock `openManager()` mở sheet đúng; các quyền host/member/pending và chat hiện tại vẫn đúng. |
| Điều hướng/tài khoản | Thông báo, locale, account, logout, link chủ sân/admin theo quyền; các lối vào profile/workspace mà sidebar hiện cung cấp. | Lập checklist sidebar và menu mới; chuyển các mục còn thiếu sang menu phù hợp trước khi bỏ sidebar ở play. |

Không đổi endpoint, payload, polling/timers, optimistic updates, giới hạn phòng, điều kiện tham gia hoặc cấu trúc session để phục vụ styling. Không thêm dữ liệu mẫu, số đếm cố định hoặc nút không có handler.

## 4. Trình tự triển khai

### A. Baseline và shell

1. Đọc diff đang có và guide Next.js. Chụp `/vi/app`, `/vi/app/play` hai tab, dialogs, sheet và dock trên desktop/mobile bằng phiên đăng nhập; ghi lại state và đường đi của từng mục trong ma trận.
2. Thêm đúng route play vào nhánh player surface trong `dashboard-frame.tsx`, nhánh header xanh trong `topbar.tsx` và light dashboard trong `theme-provider.tsx`. Active nav là `play`; menu mobile cũng có `aria-current`/style active. Giữ shell của book, venue, admin và các route khác.
3. Bố trí `ActiveRoomPill` trong vùng toolbar chung của `PlayView`, ngoài conditional panel, không render thêm bản thứ hai ở topbar cho play. Kiểm tra sheet và dock còn hoạt động sau khi chuyển shell; chuyển các lối vào sidebar cần giữ sang menu.

### B. Nội dung và overlays

4. Thêm `.player-play`/overlay tokens trong `globals.css`. Restyle tiêu đề, segmented tabs, `SportFilter` và CTA rooms trong `play.tsx`; chuỗi mới thêm vào `vi.json`/`en.json`.
5. Restyle map/list/search/sort và `CourtCard` trong `find-courts.tsx`: map bo góc, card trắng, CTA neon, selection xanh; giữ handlers và dữ liệu. Dùng `CourtMap forceDark` hiện có để giống home, không đổi mặc định `CourtMap` dùng ở nơi khác.
6. Restyle `RoomsView`/`RoomCard` trong `match-maker.tsx`: ưu tiên tên phòng và giờ chơi; thông tin phụ gọn; thành viên/giá và trạng thái dễ đọc. Giữ đủ nhánh requested/joined/full/conflict/demo.
7. Đồng bộ `match-maker-dialogs.tsx`, `ActiveRoomPill`/sheet trong `active-room.tsx`, profile mở từ sheet, confirmation và `MatchmakingDock` trong `matchmaking.tsx`. Các component này dùng trên nhiều route: scope/variant theo play, không áp palette mới toàn app. Kiểm tra cả Select/Menu/Dialog lồng nhau qua portal.
8. Giữ booking wizard và payment route hiện tại; chỉ sửa điểm gọi hoặc style tại play nếu cần. Không kéo remake toàn bộ wizard vào plan này.

### C. Responsive và kiểm tra

9. Kiểm tra 360, 390, 768, 1024, 1440px; toolbar wrap, nhãn CTA, tên/địa chỉ dài, focus ring, map controls, dialog/sheet và dock. Không overflow ngang, không cuộn lồng nhau trên mobile hoặc để dock che card/CTA cuối; bổ sung khoảng trống dưới khi dock hiện.
10. Smoke test toàn bộ ma trận bằng tài khoản host/member; cả `vi`/`en`, deep link rooms, refresh, click và back/forward giữa home/play/chat/bookings/book. Kiểm tra riêng venue/admin và bản đồ home để phát hiện style/theme rò sang route khác.
11. Chạy trong `web`: `npm run typecheck`, ESLint các file đã sửa, `npm test`, `npm run build`; chạy `git diff --check` từ root. Chỉ thêm test nếu thay đổi hành vi cần bảo vệ; không tạo test chỉ kiểm tra class CSS. Nếu có lỗi baseline, ghi rõ lỗi có trước cùng kết quả kiểm tra phần sửa.
12. So ảnh với home và ảnh play baseline; lưu bằng chứng, checklist kết quả và cập nhật trạng thái plan khi hoàn tất. Smoke test chưa thực hiện phải ghi rõ, không đánh dấu đạt bằng kết quả build.

## 5. File dự kiến tác động

- Shell/theme: `web/features/dashboard/dashboard-frame.tsx`, `topbar.tsx`, `web/components/theme-provider.tsx`.
- Trang play: `web/features/play/play.tsx`, `find-courts.tsx`, `match-maker.tsx`.
- Overlays/chrome: `web/features/play/match-maker-dialogs.tsx`, `active-room.tsx`, `matchmaking.tsx`; `web/features/dashboard/profile-dialog.tsx`, `sport-filter.tsx` hoặc menu header nếu cần variant/scope.
- Tokens/nội dung: `web/app/globals.css`, `web/messages/vi.json`, `en.json`.
- `session.tsx`, session actions, API và payment logic giữ nguyên; route `app/[locale]/app/play/page.tsx` chỉ cần sửa nếu thật sự có yêu cầu mới ngoài styling.

## 6. Tiêu chí hoàn tất

- Play có header xanh chung, không sidebar desktop, nền trắng, font Geist, CTA neon và card cùng ngôn ngữ thiết kế home.
- Hai tab và toàn bộ ma trận chức năng hoạt động như baseline; không mất pill/manager, lối vào tài khoản, thông báo hoặc workspace khi thay shell.
- Map/list liên kết đúng, bản đồ và danh sách dùng được ở desktop/mobile; nội dung dài không che nút, dock không che thao tác cuối.
- Dialog, sheet, dropdown, confirmation và trạng thái lỗi/disabled rõ trên nền mới, dùng được bằng bàn phím và cảm ứng.
- Shared state sống qua điều hướng theo lifecycle hiện tại; home/chat/bookings/book/venue/admin không bị hồi quy style hoặc theme.
- Typecheck, lint, test, build và kiểm tra trình duyệt có kết quả được ghi nhận; các giới hạn kiểm thử được nêu rõ.
