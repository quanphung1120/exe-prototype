# Plan 025: Thay SePay bằng VietQR Quick Link — người chơi chuyển thẳng cho chủ sân

- **Trạng thái:** TODO — chỉ lập kế hoạch, **chưa sửa code**. Chờ chủ dự án trả lời mục 9 rồi mới triển khai.
- **Mục tiêu:** Shuttio không giữ tiền booking. Người chơi chuyển khoản trực tiếp vào tài khoản chủ sân qua QR (VietQR Quick Link); chủ sân tự đối chiếu app ngân hàng, tự duyệt và tự hoàn tiền. Không webhook, không API chuyển tiền: mọi bước xác nhận/hoàn tiền do con người làm.
- **Phụ thuộc:** các plan 014 (chat chủ sân), 019–021 (setup sân) — đã có trong repo. Không phụ thuộc plan nào đang TODO.
- **Nguồn:** đọc code tại commit `5709c34`+ (master). Số dòng ở dưới là của commit đó.

---

## 0. Quyết định đã chốt (chủ dự án trả lời 2026-10-16) — **ưu tiên hơn mọi chỗ khác trong file**

1. **Mọi hoàn tiền do chủ sân và người chơi tự thực hiện**: chủ sân chuyển trả, upload ảnh; không có "tự hoàn", không cộng ví.
2. **Bỏ bộ quét "im lặng = đồng ý"** và tự duyệt yêu cầu huỷ quá hạn. Booking mới không bao giờ tự `confirmed`.
3. **Chat render ảnh** (`attachments`). Ảnh chuyển khoản/hoàn tiền lưu ở **thư mục Cloudinary riêng theo venue** (`shuttio/payment-proofs/{venueId}/...`).
4. **Bỏ giữ chỗ 20 phút (hold).** Booking `awaiting_payment` không hết hạn và **không chặn slot**; booking `awaiting_venue_confirmation` cũng **không chặn slot**. Nhiều người có thể book cùng sân/giờ — chủ sân tự duyệt một người và tự từ chối (kèm hoàn tiền) những người còn lại. Chỉ booking `confirmed` (và khách vãng lai, khoá sân) mới chặn slot. Không còn tình huống "hold hết hạn nhưng đã chuyển tiền" (câu A).
5. **Hạn duyệt 12 giờ** (sớm hơn nếu gần giờ chơi: không quá giờ bắt đầu). Có nhắc chủ sân giữa chừng; quá hạn → `rejected_refund_pending` (lý do "chủ sân không phản hồi"), **không bao giờ tự xác nhận**. Giao diện người chơi ghi chú: có thể tự liên hệ chủ sân (nút chat) để nhắc duyệt.
6. **Tài khoản nhận hoàn của người chơi**: lưu ở profile, hỏi khi thanh toán nếu chưa có, snapshot vào booking lúc nộp ảnh.
7. **Huỷ sau khi đã duyệt: không còn quy trình/tỷ lệ cố định.** Bỏ luồng "yêu cầu huỷ" (24h, 100%/50%, hạn 12h/2h, giới hạn 3 lần/tháng, tự duyệt quá hạn, khiếu nại "sân từ chối huỷ"). Người chơi và chủ sân tự trao đổi qua chat; **chủ sân là người huỷ** lượt đã duyệt (chọn số tiền hoàn, mặc định đủ) → `rejected_refund_pending` → ảnh hoàn → `refunded`. Người chơi chỉ tự huỷ được khi chưa nộp ảnh (`awaiting_payment`).
8. **Bỏ ví, nạp ví, rút ví, trả bằng ví.** **Chia tiền phòng 2.9** chỉ còn hiển thị "phần mỗi người = giá ÷ số người" để các bạn tự chuyển cho nhau — không còn đóng/hoàn/khiếu nại qua app. **Mã giảm giá giữ**: QR hiện số tiền sau giảm; sổ đếm chuyển sang `bookings`.
9. **Tài khoản nhận tiền ở cấp thương hiệu (Brand).** Phí nền tảng (3.8) để kế hoạch khác. **Cắt hẳn SePay** (giữ dữ liệu `payments/topups/wallets` cũ, không ghi mới).

Hệ quả lên phần còn lại: máy trạng thái ở mục 4 giữ nguyên các trạng thái nhưng `awaiting_payment` không còn cạnh `expired` do đồng hồ; bỏ cạnh/luật sweeper tương ứng ở mục 7; mục 9 coi như đã trả lời. Complaint chỉ còn loại `refund_not_received` (+ giữ dữ liệu cũ `room_leave`, `cancel_decline` để đọc).

---

## 1. Phát hiện quan trọng (đọc trước, vì các điểm này làm thay đổi phạm vi so với bản yêu cầu)

