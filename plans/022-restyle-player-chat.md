# Plan 022: Restyle trang trò chuyện người chơi theo `/vi/app`

## Mục tiêu và trạng thái

- **Trạng thái:** Chưa triển khai. File này là kế hoạch; không thay đổi UI trong bước lập kế hoạch.
- **Route đích:** `/[locale]/app/chat`, gồm `/vi/app/chat`, `/en/app/chat` và deep link `?channel=<id>`.
- **Nguồn style:** Trang `/[locale]/app` hiện tại, đặc biệt header xanh dương, xanh neon, trắng/đen, hình khối bo tròn, nét kẻ sân và các asset cầu lông trong `web/public`.
- **Phạm vi chức năng:** Chỉ thay đổi trình bày và bố cục. Stream Chat, Clerk, API, quyền truy cập, dữ liệu hội thoại và cách gửi tin giữ nguyên.
- **Không thuộc phạm vi:** `/app/venue/[venueId]/messages`, AI chat trên `/app`, giao diện đặt sân/chơi, API và schema.

## Hiện trạng đã kiểm tra

1. `web/app/[locale]/app/chat/page.tsx` là trang server mỏng, truyền `searchParams.channel` vào `ChatView`. Không cần thay routing hoặc metadata.
2. `web/features/dashboard/dashboard-frame.tsx` chỉ dùng layout toàn màn hình cho `/app`; mọi trang khác có `AppSidebar`, topbar trung tính và `main` có padding. Đây là nguyên nhân lớn nhất khiến `/app/chat` không cùng ngôn ngữ thị giác với trang chủ.
3. `web/features/dashboard/topbar.tsx` đã có header xanh cho `/app` với logo, bốn liên kết, thông báo, theme, locale và menu tài khoản. `/app/chat` vẫn vào nhánh header cũ. `NewChatAction` hiện được hiển thị bởi `SectionActions` trong nhánh này.
4. `web/features/chat/chat.tsx` dựng giao diện hai cột, dùng `ChatView` chung cho chat người chơi và hộp thư chủ sân. `WithComponents` thay toàn bộ UI nhìn thấy được của Stream bằng các component nội bộ; không nhập CSS giao diện của Stream.
5. `channel-list.tsx`, `message.tsx`, `composer.tsx`, `list-chrome.tsx`, `chat-avatar.tsx` đang chủ yếu dùng token trung tính hoặc xanh lá cũ (`bg-muted`, `bg-primary`, `bg-brand`). `ChatAvatar` ưu tiên ảnh thật và fallback chữ cái; phải giữ quy tắc này.
6. Trên mobile, `MobilePaneContext` điều khiển hai trạng thái `list` và `conversation`. Deep link mở thẳng hội thoại. Nút quay lại trong `TeamChannelHeader` đưa người dùng về danh sách.
7. `Composer` hỗ trợ Enter để gửi, Shift+Enter xuống dòng, typing indicator và chặn gửi khi phòng bị đóng. Những hành vi này không thay đổi.
8. Ứng dụng có theme sáng/tối, `next-intl` cho `vi`/`en`, `NewChatDialog` để tìm người dùng và tạo DM/nhóm. Các trạng thái tải, lỗi, không có hội thoại nằm trong các component chat hiện tại.

## Hướng thiết kế

### 1. Hệ màu và chữ

| Vai trò | Light mode | Dark mode | Cách dùng |
|---|---|---|---|
| Xanh chủ đạo | `#2046ed` | xanh sáng có tương phản phù hợp | Header, tiêu đề, viền, tin nhắn của mình, nút gửi |
| Xanh neon | `#a5ff12` | xanh neon giảm độ gắt nếu cần | Hội thoại đang chọn, badge chưa đọc, CTA chính |
| Nền trang | `#fff` / xanh rất nhạt | đen xanh đậm | Vùng nội dung chat |
| Mực chữ | xanh đậm gần `#173bc8` / đen | trắng ngà | Tiêu đề, nội dung và nhãn phụ |
| Điểm nhấn hồng | `#e959bd` | hồng vừa phải | Chỉ dùng ở chi tiết trang trí hoặc hover, không dùng cho văn bản chức năng |

