# Plan 023: Restyle lịch đặt sân theo `/app` và `/app/chat`

- **Trạng thái:** TODO — chỉ lập kế hoạch, chưa triển khai giao diện.
- **Route:** `/[locale]/app/bookings`, gồm `vi` và `en`.
- **Mục tiêu:** Đưa trang lịch đặt sân vào cùng ngôn ngữ thiết kế và điều hướng với trang chủ và chat người chơi: header xanh, nền nội dung trắng, chữ xanh đen, điểm nhấn xanh dương/neon, card bo tròn và khoảng cách thoáng.
- **Phạm vi:** Shell của route bookings, phần tổng quan, lịch Ngày/Tuần/Tháng, chi tiết lịch đặt, lịch sử và trạng thái rỗng. Giữ các hành vi đặt sân, thanh toán, hủy và chat đang có.

## 1. Căn cứ thiết kế và hiện trạng

Plan lấy code hiện tại làm baseline; không lấy mô tả light/dark cũ trong plan 022 làm nguồn thiết kế.

| Vùng | Hiện trạng đã kiểm tra | Hướng restyle |
|---|---|---|
| Shell | `DashboardFrame` chỉ bỏ sidebar ở `/app` và `/app/chat`; bookings còn sidebar, topbar trung tính và padding mặc định. | Bookings dùng header xanh chung và nội dung toàn chiều rộng, không có sidebar desktop. |
| Header | `DashboardTopbar` có logo, 4 link chính, thông báo, locale và menu tài khoản trên home/chat. Link bookings đã tồn tại. | Mở rộng header đó sang bookings; active đúng mục Lịch đặt sân trên desktop và trong menu mobile. |
| Trang chủ | Nội dung hiện là nền trắng, chữ `#0b1224`, xanh `#2046ed`, neon `#a5ff12`; bản đồ được ép style tối riêng. | Dùng nền trắng và màu thương hiệu cho bookings. Bản đồ tối là ngoại lệ của home, không phải yêu cầu nền tối cho bookings. |
| Chat | `.player-chat` và `.player-chat-dialog` có bề mặt trắng, nền phụ xám nhạt, chữ `#142050`, xanh `#2046ed`. | Dùng cùng nhịp viền, màu chữ và bề mặt; neon chỉ cho CTA hoặc điểm nhấn chọn lọc. |
| Theme | `ThemeProvider` đang ép dark cho dashboard, riêng chat ép light. Home có màu trắng được đặt trực tiếp. | Bookings được khóa light như chat; không bổ sung nút hoặc phím tắt đổi chế độ. |
| Nội dung | `BookingsView` có 4 chỉ số, lịch mặc định Tuần, chuyển Ngày/Tuần/Tháng, lịch sử. Booking event mở popover và có các hành động theo trạng thái. | Giữ cấu trúc chức năng, đổi thứ bậc thị giác và cách trình bày. |
| CTA | “Đặt sân mới” hiện thuộc `SectionActions` ở topbar trung tính và gọi `openPlay()`. | Đặt CTA trong phần tiêu đề nội dung bookings khi chuyển sang header xanh, giữ đúng hành vi `openPlay()`. |
| Lịch dùng chung | `CalendarToolbar`, `Timeline`, `MonthGrid` trong `calendar-ui.tsx` được dùng cả ở wizard đặt sân và lịch chủ sân. | Style bookings qua scope hoặc variant tùy chọn; mặc định của các nơi khác phải giữ nguyên. |

Workspace đã có nhiều thay đổi chưa commit, gồm home, chat, theme, shell và bản dịch. Khi triển khai phải đọc lại diff hiện tại và chỉ bổ sung các thay đổi cần cho plan này.

## 2. Thiết kế mục tiêu

### Shell và bố cục

1. Dùng cùng header xanh cao 88px với home/chat, font Geist, logo và menu tài khoản hiện có. Giữ thông báo, locale, quyền truy cập menu chủ sân/admin.
2. Nội dung bookings có nền trắng, container `max-w-6xl` căn giữa như home; padding ngang 20px trên mobile và tăng theo viewport. Phần nội dung cuộn theo trang, không khóa toàn bộ trang như chat.
3. Mở đầu bằng tiêu đề “Lịch đặt sân”, một dòng mô tả ngắn và CTA “Đặt sân mới”. Desktop đặt CTA bên phải; mobile xếp xuống dòng, nhãn luôn đọc được.
4. Bên dưới là 4 ô tổng quan, khu lịch lớn, rồi lịch sử. Desktop 4 ô một hàng; mobile 2 × 2. Không thêm biểu đồ hoặc chỉ số không có dữ liệu.