1. **Mọi đường hoàn tiền hiện nay đều "cộng ví"** (`bookings.service.ts:705` trong `setStatus`, `:718` `refundToWallet`, `:1269` trong `confirmPayment`, `:781/860/869` chia/nâng hoàn phòng, `rooms.service.ts:662/673/841/869/900/907/973/979`). Khi tiền không qua Shuttio thì **Shuttio không thể cộng ví** (sẽ là phát tiền ảo). Mọi hoàn tiền phải đổi thành: chủ sân tự chuyển trả → upload ảnh → `refunded`. Việc này kéo theo cả huỷ-có-duyệt (mục 2.4), chủ sân huỷ/từ chối, huỷ muộn, admin force-cancel, khiếu nại.
2. **Bộ quét tự động "im lặng = đồng ý"** (`bookings.service.ts:1337-1360`: `pending` quá `confirmDeadlineAt` → tự `confirmed`; `:1388-1415`: yêu cầu huỷ quá hạn → tự hoàn 100%/50%). Với VietQR, chủ sân chưa xác nhận **đã nhận tiền** thì không được tự xác nhận; và tự hoàn "tự động" cũng không còn nghĩa. Cần quyết định ở câu hỏi 1.
3. **Sổ đếm mã giảm giá nằm trong collection `payments`** (`payments.service.ts:239-268` `assertRedemptionQuota`, `:535-553` `applyUsage`). Nếu ngừng tạo `Payment` thì phải chuyển các trường `discountCode/discountAmount/originalAmount` lên `Booking` và đếm từ `bookings`.
4. **Giữ chỗ 20 phút vs. người chơi đã chuyển tiền thật.** Hiện hold hết hạn thì `expired` và nếu tiền về trễ thì hoàn (`confirmPayment` `:1243-1280`). Với VietQR không có webhook, người chơi có thể đã chuyển nhưng chưa kịp upload ảnh trước khi hold hết hạn → cần quy tắc rõ (câu hỏi bổ sung A).
5. **Chat:** UI chat hiện **chỉ có composer văn bản** (`web/features/chat/composer.tsx`) và `message.tsx` chỉ render text — tin hệ thống kèm **ảnh chuyển khoản** cần thêm render `attachments`. Cổng nhắn tin chủ sân dựa vào `paymentStatus ∈ {paid, refunded, partial_refund}` (`stream.service.ts:512-516`) — phải cập nhật theo trạng thái mới. UI nhận diện loại kênh theo tiền tố id (`channel-list.tsx:99` `startsWith("room-")`, `:229` `group-`), nên `booking-` cần được thêm.
6. **Upload ảnh:** chữ ký Cloudinary hiện chỉ cho chủ sân, thư mục theo venue, và `isVenuePhotoUrl` (`venue-photos.service.ts`) chặn URL ngoài thư mục venue. Ảnh chuyển khoản/hoàn tiền cần một bộ ký + validate riêng (người chơi upload theo booking của mình; chủ sân upload ảnh hoàn). Ảnh chứa thông tin ngân hàng → thư mục riêng, khó đoán (xem rủi ro mục 10).
7. **Trạng thái dùng ở nhiều nơi cần cập nhật đồng bộ:** `BOOKING_TRANSITIONS` (`shared/helpers.ts:1039-1056`, bản web cùng nội dung), `mapBookingStatus` (`sessions.service.ts:36-54`, `switch` vét cạn — thêm status mà thiếu case sẽ lỗi biên dịch), `PaymentStatus` và `BookingRecordStatus` (`shared/types.ts:772-787`, hai bản `api/src/shared` và `web/lib/shared` phải sửa tay như nhau), `venueTotals` (`bookings.service.ts:1969` tính doanh thu theo `paymentStatus === "paid"`).
8. **Ví/nạp ví/rút ví gắn chặt với SePay** (topups) và với chia tiền phòng 2.9 (members đóng vào ví chủ phòng, `rooms.service.ts`). Bỏ SePay mà giữ ví = ví không còn nguồn nạp. Cần quyết định ở câu hỏi 4.

---

## 2. Danh sách mọi chỗ phụ thuộc SePay / ví / trạng thái booking