Tạo token *scoped* cho player chat (ví dụ `.player-chat`) trong CSS module hoặc một vùng có prefix rõ ràng. Không đổi `--primary`, `--brand`, `--lime` toàn app vì các trang khác vẫn dùng hệ màu hiện tại. Nội dung chat cần đọc lâu, nên ưu tiên nền đơn giản và tương phản hơn trang hero.

### 2. Bố cục desktop

```text
┌──────────────── Header xanh giống /app ────────────────┐
│ Logo       AI  Chơi  [Trò chuyện]  Lịch đặt     tiện ích │
├───────────────────┬─────────────────────────────────────┤
│ Danh sách chat    │ Tên người/nhóm + trạng thái         │
│ Tiêu đề + CTA mới │─────────────────────────────────────│
│ Tìm kiếm/lọc (*)  │ Tin nhắn, mốc ngày, chưa đọc         │
│ Các hội thoại     │                                     │
│                   │─────────────────────────────────────│
│                   │ Ô nhập bo tròn + nút gửi             │
└───────────────────┴─────────────────────────────────────┘
```

- Header cao tương ứng trang chủ (`88px`). Chỉ phần danh sách và lịch sử tin nhắn cuộn độc lập. Composer neo ở đáy vùng hội thoại; không để toàn trang cuộn khi gõ tin.
- Cột trái rộng khoảng `320–360px` khi desktop. Cột phải chiếm phần còn lại, có giới hạn chiều rộng nội dung tin để dòng không quá dài trên màn hình lớn.
- Cột trái có nền xanh dương rất nhạt, cột phải trắng; ranh giới là viền xanh mảnh. Không dựng thêm một card bọc toàn trang, vì `ChatShell` hiện đã theo hướng phẳng.
- Trạng thái chưa chọn hội thoại hiển thị lời mời bắt đầu trò chuyện, CTA “Cuộc trò chuyện mới”, và một asset trang trí cầu lông có kích thước vừa. Không dùng nhân vật minh họa làm avatar người dùng.
- `(*)` Tìm kiếm/lọc hội thoại chỉ đưa vào nếu tận dụng được danh sách đang có và không làm sai phân trang/lọc của Stream. Nếu cần thêm logic không nhỏ, để ngoài scope restyle; không vẽ ô tìm kiếm giả.

### 3. Bố cục mobile/tablet

- Dưới `sm`: giữ cơ chế một pane mỗi lần. Danh sách chiếm toàn bộ chiều rộng; chọn hội thoại mở nội dung; nút quay lại có vùng chạm tối thiểu `44px`.
- Ở tablet: cân nhắc breakpoint `md` cho hai cột nếu chiều rộng thực tế đủ; không ép cột 288px + nội dung chật trên màn hình 640px. Chọn breakpoint sau khi kiểm tra thực tế tại 640, 768 và 1024px.
- Header xanh cần gọn: logo, thông báo, menu; các liên kết chính chuyển vào menu như trang chủ. CTA tạo chat vẫn dễ tìm trong đầu danh sách, không phụ thuộc vào topbar bị thu gọn.
- Composer dùng `safe-area-inset-bottom` trên thiết bị có thanh hệ thống; khi bàn phím ảo mở, tin mới và ô nhập vẫn thấy được.

### 4. Các thành phần cần restyle

| Thành phần | Thay đổi dự kiến | Giữ nguyên |
|---|---|---|
| Header điều hướng | Tái sử dụng header xanh `/app`, active state cho “Trò chuyện”; menu và icon có focus/hover rõ | Link, thông báo, theme, locale, tài khoản |
| Đầu danh sách | Tiêu đề đậm xanh, CTA “Cuộc trò chuyện mới” xanh neon, bộ đếm nếu có dữ liệu thật | `NewChatDialog` và luồng tạo DM/nhóm |
| Hàng hội thoại | Avatar thật, pill active xanh neon, preview và thời gian dễ đọc, badge chưa đọc tương phản | Chọn channel, trạng thái online, menu xoá/rời, phân trang |
| Đầu hội thoại | Nền xanh hoặc trắng theo mẫu thống nhất, tên/ảnh và trạng thái, viền phân tách | Nhánh DM, nhóm, chat với sân và mở profile |
| Tin nhắn | Tin mình màu xanh dương; tin người khác nền trắng/xanh nhạt với viền mềm; góc bo và khoảng cách theo nhóm | Quote, đính kèm, phản ứng, xoá, timestamp, read receipts |
| Mốc ngày/chưa đọc/typing | Pill nhỏ, đường kẻ xanh nhạt, badge neon có độ tương phản | Nội dung và vị trí do Stream quản lý |
| Composer | Thanh nhập bo tròn, nút gửi neon hoặc xanh dương; trạng thái disabled/frozen rõ | Enter, Shift+Enter, typing event, send API |
| Trạng thái trống/tải/lỗi | Thông điệp dễ hiểu, asset trang trí nhỏ, nút hành động khi phù hợp | Không bịa hội thoại/tin nhắn mẫu |
| Dialog tạo chat | Màu nút, chip người chọn, focus ring và khoảng cách theo style mới | Search debounce, chọn người, đặt tên nhóm, xử lý lỗi |

