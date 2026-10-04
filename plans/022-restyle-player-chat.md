# Plan 022: Restyle chat người chơi theo ảnh tham chiếu

## Mục tiêu và phạm vi

- **Trạng thái:** Đã triển khai phần bố cục và restyle chat người chơi. Tìm kiếm/tab hội thoại cần một thiết kế truy vấn Stream riêng; không hiển thị điều khiển giả.
- **Đích:** `/[locale]/app/chat` (gồm `vi`, `en` và `?channel=<id>`). Dùng `image/chat-restyle.png` làm tham chiếu cho bố cục, nhịp khoảng cách, màu và trạng thái. Giữ thương hiệu, dữ liệu và nhãn thực tế của Shuttio trong ứng dụng.
- **Kết quả mong muốn:** Trên desktop là một khung làm việc ba vùng: thanh điều hướng ứng dụng, danh sách hội thoại, hội thoại đang mở. Khi rời chat sang trang khác hoặc quay lại, shell ứng dụng, chiều cao màn hình, điều hướng và vùng cuộn của trang đích vẫn hoạt động đúng.
- **Ranh giới:** Chỉ sửa trình bày chat người chơi và phần shell cần thiết cho route này. Không đổi API, Stream Chat, quyền truy cập, dữ liệu, luồng gửi tin, AI chat hay giao diện `/app/venue/[venueId]/messages`.

## Hiện trạng đã kiểm tra

1. `web/features/dashboard/dashboard-frame.tsx` đang coi `/app/chat` như trang chủ: ẩn `AppSidebar`, dùng `DashboardTopbar` cao 88px và `main` full bleed. Điều này trái với ảnh, nơi sidebar là cột trái của khung chat.
2. `web/features/dashboard/topbar.tsx` dùng header xanh cho cả `/app` và `/app/chat`. `AppSidebar` hiện có link chat, active state theo route, badge chưa đọc và menu tài khoản. Không cần tạo một bộ điều hướng khác chỉ để giống ảnh.
3. `web/features/chat/chat.tsx` có hai pane danh sách/hội thoại, một pane trên mobile, và dùng chung `ChatView` cho hộp thư chủ sân. `ChannelListHeader` đã chứa CTA tạo chat; `NewChatDialog` có luồng tạo DM/nhóm.
4. `web/app/globals.css` có token `.player-chat` xanh dương/neon theo style cũ. Các thành phần chat đang dùng token này hoặc token toàn cục. `Composer` hiện chỉ gửi văn bản; ảnh tham chiếu có nút gọi, video, đính kèm, emoji nhưng các khả năng đó chưa được xác nhận trong UI hiện tại.
5. `web/app/[locale]/app/chat/page.tsx` chỉ truyền `searchParams.channel` vào `ChatView`; không cần đổi URL. Layout chung trong `web/app/[locale]/app/layout.tsx` giữ các provider qua điều hướng. Guide Next.js trong `web/node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md` xác nhận shared layout được giữ khi chuyển trang; cần xử lý khác biệt theo route tại shell mà không làm rò style sang route khác.
6. Workspace đang có thay đổi ở `.commandcode/taste/taste.md` và `.gitignore`; không chạm vào các file đó khi thực hiện plan.

## Đọc ảnh tham chiếu thành yêu cầu UI

| Vùng | Chi tiết cần thể hiện | Ràng buộc |
|---|---|---|
| Khung tổng thể | Nền ngoài sáng rất nhạt; bề mặt chat trắng, bo góc lớn, viền mảnh và bóng nhẹ. Ba vùng được ngăn bằng viền dọc nhẹ. | Khung nằm trong `SidebarInset` hiện có, không thêm card lồng nhiều lớp hoặc gây tràn viewport. |
| Điều hướng trái | Logo ở trên, mục Trò chuyện active với nền xanh bạc hà và vạch xanh; các mục khác và tài khoản ở cuối. | Tái dùng `AppSidebar`/`Nav` và quyền hiện có. Giữ độ rộng, cơ chế thu gọn, mobile drawer của sidebar chung; chỉ scope phần trang trí cho route chat. Không sao chép nhãn hay menu từ ảnh nếu app không có route tương ứng. |
| Danh sách giữa | Tiêu đề “Trò chuyện”, nút tạo mới xanh lá, ô tìm kiếm, tab Tất cả/Nhóm/Cá nhân, hàng chat có avatar, preview, thời gian, badge chưa đọc, trạng thái active xanh nhạt. | Cột khoảng 300–340px ở desktop nếu không gian cho phép. Search/tab phải lọc dữ liệu thật và làm việc với phân trang Stream; nếu chưa triển khai logic trong cùng đợt thì không render điều khiển giả. |
| Hội thoại phải | Header có avatar, tên và trạng thái; các nút hành động tròn; vùng tin thoáng, date pill giữa, bubble nhận xám nhạt, bubble gửi xanh bạc hà nhạt, timestamp và read receipt; composer pill ở đáy với nút gửi xanh. | Chỉ hiển thị search/gọi/video/đính kèm/emoji khi có hành vi thật; không biến icon trang trí thành nút bấm không hoạt động. Giữ avatar, tên và nội dung thật từ Stream. |
| Màu và chữ | Trắng/xám rất nhạt làm nền, chữ xanh đen, xanh ngọc/xanh lá cho active, online, badge và gửi; bo góc mềm, icon nét mảnh. | Màu được định nghĩa trong `.player-chat` cho light/dark, tương phản đủ đọc. Không đổi token toàn app hoặc áp màu xanh header cũ lên ảnh mới. |