### 2.1 API — SePay trực tiếp
| File:dòng | Nội dung | Xử lý |
|---|---|---|
| `api/src/features/payments/sepay.client.ts` (1-145; `initCheckout` :96, `retrieveOrder` :~113, `cancelOrder` :~122, `verifyIpnAuth` :135) | Client `sepay-pg-node`, port `SEPAY_CLIENT` | **Xoá** |
| `payments.module.ts:14,57` | Đăng ký `SEPAY_CLIENT` | Bỏ provider |
| `payments.service.ts:34-38,122,135` | Inject SePay, đọc `SEPAY_RETURN_URL` | Bỏ |
| `payments.service.ts:155-223` `checkout` | Tạo `Payment` + form SePay | Thay bằng `startVietQrPayment` (sinh `transferMemo`, trả thông tin QR) |
| `payments.service.ts:239-268` `assertRedemptionQuota` | Đếm lượt dùng mã trên `payments` | Chuyển sang đếm trên `bookings` |
| `payments.service.ts:283-378` `payWithWallet` | Trả bằng ví | Phụ thuộc câu hỏi 4 |
| `payments.service.ts:391-418` `byBooking` (`retrieveOrder` :406) | Poll + đối soát SePay | Đổi thành đọc trạng thái booking, bỏ đối soát |
| `payments.service.ts:432-466` `handleIpn`, `:485-557` `markPaid`, `:566-582` `finishPaidBooking`, `:585-597` `notifyVenue` | IPN và hậu xử lý | **Xoá**; `notifyVenue` thành thông báo "có chuyển khoản chờ kiểm tra" khi nộp ảnh |
| `payments.service.ts:608-614` `cancelOrderForBooking` | Huỷ order SePay khi hold hết hạn | Bỏ |
| `payments.controller.ts:33` `checkout`, `:40` `wallet-pay`, `:56` `ipn`, `by-booking/:id` | Route | Bỏ `ipn`, `checkout`; thêm route mới (mục 5) |
| `payments.dto.ts` (`CheckoutDto`, `WalletPayDto`, DTO top-up) | DTO | Thay DTO mới |
| `payment.schema.ts` (47 dòng), `descriptions.ts`, `return-urls.ts` | Doc `Payment`, mô tả đơn SePay, URL trả về | Ngừng tạo mới (giữ schema để đọc dữ liệu cũ); `descriptions.ts`/`return-urls.ts` xoá cùng test |
| `topups.service.ts`, `topups.controller.ts`, `topup.schema.ts` | Nạp ví qua SePay | Ngừng tạo bản ghi mới (câu hỏi 4) |
| `bookings-sweeper.service.ts:30-62` | Cron gọi `cancelOrderForBooking` | Bỏ phần SePay; sửa luật quét |
| `env.validation.ts:15-24` | `SEPAY_ENV/MERCHANT_ID/SECRET_KEY/RETURN_URL` bắt buộc | Xoá (nếu giữ lại sẽ làm crash lúc boot) |
| `api/.env.example:25-42`, `RELEASE.md:4,9,47-59,63-124,188,210-213`, `api/README.md:58-61,68-89` | Tài liệu cấu hình SePay | Viết lại |
| `api/package.json:36` | `sepay-pg-node` | Gỡ dependency |
| `api/src/main.ts:16-22` | `rawBody: true` (chỉ phục vụ IPN) | Bỏ khi IPN bị xoá |
| `user-throttler.guard.ts` (comment), `discounts/*` (comment) | Nhắc SePay | Cập nhật comment |

### 2.2 API — ví và hoàn tiền (liên quan trực tiếp)
| File:dòng | Nội dung |
|---|---|
| `bookings.service.ts:243` | Inject `WalletService` |
| `:674-707` `setStatus` | Sau mỗi chuyển trạng thái có refund thì `refundToWallet` |
| `:718-745` `refundToWallet`, `:756-800` `refundRoomShares`, `:816-900` `upgradeLateRefunds` | Cộng ví; chia hoàn cho thành viên phòng; nâng hoàn lên 100% khi slot bị đặt lại |
| `:913-985` `fileCancelComplaint`, `:985-1050` `refundDeclinedCancel` | Khiếu nại chủ sân từ chối huỷ → admin hoàn 100% vào ví |
| `:1197-1285` `confirmPayment` | `awaiting_payment → pending`, xử lý tiền về muộn (hoàn ví) |
| `:1321-1428` `sweep` | Hết hạn hold, **tự xác nhận**, hoàn thành, **tự duyệt huỷ** |
| `:1460-1547` `createHold` | Tạo hold 20 phút (`HOLD_MINUTES` :98), `awaiting_payment`/`paymentStatus: "awaiting"` (:1528-1529) |
| `:1565-1650` `cancel`, `:1682-1735` `decideCancelRequest`, `:1737-1795` `completeCancelRequest` | Huỷ có duyệt (2.4) |
| `:1834-1872` `decide` | Chủ sân duyệt/từ chối booking `pending` |
| `:1919-1932` `applyRefund` | Tạo `booking.refund` `status: "manual"`, đặt `paymentStatus` |
| `:1955-1980` `venueTotals`, `:1995-2040` `listRefundQueueAll`/`settleRefund` | KPI doanh thu theo `paid`; hàng đợi hoàn tiền thủ công của admin |
| `:417-430` `listRefundQueue` (chủ sân) | Hàng đợi hoàn tiền thủ công của chủ sân |
| `rooms.service.ts:278,374,407,488,630-712,822-1000` | Chia tiền sân theo phòng (2.9), toàn bộ qua ví |
| `wallet/*` (service, controller, schema, withdrawals) | Ví, rút ví |
| `admin.service.ts:233-245` + `web/features/admin/withdrawals.tsx`, `refunds.tsx` | Admin duyệt rút ví, hoàn thủ công |
| `stream.service.ts:485-575` `openVenueChat`, `:512-516` | Chat chủ sân – điều kiện đã thanh toán |
| `sessions.service.ts:36-54,130-145` | Ánh xạ trạng thái booking → trạng thái phòng/hoàn tiền |