```text
┌──────────────── Header xanh chung, mục Lịch đặt sân active ────────────────┐
│                                                                          │
│   Lịch đặt sân + mô tả                              [Đặt sân mới]         │
│   [Sắp tới]       [Đã xác nhận]      [Chờ duyệt]       [Lịch sử]           │
│                                                                          │
│   ┌──────────── Lịch đặt sân, bo góc và viền xanh nhẹ ──────────────────┐  │
│   │ [Trước] [Hôm nay] [Sau]  Khoảng ngày       [Ngày | Tuần | Tháng]    │  │
│   │ Header ngày + lưới thời gian hoặc lưới tháng                       │  │
│   │ Sự kiện theo trạng thái; bấm mở chi tiết và thao tác               │  │
│   │ Chú giải trạng thái                                              │  │
│   └───────────────────────────────────────────────────────────────────┘  │
│   Lịch sử: các hàng có ngày/giờ, sân, người chơi, trạng thái, Đặt lại      │
└──────────────────────────────────────────────────────────────────────────┘
```

### Màu và component

Định nghĩa scope `.player-bookings` và `.player-bookings-overlay` cho nội dung và các popup render qua portal. Tái sử dụng giá trị từ home/chat, tránh selector áp dụng lên toàn bộ calendar hoặc UI chung.

| Vai trò | Màu/hình thức mục tiêu |
|---|---|
| Nền trang và card | `#ffffff`; nền phụ `#f1f3f5`. |
| Chữ chính/phụ | `#142050` / `#596783`. |
| Màu thương hiệu | `#2046ed`; hover đậm hơn `#173bc8`. |
| Viền và hover nhẹ | `#e5e7eb`; vùng được chọn dùng `#e8f0fe` hoặc `#d6e4ff`. |
| CTA chính | Pill neon `#a5ff12`, chữ xanh đen; hover rõ, focus ring xanh. |
| Card/container | Bo 24–32px, viền mảnh hoặc viền xanh cho khu lịch, bóng rất nhẹ. |
| Chỉ số | Nhãn dễ đọc, số lớn, không dùng nhãn mono viết hoa nhỏ như hiện tại. Một ô nhấn xanh được phép; không tô mỗi ô một màu khác nhau. |

Lịch giữ lưới trung tính và event có nền nhạt, vạch/viền màu dễ nhận biết. Trạng thái xác nhận dùng xanh; chờ duyệt dùng vàng/hổ phách; đã hoàn thành dùng xám; đã hủy dùng đỏ và nhãn/gạch ngang hiện có. Neon dùng đánh dấu hôm nay hoặc CTA, tránh phủ cả lưới. Phân biệt chưa thanh toán với chờ duyệt bằng nhãn, không chỉ bằng màu.

### Lịch, chi tiết và lịch sử

- Toolbar dùng nút tròn/pill đồng bộ header; tab active xanh với chữ trắng. Giữ previous/next/Today, tiêu đề kỳ và live indicator.
- Timeline giữ gutter giờ và header ngày sticky, auto-scroll tới thời điểm hiện tại, vị trí và chiều cao event theo thời lượng. Không đổi `PX_PER_MIN`, phép tính ngày, khoảng trống hay cách phân nhóm event chỉ để đổi style.
- Lưới tháng giữ giới hạn chip, dấu chấm mobile và số booking còn lại; bấm ngày vẫn chuyển sang view Ngày.
- Popover có tên sân, ngày/giờ, môn chơi, avatar, trạng thái, thanh toán và thao tác theo quyền hiện có. Popup dùng màu trắng/xanh kể cả khi nằm ngoài `.player-bookings` do portal.
- AlertDialog hủy dùng cùng bề mặt và chữ của trang; thao tác hủy vẫn dùng màu đỏ. Giữ nội dung xác nhận riêng cho lịch solo/nhóm.
- Hàng lịch sử dùng date tile xanh như phần lịch đặt ở home, nội dung gọn, trạng thái/kết quả rõ và nút Đặt lại. Dùng ngày và giờ thật của booking; không biến giờ bắt đầu thành số ngày.
- Empty state có lời giải thích và CTA thực: lịch kỳ này chưa có booking, chưa có lịch sử, chưa có booking nào. Không dùng booking mẫu hay số đếm trang trí.

## 3. Các bước triển khai