Sơ đồ desktop mục tiêu (cột trái là shell chung, hai cột phải thuộc chat):

```text
┌───────────────────────────────────────────────────────────────┐
│ AppSidebar │ Danh sách hội thoại │ Hội thoại đang chọn         │
│ logo/nav   │ tiêu đề + tạo mới   │ header + trạng thái         │
│           │ tìm/lọc             │ lịch sử tin (cuộn riêng)    │
│ tài khoản  │ các hàng (cuộn)     │ composer neo ở đáy          │
└───────────────────────────────────────────────────────────────┘
```

## Quyết định về bố cục khi chuyển trang

1. `DashboardFrame` cần nhánh route rõ ràng: `home`, `playerChat`, `other`. Chỉ `playerChat` hiện `AppSidebar` và ẩn topbar xanh; `home` giữ layout hiện tại; `other` giữ sidebar, topbar và padding hiện tại. Không sửa chiều rộng mặc định của sidebar hoặc `SidebarInset` toàn ứng dụng.
2. Đặt chat trong vùng nội dung còn lại của shell: `h-svh`, `min-h-0`, `min-w-0`, `overflow-hidden` xuyên suốt `SidebarInset` → `main` → `ChatShell`. Chỉ danh sách và lịch sử tin cuộn; header từng cột và composer cố định trong cột. Không dùng `position: fixed` cho composer hay chiều cao tính cứng theo header cũ.
3. Dùng một lớp scope theo route cho điều hướng chat nếu cần active style giống ảnh. `AppSidebar` vẫn là component chung; style route khác không bị ảnh hưởng. Trên mobile sidebar mở bằng drawer/trigger của ứng dụng, còn chat giữ cơ chế một pane tại một thời điểm. Tránh để sidebar, list và conversation cùng chen ngang ở 768px.
4. Khi chuyển `/app/chat` ↔ `/app`, `/app/play`, `/app/bookings`, shell có thể đổi kiểu theo route nhưng không để lại padding, nền, sidebar hoặc topbar của chat trên trang đích. Với deep link `?channel=...`, refresh và back/forward, pane và active route phải đúng; không ép remount provider Stream hay mất trạng thái điều hướng ngoài ý muốn.

## Kế hoạch triển khai

### A. Baseline và shell

1. Chụp trạng thái hiện tại ở desktop/mobile cho `/vi/app`, `/vi/app/chat`, `/vi/app/play`, `/vi/app/bookings`, `/vi/app/venue/[venueId]/messages`; kiểm tra light/dark và `/en/app/chat`. Ghi kích thước thực tế của sidebar, inset, viewport và các điểm gãy responsive.
2. Đọc lại guide Next.js liên quan trong `web/node_modules/next/dist/docs/` trước khi sửa code routing/layout theo `AGENTS.md`. Sửa `dashboard-frame.tsx` theo quyết định ba nhánh ở trên. Trong `topbar.tsx`, bỏ riêng `/app/chat` khỏi nhánh header xanh; đảm bảo chat không nhận một topbar trung tính thừa và các route khác giữ hành vi cũ.
3. Chỉnh class route chat của `AppSidebar`/`SidebarInset` nếu cần để đạt bề mặt trắng, viền, bo góc và active state của ảnh. Giữ menu tài khoản, unread badge, locale/theme/notification ở nơi có thể truy cập; nếu ẩn topbar chat thì bố trí lại các điều khiển cần thiết trong chrome có sẵn, không để tính năng biến mất.

### B. Hai cột chat và component