### 2.3 Trạng thái booking hiện tại
`BookingRecordStatus`: `awaiting_payment`, `pending` (đã trả, chờ chủ sân), `confirmed`, `checked-in` (di sản), `completed`, `expired`, `cancelled`, `no-show`. `PaymentStatus`: `awaiting`, `paid`, `refunded`, `partial_refund`, `none`. Bảng chuyển: `shared/helpers.ts:1039-1056`.

### 2.4 Web
| File:dòng | Nội dung | Xử lý |
|---|---|---|
| `web/features/play/payment-actions.ts` (5, 41, 75, 107) | Server action checkout/poll SePay | Thay bằng action VietQR |
| `web/features/play/session.tsx:272-291,348-360,1933-2140,2147-2160` | `pay()`, `submitSepayCheckoutForm`, resume checkout, `payWithWallet` | Thay luồng thanh toán |
| `web/features/booking/book.tsx:170,603-780` | Bước PAY chuyển hướng SePay | Thay bằng màn QR + upload ảnh |
| `web/features/booking/payment-return.tsx`, `payment-success.tsx`, `web/app/[locale]/app/payment/**` (3 page) | Trang trả về từ SePay | Xoá hoặc đổi thành màn "đã gửi, chờ chủ sân" |
| `web/features/dashboard/dashboard-frame.tsx:19`, `web/next.config.ts:41-43`, `web/lib/locale-preference.ts` | Nhắc SePay redirect | Dọn |
| `web/features/booking/bookings.tsx:93,863` | Đếm ngược thanh toán, lịch sử booking | Thêm trạng thái mới, nút "Đã nhận lại tiền / Chưa nhận được" |
| `web/features/venue/reservations.tsx:631,870` | Hàng đợi hoàn tiền thủ công + hành động chủ sân | Màn duyệt/từ chối, QR hoàn, upload ảnh hoàn |
| `web/features/venue/venue-data-provider.tsx:41` | Danh sách hoàn tiền | Cập nhật kiểu |
| `web/features/venue/setup-wizard.tsx:117-205,288,346` | Wizard (brand step có `contactPhone`) | Thêm khai báo tài khoản nhận tiền |
| `web/features/wallet/*`, `web/app/[locale]/app/wallet/page.tsx`, `topbar.tsx:22,42,50` | Ví | Câu hỏi 4 |
| `web/messages/vi.json`, `en.json` | ~10 khoá SePay + ví | Cập nhật |
| `web/lib/shared/types.ts`, `helpers.ts` | Bản sao shared | Sửa đồng bộ với api |

### 2.5 Test (xem mục 8) và tài liệu (`docs/chinh-sach.md` 2.3, 2.4, 2.8, 2.9, 3.3–3.5, bảng phụ lục).

---

## 3. Mô hình dữ liệu

> Quyết định mặc định (có thể đổi theo trả lời): **tài khoản nhận tiền đặt ở cấp thương hiệu (Brand)**, vì các chi nhánh dùng chung một chủ sân (`Brand.ownerId`); mỗi chi nhánh vẫn có thể ghi đè sau (không làm đợt này).

### 3.1 Tài khoản nhận tiền của chủ sân
Thêm vào `Brand` (`brand.schema.ts`) một sub-object `payout`: `{ bankBin, bankCode, bankName, accountNo, accountName, updatedAt }`.
- Nhập ở bước thương hiệu của `setup-wizard.tsx` (cạnh `contactPhone`) và sửa được ở trang quản lý.
- Danh sách ngân hàng: endpoint `GET /api/banks` (api proxy `https://api.vietqr.io/v2/banks`, cache bộ nhớ ~24 giờ, chỉ giữ `bin, code, shortName, logo, transferSupported === 1`); web dùng cho `Select`. Validate `bankBin` ∈ danh sách, `accountNo` `^\d{6,20}$`, `accountName` in hoa không dấu (VietQR yêu cầu).
- **Sân chưa khai báo thì không nhận đặt online:** chặn trong `createHold` (`bookings.service.ts:1467` cạnh `assertVenueApproved`), ẩn khỏi `catalogCourts` (`venues.service.ts:526`) hoặc hiển thị "chưa nhận đặt online" — chọn: **không ẩn khỏi bản đồ, chặn ở nút Đặt sân** (đỡ làm trống catalog).