## Kiến trúc và phạm vi file

1. **`web/features/dashboard/dashboard-frame.tsx`**: phân loại route rõ ràng: `home`, `playerChat`, `other`. Cho `playerChat` dùng phần nội dung toàn màn hình, bỏ padding ngoài; không thay khung các route venue/admin/play/bookings. Đảm bảo `main` có `min-h-0` và không tạo hai vùng cuộn dọc không cần thiết.
2. **`web/features/dashboard/topbar.tsx`**: rút header xanh thành nhánh/component dùng cho `/app` và `/app/chat`, nhận `activeItem` thay vì so sánh cứng chỉ với `/app`. Trang chat phải có đường vào “Cuộc trò chuyện mới”: ưu tiên đặt CTA trong danh sách chat và không render một nút trùng ở topbar. Kiểm tra menu trên mobile và quyền admin/venue như hiện tại.
3. **`web/features/chat/chat.tsx`**: thêm biến thể trình bày player chat dựa trên `venueInboxId` hoặc prop rõ ràng từ page. Đặt root class/data attribute để scope style. Chỉnh `ChatShell`, hai pane, `TeamChannelHeader` và trạng thái không kết nối. Không sửa query/filter/sort/channel initialization.
4. **`web/features/chat/channel-list.tsx`**: bố cục đầu danh sách và hàng chat; active/unread/hover/focus. Giữ menu remove/leave và khả năng click toàn hàng. Nếu cần nút tạo chat tại đây, chuyển `NewChatDialog` từ topbar vào vùng đầu danh sách để nó vẫn có mặt trên mọi breakpoint.
5. **`web/features/chat/message.tsx`, `composer.tsx`, `list-chrome.tsx`**: áp dụng token player chat cho bong bóng, input, các marker trạng thái. Bọc thay đổi trong variant hoặc CSS scoped để hộp thư chủ sân không đổi diện mạo ngoài ý muốn.
6. **`web/features/chat/new-chat-dialog.tsx`**: chỉnh trình bày dialog và các state tìm kiếm; không đụng logic tìm kiếm/tạo channel.
7. **`web/app/globals.css` hoặc CSS module mới trong `features/chat/`**: chỉ thêm CSS cần thiết cho cấu trúc Stream hoặc token scoped. Ưu tiên Tailwind cho component cụ thể; tránh selector toàn cục `.str-chat` không có prefix.
8. **`web/messages/vi.json` và `en.json`**: thêm copy chỉ khi tạo text mới; giữ parity của hai locale. Không hardcode tiếng Việt vào component có thể mở ở `/en/app/chat`.

Nếu một thay đổi chỉ phục vụ player chat, truyền variant vào component con hoặc dùng context/style scope tại root. `VenueInboxContext` hiện chỉ phân biệt ngữ nghĩa hộp thư; không nên dựa vào class chung rồi vô tình restyle cả `/app/venue/[venueId]/messages`.

## Trình tự triển khai

### Giai đoạn A — chốt baseline

1. Mở `/vi/app` và `/vi/app/chat` trong cùng viewport desktop/mobile, chụp baseline ở trạng thái có hội thoại và chưa chọn hội thoại. Kiểm tra `/en/app/chat` và theme tối.
2. Ghi lại số đo: chiều cao header, độ rộng nội dung, breakpoint hiện có, màu/bo góc/spacing của trang chủ. Kiểm tra asset `web/public` nào có nền trong suốt; chỉ chọn asset dùng trong empty state.
3. Chạy `git status --short`, giữ nguyên các thay đổi khác của người dùng. Đọc guide Next.js liên quan trong `web/node_modules/next/dist/docs/` trước khi sửa code, theo `AGENTS.md`.