1. **Chốt baseline:** mở home/chat/bookings với tài khoản có dữ liệu; ghi ảnh desktop/mobile và cấu trúc DOM hiện tại. Xem lại diff chưa commit và guide Next.js trong `web/node_modules/next/dist/docs/`, nhất là layouts/pages và CSS, trước khi sửa shell hoặc routing.
2. **Mở rộng shell:** thêm nhánh bookings trong `dashboard-frame.tsx`, dùng header xanh trong `topbar.tsx`, tính active key từ route thay vì mặc định home. Bảo đảm chỉ các route home/player chat/bookings dùng shell này; các trang chủ sân/admin còn đúng menu và bố cục.
3. **Chuyển CTA:** đưa “Đặt sân mới” vào phần tiêu đề `BookingsView` hoặc tái sử dụng `NewBookingAction` qua export có chủ đích. Giữ lời gọi `openPlay()`. Điều chỉnh registry/comment trong `section-actions.tsx` để không còn CTA bị render trùng hoặc bị bỏ mất.
4. **Khóa palette:** thêm bookings vào nhóm route light trong `theme-provider.tsx`. Định nghĩa token scoped cho nội dung và overlay; tránh chỉnh token `:root` hoặc `.dark` toàn app.
5. **Restyle nội dung:** cập nhật `SummaryChip`, container lịch, `CalendarEvent`, `MonthDay`, `FreeBand`, `LegendDot`, `StatusBadge`, `BookingCard`. Thay màu `brand/chart` cũ bằng vai trò thương hiệu/trạng thái của bookings; giữ logic dữ liệu và action handler.
6. **Calendar dùng chung:** ưu tiên override CSS variables trong scope. Nếu toolbar/lưới cần khác về class hoặc markup, thêm variant `playerBookings` tùy chọn trong `calendar-ui.tsx`; prop không truyền phải giữ giao diện và hành vi hiện tại của wizard/chủ sân. Không fork phép tính lịch.
7. **Overlay và bản dịch:** áp scope lên `PopoverContent` và `AlertDialogContent` qua class; kiểm tra cả nested portal. Thêm chuỗi tiêu đề/mô tả/empty CTA vào `vi.json` và `en.json` nếu chưa có; tái sử dụng `Bookings`, `Calendar`, `Common`, `Nav`.
8. **Responsive và nghiệm thu:** chạy kiểm tra code, kiểm tra trên trình duyệt với dữ liệu thật, so sánh cạnh home/chat và ghi kết quả vào plan khi triển khai xong.

## 4. File dự kiến

| File | Thay đổi |
|---|---|
| `web/features/booking/bookings.tsx` | Tiêu đề/CTA, summary, event/popover/dialog, lịch sử và empty state. |
| `web/features/dashboard/dashboard-frame.tsx` | Shell bookings không sidebar, padding và vùng cuộn đúng. |
| `web/features/dashboard/topbar.tsx` | Header xanh và active nav bookings. |
| `web/features/dashboard/section-actions.tsx` | Tái sử dụng hoặc chuyển nơi render CTA, tránh trùng. |
| `web/components/theme-provider.tsx` | Palette cố định cho bookings. |
| `web/app/globals.css` | Token nội dung/overlay scoped. |
| `web/features/booking/calendar-ui.tsx` | Chỉ khi cần variant trình bày; giữ default. |
| `web/messages/vi.json`, `web/messages/en.json` | Các chuỗi mới với key tương ứng. |

`web/app/[locale]/app/bookings/page.tsx` hiện chỉ trả về `BookingsView` và metadata; thường không cần sửa. `booking.tsx`, `calendar.ts`, `session.tsx`, API và schema không nằm trong phạm vi restyle.

## 5. Các hành vi phải giữ

- View mặc định Tuần, Ngày/Tuần/Tháng, đổi kỳ, Hôm nay, giờ hiện tại, click ngày ở tháng và click khoảng trống để đặt sân.
- Refresh seed khi vào trang và đồng bộ lịch sau chủ sân duyệt/từ chối.
- Tiếp tục thanh toán và trạng thái đang mở thanh toán; countdown, hết hạn, chờ duyệt, lý do từ chối và thông báo hoàn tiền.
- Nhắn chủ sân phải mở đúng `/app/chat?channel=<id>`; trạng thái lỗi/đang mở vẫn rõ.
- Thêm người chơi, hủy solo/nhóm, Đặt lại, avatar, kết quả thắng/thua và tỷ số.
- Thống kê phải bám dữ liệu hiện tại. Code đang gọi nhãn “thisWeek” nhưng lọc mọi ngày từ hôm nay, còn `played` đếm mọi lịch trước hôm nay. Ghi nhận đây là vấn đề ngữ nghĩa riêng; không âm thầm đổi phép tính trong đợt restyle. Nếu dùng nhãn mô tả chính xác hơn thì cập nhật cả hai locale và ghi rõ trong kết quả.

## 6. Responsive và kiểm tra