### 3.2 Booking (`booking.schema.ts` + `BookingRecord` trong shared types)
Thêm: `paymentMethod: "vietqr" | "sepay" | "walk-in"` (bản ghi cũ coi như `sepay`/`walk-in`), `transferMemo` (unique, sparse), `payoutSnapshot` (copy tài khoản chủ sân tại thời điểm giữ chỗ — chủ sân đổi STK sau không làm sai QR đang chờ), `paymentProofUrl`, `proofSubmittedAt`, `rejectReason`, `refundProofUrl`, `refundAccount` (snapshot tài khoản nhận hoàn của người chơi), `refundConfirmation` (`"received" | "not_received"`, `at`), cùng các trường mã giảm giá (`discountCode`, `discountAmount`, `originalAmount`) chuyển từ `Payment` lên.
Index: `{ transferMemo: 1 }` unique sparse; `{ status: 1, proofSubmittedAt: 1 }` cho quét hạn duyệt.

### 3.3 Tài khoản nhận hoàn tiền của người chơi
Thuộc câu hỏi 2. Mặc định đề xuất: lưu ở `Profile` (`profile.schema.ts`, thêm `refundAccount`), yêu cầu nhập ở bước thanh toán nếu chưa có, **snapshot vào booking lúc nộp ảnh** để hoàn tiền không phụ thuộc thay đổi sau.

### 3.4 Dữ liệu cũ
Không xoá/di chuyển `payments`, `topups`, `wallets`, `wallettxes`, `withdrawals`: chỉ ngừng ghi mới. Booking cũ `pending/confirmed` vẫn chạy theo luật cũ (nhờ `paymentMethod`); sweeper chỉ tự-xác-nhận booking cũ (`paymentMethod !== "vietqr"`).

---

## 4. Máy trạng thái booking mới

```
                       createHold (sân đã khai báo STK)
                                  │
                                  ▼
                        ┌──────────────────┐   hold hết hạn (20')   ┌─────────┐
                        │ awaiting_payment │ ─────────────────────▶ │ expired │
                        └──────────────────┘   (sweeper)            └─────────┘
              người chơi │      │ người chơi huỷ
              nộp ảnh CK │      ▼
                         │   cancelled
                         ▼
            ┌───────────────────────────────┐
            │ awaiting_venue_confirmation   │  (đã tạo chat booking-{id}, tin hệ thống)
            └───────────────────────────────┘
        chủ sân duyệt │                      │ chủ sân từ chối (bắt buộc lý do)
                      ▼                      ▼
              ┌───────────┐        ┌──────────────────────────┐
              │ confirmed │        │ rejected_refund_pending  │ (app hiện QR hoàn cho chủ sân)
              └───────────┘        └──────────────────────────┘
        ┌────────┬────────┐                   │ chủ sân upload ảnh hoàn
        ▼        ▼        ▼                   ▼
   completed  no-show  cancelled*        ┌──────────┐   người chơi bấm
 (hết giờ)   (≥30')    (huỷ sau duyệt:   │ refunded │ ◀─ "Đã nhận lại tiền"
                        → câu hỏi 3)     └──────────┘
                                              │ "Chưa nhận được" → mở khiếu nại (complaints)
```

Bảng chuyển hợp lệ mới (thêm vào `BOOKING_TRANSITIONS`, cả hai bản shared):

| Từ | Sang |
|---|---|
| `awaiting_payment` | `awaiting_venue_confirmation`, `expired`, `cancelled` |
| `awaiting_venue_confirmation` | `confirmed`, `rejected_refund_pending`, `cancelled`, `expired` *(chỉ khi áp dụng quá hạn duyệt kiểu "tự huỷ" — câu hỏi 1)* |
| `rejected_refund_pending` | `refunded` |
| `refunded` | — (cuối) |
| `confirmed` | `completed`, `no-show`, `cancelled` *(huỷ sau duyệt: tuỳ câu hỏi 3)* |
| `pending`, `checked-in` | giữ nguyên để đọc dữ liệu cũ |

`PaymentStatus` thêm `awaiting_verification` (đã nộp ảnh, chờ chủ sân) và `venue_rejected`; `paid` được đặt khi chủ sân duyệt (nghĩa: chủ sân xác nhận đã nhận tiền); `refunded` khi có ảnh hoàn. `mapBookingStatus` (`sessions.service.ts`): `awaiting_venue_confirmation → booked/pending`, `rejected_refund_pending` và `refunded → cancelled` (kèm cờ `refunded`).

---

## 5. Endpoint