### Giai đoạn B — khung trang và điều hướng

4. Refactor header xanh để dùng trên home và chat, có active state theo route. Duy trì notification, locale, theme, account menu; kiểm tra `NewChatAction` không biến mất khi bỏ topbar cũ.
5. Cho `/app/chat` full bleed và cao đúng phần màn hình còn lại. Trên desktop đặt hai pane; trên mobile giữ pane transition hiện có.

### Giai đoạn C — nội dung chat

6. Thêm token màu scoped và restyle danh sách; đặt nút tạo hội thoại ở đầu danh sách. Kiểm tra active/unread/online và hover menu ở cả chuột lẫn cảm ứng.
7. Restyle header hội thoại, tin nhắn, date/unread/typing marker, composer và empty/loading/error states. Kiểm tra tin nhắn dài, nhiều dòng, quote, đính kèm ảnh/tệp.
8. Restyle dialog tạo hội thoại. Kiểm tra kết quả tìm kiếm rỗng/đang tải/chọn nhiều người/lỗi tạo chat.
9. Rà responsive 360, 390, 640, 768, 1024, 1440px; chỉnh cột, font, padding và safe area. Rà light/dark và focus keyboard.

### Giai đoạn D — xác minh

10. Chạy `npm run typecheck`, ESLint các file sửa, `npm run build`; sửa mọi lỗi do thay đổi gây ra.
11. Smoke test thủ công: tạo DM, tạo nhóm, gửi tin, phản ứng, xoá, mở profile, nhảy tin chưa đọc, mở `?channel=...`, quay lại danh sách mobile, phòng frozen, Stream connecting/unavailable.
12. Mở `/app/venue/[venueId]/messages` để xác nhận variant player không làm đổi layout hoặc chức năng hộp thư chủ sân.

## Tiêu chí nghiệm thu

- Người dùng đi từ `/vi/app` sang `/vi/app/chat` thấy cùng header, hệ màu, font, nút và nhịp khoảng cách; mục Trò chuyện được đánh dấu rõ.
- Không có sidebar dashboard cũ trên player chat; danh sách và vùng chat sử dụng đủ chiều cao màn hình, cuộn đúng vùng.
- CTA tạo chat luôn thấy được ở desktop và mobile; không có hai CTA trùng nhau.
- Tin mình/người khác, hội thoại active/chưa đọc, online/offline có khác biệt rõ nhưng văn bản vẫn đủ tương phản. Focus state nhìn thấy bằng bàn phím.
- Deep link `?channel=...`, chat nhóm, chat sân, menu xoá/rời, thông báo, theme và locale hoạt động như trước.
- `/en/app/chat` không xuất hiện copy tiếng Việt hardcode. Hộp thư chủ sân không bị restyle ngoài phạm vi.
- TypeScript, ESLint, build qua; smoke test mobile/desktop hoàn thành.

## Rủi ro và cách xử lý

- **`ChatView` dùng chung:** scope bằng player variant; thêm kiểm tra venue inbox vào danh sách nghiệm thu.
- **Mất CTA tạo chat khi đổi header:** chuyển CTA vào danh sách trước hoặc cùng bước refactor header, sau đó bỏ CTA topbar cũ ở player chat.
- **Nhiều vùng scroll lồng nhau:** giới hạn chiều cao từ `DashboardFrame`, dùng `min-h-0` tại các flex child và để hai pane tự cuộn.
- **Theme tối xung đột màu hardcode:** định nghĩa token scoped có giá trị dark tương ứng, kiểm tra tương phản thực tế của text, badge, input, focus.
- **Stream DOM riêng:** chỉ style trong root player chat, không nhập stylesheet mặc định của SDK hoặc chỉnh global selector rộng.
- **Asset trang trí lấn nội dung:** chỉ dùng ở empty state, `aria-hidden`, tối ưu kích thước; tránh overlay lên tin nhắn hoặc nút.

## Ghi chú triển khai

Plan này mô tả đích và thứ tự thực hiện; các tên class/token chính xác nên được chốt sau khi xem trang đang chạy ở các viewport. Không thêm logic chat hoặc dữ liệu mẫu để phục vụ ảnh chụp giao diện.