4. Đổi token `.player-chat` từ xanh dương/neon sang bảng màu trắng, xám, xanh bạc hà; khai báo dark mode tương ứng. Xóa dấu vết style cũ chỉ trong player chat. Dùng token hoặc CSS scoped thay cho selector Stream toàn cục.
5. Trong `chat.tsx`, làm hai pane co giãn đúng bên cạnh sidebar: list có chiều rộng mục tiêu nhưng không đẩy conversation ra ngoài màn hình; conversation `min-w-0`. Restyle header hội thoại, trạng thái chưa chọn/đang kết nối/lỗi. Giữ `venueInboxId` làm ranh giới để hộp thư chủ sân không đổi giao diện.
6. Trong `channel-list.tsx`, restyle đầu danh sách, CTA, hàng active/hover/unread, menu xóa/rời nhóm và loading/error/empty. Bổ sung search/tab chỉ sau khi xác định truy vấn Stream và phân trang có thể lọc đúng; tính count từ dữ liệu đáng tin cậy, không dùng số cố định theo ảnh. Nếu chưa đủ điều kiện, hoàn thành phần còn lại của restyle và ghi rõ search/tab là hạng mục chức năng tiếp theo.
7. Trong `message.tsx`, `list-chrome.tsx`, `composer.tsx`, restyle bubble, nhóm tin, date pill, typing/unread, read receipt và composer theo ảnh. Giữ quote, reaction, xóa, tệp hiện có, Enter/Shift+Enter, typing event và trạng thái frozen. Không thêm icon search/gọi/video/plus/ảnh/emoji khi chưa có hành vi thực; nếu chức năng đã tồn tại ở nơi khác, nối đúng hành vi và trạng thái disabled.
8. Restyle `new-chat-dialog.tsx` nếu cần để thống nhất với CTA và palette. Chỉ thêm chuỗi mới qua `web/messages/vi.json` và `en.json`, không hardcode tiếng Việt. Avatar vẫn ưu tiên ảnh thật, fallback chữ cái.

### C. Responsive và kiểm tra hồi quy

9. Kiểm tra 360, 390, 640, 768, 1024, 1440px: sidebar/drawer không đè composer; dưới ngưỡng đủ rộng chỉ hiện list hoặc conversation; nút quay lại ít nhất 44px; safe area và bàn phím ảo không che input. Kiểm tra chuỗi dài, tên dài, nhiều tin, ảnh/tệp, dialog và menu mở gần mép màn hình.
10. Chạy typecheck, lint các file sửa và build. Smoke test tạo DM/nhóm, gửi tin, phản ứng, xóa/rời nhóm, unread, profile, room frozen, Stream loading/error, deep link `?channel=...`, chuyển route bằng click/back/forward và refresh.
11. So sánh ảnh mới với tham chiếu tại desktop, sau đó kiểm tra lại các trang đích `/app`, `/app/play`, `/app/bookings`, `/app/venue/[venueId]/messages`, cả light/dark và `vi`/`en`. Dừng chỉnh khi đã xác minh không có overflow ngang, khoảng trắng dư, topbar trùng hoặc style chat rò sang trang khác.

## Tiêu chí nghiệm thu

- Desktop hiển thị ba vùng với tỷ lệ hợp lý; sidebar chung, list và conversation khớp tinh thần ảnh. Active nav và active channel phân biệt rõ. Khu vực lịch sử và list cuộn độc lập, composer luôn thấy được.
- Chuyển vào/ra chat không làm hỏng shell của trang đích: không còn sidebar/topbar kép, không còn padding/nền chat trên trang khác, không mất lối vào thông báo, theme, locale và tài khoản.
- Mobile dùng một pane chat và sidebar drawer; deep link vào hội thoại và nút quay lại hoạt động. Không tràn ngang tại các viewport kiểm tra.
- Mỗi control hiển thị đều hoạt động với dữ liệu thật hoặc có disabled state rõ; không có số đếm, chat mẫu hay icon chức năng giả lấy từ ảnh.
- `vi`/`en`, light/dark, hộp thư chủ sân và các hành vi Stream hiện có không hồi quy; typecheck, lint, build và smoke test đạt.

## Ghi nhận triển khai

- Đã dùng `AppSidebar` trong route chat, bỏ header xanh ở route đó, giữ layout cũ cho trang chủ và các trang còn lại. Chat người chơi dùng token trắng/xám/xanh bạc hà; hộp thư chủ sân giữ variant trung tính.
- Chat chuyển sang một pane dưới `lg`, có nút mở sidebar ở danh sách, hội thoại, trạng thái trống và trạng thái kết nối trên mobile. Deep link không mở được channel đưa người dùng về danh sách.
- Đã restyle list, bubble, marker, composer, dialog tạo chat và active nav; không thêm nút gọi/video/đính kèm/emoji khi chưa có hành vi thật.
- Đã chạy typecheck, ESLint các file liên quan, `next build` và `git diff --check`. Smoke test có đăng nhập trên trình duyệt và so ảnh ở nhiều viewport vẫn cần thực hiện trong môi trường có phiên Clerk hợp lệ.