**Thêm**
| Route | Ai | Việc |
|---|---|---|
| `GET /api/banks` | đã đăng nhập | Danh sách ngân hàng (cache) |
| `PUT /api/brands/me/payout` (hoặc nằm trong setup brand) | chủ sân | Lưu STK nhận tiền |
| `POST /api/bookings/:id/payment/start` | người chơi | Trả `transferMemo`, URL ảnh QR (`https://img.vietqr.io/image/{bin}-{acc}-compact2.png?amount&addInfo&accountName`), STK, số tiền; áp mã giảm giá |
| `POST /api/bookings/:id/payment/proof/sign` | người chơi | Chữ ký Cloudinary cho ảnh chuyển khoản (thư mục `shuttio/proofs/{bookingId}`) |
| `POST /api/bookings/:id/payment/submit` | người chơi | Nhận `paymentProofUrl` (validate thuộc thư mục đó) → `awaiting_venue_confirmation`, tạo chat, tin hệ thống, thông báo chủ sân |
| `POST /api/bookings/:id/venue-decision` (hoặc mở rộng `decide`, `bookings.controller.ts`) | chủ sân | `approve` hoặc `reject{reason}` |
| `GET /api/bookings/:id/refund-qr` | chủ sân | Thông tin QR hoàn tiền tới `refundAccount` của người chơi |
| `POST /api/bookings/:id/refund/proof/sign` + `POST /api/bookings/:id/refund/complete` | chủ sân | Ảnh hoàn → `refunded`, tin hệ thống |
| `POST /api/bookings/:id/refund/confirm` | người chơi | `received` hoặc `not_received` (mở khiếu nại) |
| `PUT /api/profile/refund-account` | người chơi | Lưu tài khoản nhận hoàn (nếu chọn lưu trong profile) |

**Bỏ:** `POST /api/payments/checkout`, `POST /api/payments/ipn`, `GET /api/payments/by-booking/:id` (thay bằng đọc booking), `POST /api/payments/wallet-pay` và `/api/wallet/topups*` *(tuỳ câu hỏi 4)*.
Mọi route người chơi mới đều có `@UserThrottle` (mỗi lần gọi ghi DB/ký Cloudinary).

---

## 6. Chat kênh booking (best-effort)

- Kênh `messaging` id `booking-{bookingId}`, thành viên `[người chơi, chủ sân]`, `created_by_id` = người chơi, kèm `bookingId`, `venueId`, `brandId` để hộp thư chủ sân (`channel-list.tsx`) lọc được. Tạo ngay khi nộp ảnh (`StreamService.createBookingChannel`, idempotent như `createRoomChannel` `:148-161`).
- Tin hệ thống (`channel.sendMessage({ text, type: "system" | thường kèm user_id hệ thống, attachments })`):
  1. *Nộp ảnh:* "Thông tin đặt sân: {sân} · {giờ} {ngày}. Số tiền {x} VND. Mã nội dung: {memo}." + ảnh chuyển khoản.
  2. *Duyệt:* "Chủ sân đã xác nhận đã nhận tiền. Lượt đặt được xác nhận."
  3. *Từ chối:* "Chủ sân từ chối: {lý do}. Chủ sân sẽ chuyển lại tiền cho bạn."
  4. *Đã hoàn:* "Chủ sân đã chuyển hoàn {x} VND." + ảnh hoàn.
  5. *Người chơi xác nhận:* "Người chơi xác nhận đã nhận lại tiền" / "…chưa nhận được — khiếu nại đã được mở".
- **Mọi lời gọi chat bọc `try/catch` và `.catch(log)`**, chạy sau khi booking đã đổi trạng thái và lưu (giống `freezeChannelById`). Chat lỗi không được làm hỏng duyệt/từ chối. Nếu tạo kênh lỗi lúc nộp ảnh thì `ensureBookingChannel` được gọi lại ở lần duyệt/mở chat sau.
- Web: `message.tsx` render `attachments` ảnh; thêm nhận diện `booking-` (không cho xoá/rời nhóm kiểu `group-`, hiển thị tên "Đặt sân {sân}"); `stream.service.ts` mở rộng điều kiện `openVenueChat`.
- Khi booking `cancelled/expired/refunded` thì khoá kênh (`freezeChannelById`) sau tin cuối.

---

## 7. Luật thời gian và các trạng thái đặc biệt (chờ trả lời mục 9)

| Tình huống | Mặc định đề xuất |
|---|---|
| Chủ sân không duyệt kịp | Hạn **12 giờ** (hoặc tới trước giờ chơi 1 giờ nếu sớm hơn); quá hạn → nhắc 2 lần, rồi `rejected_refund_pending` với lý do "quá hạn", **không tự xác nhận** |
| Người chơi chuyển tiền nhưng hold hết hạn | Cho nộp ảnh trong **30 phút sau hạn** nếu slot chưa ai giữ; sau đó vào đường hoàn tiền thủ công |
| Huỷ sau khi đã duyệt | Giữ bảng 2.4 cũ nhưng "hoàn tiền" = chủ sân chuyển trả + ảnh; hạn chủ sân trả lời yêu cầu huỷ giữ 12h/2h; quá hạn **không tự hoàn** mà chuyển cho admin xử lý |

---

## 8. Test