- Kiểm tra 390, 768, 1024, 1440px: container không tràn ngang, tiêu đề/CTA không đè nhau, nhãn tiếng Anh dài vẫn đọc được.
- Mobile dùng menu header chung; không để lại nút mở sidebar vô tác dụng. Timeline Tuần được cuộn ngang trong chính vùng lịch, gutter/header sticky đúng; view Ngày và Tháng vẫn sử dụng được. Các nút thao tác có vùng chạm tối thiểu 44px khi không bị giới hạn bởi event ngắn.
- Event ngắn/dài, tên sân dài, nhiều event, nhiều lịch sử, trạng thái rỗng; popover gần mép viewport và AlertDialog trên mobile không bị clip.
- Kiểm tra điều hướng `/app` ↔ `/app/bookings` ↔ `/app/chat`, mở chat từ booking, back/forward và refresh. Không còn nhấp nháy màu tối, header/sidebar trùng hoặc style bookings rò sang route khác.
- Smoke test thanh toán bằng môi trường test hiện có, hủy, đặt lại, thêm người và mở chat; kiểm tra disabled/loading. Không phát sinh giao dịch thật để kiểm thử restyle.
- Kiểm tra lịch dùng chung ở wizard đặt sân và `/app/venue/[venueId]/schedule` sau mọi thay đổi `calendar-ui.tsx`; kiểm tra cả locale `vi`/`en`.
- Chạy trong `web`: `npm run typecheck`, ESLint các file sửa, `npm run build`; sau đó `git diff --check`. Không thêm unit test chỉ để xác nhận class CSS; nếu phải đổi logic ngoài trình bày, tách và kiểm thử rủi ro cụ thể đó.
- Nếu thiếu phiên đăng nhập hoặc dữ liệu để kiểm tra trực quan, ghi rõ phần chưa kiểm tra; không ghi đã đạt chỉ dựa trên typecheck/build.

## 7. Tiêu chí hoàn thành

- Home, chat và bookings có cùng header xanh, font, nhịp bo góc và màu thương hiệu; bookings có bề mặt trắng rõ ràng, không bị theme hệ điều hành hoặc lựa chọn cũ làm đổi màu.
- Mục Lịch đặt sân active đúng trên desktop/mobile, menu tài khoản/thông báo/locale sử dụng được, CTA Đặt sân mới xuất hiện một lần.
- Lịch và lịch sử dễ đọc, các trạng thái phân biệt bằng nhãn lẫn màu; mọi action hiển thị vẫn hoạt động với dữ liệu thật.
- Không hồi quy phép tính lịch, luồng thanh toán/hủy/chat, providers, wizard đặt sân và lịch chủ sân.
- Ảnh desktop/mobile và kết quả các kiểm tra được ghi nhận; các giới hạn kiểm tra còn lại được nêu cụ thể.

## Ghi nhận triển khai

- **Shell:** `dashboard-frame.tsx` thêm nhánh `bookings` — ẩn sidebar, `main` nền trắng cuộn dọc; `topbar.tsx` mở rộng header xanh cho `/app/bookings` với mục Lịch đặt sân active; `theme-provider.tsx` khóa `light` cho `/app/bookings`.
- **CTA:** `NewBookingAction` được export từ `section-actions.tsx` và render trong tiêu đề `BookingsView` (pill lime, chữ xanh đen); registry `bookings` đổi thành `() => null` nên không còn render trùng ở topbar.
- **Palette:** thêm scope `.player-bookings` / `.player-bookings-overlay` trong `globals.css` (nền trắng, nền phụ `#f1f3f5`, chữ `#142050`/`#596783`, thương hiệu `#2046ed`, viền `#e5e7eb`). `PopoverContent` và `AlertDialogContent` nhận class overlay để portal cũng sáng.
- **Nội dung:** thêm tiêu đề + mô tả + CTA; `SummaryChip` bỏ nhãn mono viết hoa, một ô nhấn xanh; container lịch bo 32px viền xanh nhẹ; `CalendarEvent`/`MonthDay`/`LegendDot` theo accent trạng thái (xác nhận xanh, chờ duyệt hổ phách, đã xong xám, đã hủy đỏ); `StatusBadge` chờ duyệt hổ phách, chưa thanh toán vẫn tách nhãn; `BookingCard` dùng date tile xanh như home, thêm empty state cho lịch sử.
- **Calendar dùng chung:** thêm prop tùy chọn `switcherAccent` (ViewSwitcher/CalendarToolbar); không truyền thì wizard đặt sân và lịch chủ sân giữ nguyên.
- **Đã chạy:** `tsc --noEmit`, ESLint các file sửa, `npm run build` (Next 16 tách `.next/dev` nên build không làm gián đoạn phiên dev — server vẫn trả 200), Prettier, `git diff --check` — đạt.
- **Chưa kiểm tra:** trực quan trong trình duyệt với dữ liệu thật (cần phiên Clerk) — các viewport 390/768/1024/1440, so sánh cạnh home/chat và smoke test thanh toán/hủy/đặt lại cần thực hiện trong môi trường có phiên đăng nhập.