**Xoá:** `api/test/sepay-client.test.ts`, `payment-return-urls.test.ts`, `payment-descriptions.test.ts` (kèm `descriptions.ts`/`return-urls.ts`); các ca IPN/checkout/`order.retrieve` trong `payments-service.test.ts`; `topups-service.test.ts`, `wallet-service.test.ts`, `withdrawals-service.test.ts` *(tuỳ câu hỏi 4)*; bỏ biến SEPAY khỏi fixture `ai-chat.test.ts`.
**Sửa:** `bookings-service.test.ts` (29 chỗ ví/refund), `bookings-sweeper.test.ts` (luật quét mới), `rooms-service.test.ts` (32 chỗ ví) *(tuỳ câu hỏi 4)*, `discounts-service.test.ts` (sổ đếm chuyển sang booking), `venues-reservation-freeze.test.ts`, `stream-service.test.ts`/`stream-community.test.ts` (kênh `booking-`, điều kiện `openVenueChat`), `session-helpers.test.ts`/`sessions-service.test.ts` (ánh xạ trạng thái), `admin.test.ts`, `seed-service.test.ts`, `group-chat.test.ts`.
**Thêm:** `vietqr.test.ts` (sinh URL QR, memo không dấu/duy nhất, validate STK/bin), `booking-vietqr-flow.test.ts` (đủ các cạnh của máy trạng thái, idempotency, quyền: người chơi không duyệt được, chủ sân khác không duyệt được), `booking-chat.test.ts` (chat lỗi không chặn duyệt/từ chối), `payment-proof-upload.test.ts` (chặn URL ngoài thư mục), `banks.test.ts` (cache, lọc `transferSupported`), web `vitest` cho hàm dựng QR và bảng chuyển trạng thái dùng chung.

---

## 9. Câu hỏi cần chủ dự án trả lời trước khi code

**Bốn câu từ yêu cầu**
1. **Hạn chủ sân phải duyệt?** Đề xuất 12 giờ (rút ngắn xuống "trước giờ chơi 1 giờ" nếu giờ chơi gần). Quá hạn: (a) tự huỷ + yêu cầu hoàn tiền, (b) chỉ nhắc, (c) nhắc rồi chuyển admin. *Đề xuất: nhắc, rồi tự `rejected_refund_pending` — không bao giờ tự xác nhận.*
2. **Lấy tài khoản nhận hoàn của người chơi lúc nào?** (a) khai báo trong profile, (b) nhập khi đặt sân. *Đề xuất: (a) lưu ở profile, hỏi ở bước thanh toán nếu chưa có, snapshot vào booking.*
3. **Người chơi huỷ sau khi đã duyệt:** giữ tỷ lệ 100%/50%/0% và hạn 12h/2h của 2.4 (nay tiền do chủ sân tự chuyển), hay đổi? Khi chủ sân không trả lời, thay vì "tự hoàn" ta làm gì? *Đề xuất: giữ tỷ lệ; quá hạn chuyển admin xử lý.*
4. **Nạp ví, trả bằng ví, chia tiền phòng (2.9), mã giảm giá:**
   - **Nạp ví + rút ví:** không còn nguồn tiền → *đề xuất bỏ hẳn* (ẩn trang `/app/wallet`, giữ dữ liệu cũ).
   - **Trả bằng ví:** bỏ cùng ví.
   - **Chia tiền phòng 2.9:** hiện member đóng phần của mình vào ví chủ phòng. Nếu bỏ ví thì chọn: (a) bỏ chia tiền trong app, chỉ hiển thị "phần của mỗi người = giá ÷ số người" để các bạn tự chuyển cho nhau, (b) giữ ghi nhận nhưng không chuyển tiền qua app. *Đề xuất (a).*
   - **Mã giảm giá:** giữ. Số tiền trên QR là số sau giảm; sổ đếm lượt dùng đếm trên `bookings`; chủ sân là người tạo mã nên tự chịu khoản giảm (không ảnh hưởng đối soát vì tiền đi thẳng vào tài khoản họ).

**Câu hỏi bổ sung (tôi phát hiện khi đọc code)**
A. **Hold hết hạn nhưng người chơi đã chuyển tiền:** cho nộp ảnh trong bao lâu sau hạn (đề xuất 30 phút nếu slot còn trống)? Sau đó tiền đã chuyển phải được hoàn thủ công ra sao?
B. **Tài khoản nhận tiền đặt ở thương hiệu hay từng chi nhánh?** *Đề xuất thương hiệu (một chủ sân, một tài khoản).*
C. **Doanh thu admin (`grossRevenue`/`venueTotals`) và phí nền tảng 5–8% (mục 3.8, đang [Đề xuất]):** Shuttio không giữ tiền nên không thu phí được qua đối soát. Giữ số liệu "doanh thu ghi nhận (do chủ sân xác nhận)" và để phí nền tảng sang kế hoạch khác?
D. **Có cần giữ đường SePay song song một thời gian** (người chơi chọn "QR chủ sân" hoặc "SePay") hay cắt hẳn? Bản yêu cầu nói "thay", nên kế hoạch mặc định **cắt hẳn**, giữ dữ liệu cũ.

---

## 10. Rủi ro và lưu ý

- **Không có xác minh tự động.** Ảnh chuyển khoản có thể giả; chủ sân là người duy nhất xác thực qua app ngân hàng. Cần nêu rõ trong giao diện và `docs/chinh-sach.md`. Chủ sân duyệt nhầm là rủi ro của họ; người chơi bị từ chối oan có khiếu nại qua luồng complaints.
- **Ảnh chứa thông tin ngân hàng.** Dùng thư mục riêng khó đoán, `access_mode` hoặc URL ký nếu Cloudinary cho phép; ít nhất không liệt kê công khai. Cân nhắc xoá ảnh sau N ngày (không làm đợt này).
- **Tiền hoàn là thao tác thủ công của chủ sân.** Nếu chủ sân không hoàn, người chơi chỉ có khiếu nại → admin. Cần lối thoát rõ (câu hỏi 1 và 3) vì Shuttio không giữ tiền để tự hoàn.
- **Trùng nội dung chuyển khoản** (`transferMemo`): unique index; sinh lại nếu va chạm; chuỗi ASCII `SHT` + 6 ký tự (loại ký tự dễ nhầm O/0, I/1).
- **Đua trạng thái:** nộp ảnh và hết hạn hold cùng lúc, hoặc duyệt và huỷ cùng lúc → mọi chuyển trạng thái đi qua `setStatus` + `withVersionRetry` (đã có), thêm kiểm tra `from` rõ ràng.
- **Deploy:** gỡ `env.validation.ts` SEPAY trước khi deploy, nếu không service cũ vẫn yêu cầu biến; thứ tự: deploy api (còn đọc dữ liệu cũ) → deploy web → dọn dashboard SePay/biến Dokploy. Booking đang `pending` do SePay tại thời điểm chuyển tiếp vẫn phải hoàn tất theo luật cũ.
- **Web shared types là bản sao tay** của api — mỗi bước đổi `PaymentStatus`/`BookingRecordStatus`/`BOOKING_TRANSITIONS` phải sửa cả hai nơi và chạy `typecheck` cả hai app.

---

## 11. Trình tự triển khai (mỗi bước một commit; sau mỗi bước chạy `pnpm typecheck && pnpm lint && pnpm test` ở `api/` và `web/`)

1. **Types + máy trạng thái** (shared hai bản, `BOOKING_TRANSITIONS`, `mapBookingStatus`, test bảng chuyển). Chưa đổi hành vi.
2. **Ngân hàng + tài khoản nhận tiền chủ sân:** `GET /api/banks`, `payout` ở Brand, setup wizard, chặn đặt khi chưa khai báo, test.
3. **Tiện ích VietQR:** sinh `transferMemo`, dựng URL QR, test thuần.
4. **Booking:** trường mới trong schema, `startVietQrPayment`, ký Cloudinary cho ảnh chuyển khoản, `submit` (chuyển `awaiting_venue_confirmation`), chuyển sổ đếm mã giảm giá sang `bookings`, test.
5. **Duyệt / từ chối của chủ sân + hoàn tiền thủ công:** `venue-decision`, `refund-qr`, ký ảnh hoàn, `refund/complete`, `refund/confirm`, khiếu nại "chưa nhận được" vào luồng complaints, thay toàn bộ `refundToWallet`, test.
6. **Sweeper + luật hạn:** bỏ tự xác nhận cho `vietqr`, thêm nhắc/quá hạn theo câu 1, bỏ `cancelOrderForBooking`, hạn nộp ảnh sau hold (câu A), test.
7. **Chat kênh booking:** `createBookingChannel`, tin hệ thống best-effort, điều kiện `openVenueChat`, test chat-lỗi-không-chặn.
8. **Web người chơi:** màn QR + sao chép + upload ảnh + trạng thái chờ, lịch sử booking, nút "Đã nhận lại tiền / Chưa nhận được", i18n vi/en.
9. **Web chủ sân:** màn duyệt/từ chối, QR hoàn + upload ảnh hoàn, hàng đợi hoàn tiền mới, hộp thư render ảnh.
10. **Ví / topup / chia tiền phòng** theo câu hỏi 4 (ẩn/bỏ UI và API, cập nhật `rooms.service.ts`), dọn test.
11. **Gỡ SePay:** xoá client/IPN/return URL/env/dependency/test/docs (`RELEASE.md`, `api/README.md`, `.env.example`, `next.config.ts`, `locale-preference.ts`).
12. **Tài liệu:** viết lại `docs/chinh-sach.md` (2.3, 2.4, 2.8, 2.9, 3.3–3.5, phụ lục) theo luồng mới; cập nhật `CLAUDE.md` nếu mô tả thanh toán thay đổi.

Không xoá dữ liệu `payments`/`topups` cũ trong DB ở bất kỳ bước nào.
