# Sổ Nhà 🏠

Web app nhắc việc nhà cho hai vợ chồng. Dữ liệu đồng bộ giữa hai máy, có thông báo đẩy trên màn hình khóa iPhone, và có sổ ghi các khoản chi lớn.

- **Nhắc việc theo 3 kiểu**
  - *Sau N ngày*: lặp lại kể từ lần làm gần nhất. Ví dụ thay cát mèo 3 ngày một lần, làm trễ thì lịch tự lùi theo.
  - *Theo tháng*: ngày cố định mỗi M tháng. Ví dụ tiền điện ngày 5 hằng tháng, bảo hiểm xe hằng năm. Trả trễ vẫn nhắc đúng ngày ở kỳ sau.
  - *Một lần*: ví dụ hết bảo hành, lịch hẹn.
- **Hôm nay**: hiện việc quá hạn, việc đến hạn hôm nay và việc trong 7 ngày tới. Bấm ✓ là xong, có nút hoàn tác.
- **Hóa đơn**: ghi số tiền mỗi lần trả, gõ tắt được như `850k` hay `1tr2`. Xem được biểu đồ các kỳ gần đây.
- **Chi lớn**: ghi số tiền, ngày giờ, nhóm, cách thanh toán, người chi. Có tổng theo năm và theo nhóm. Từ một khoản chi có thể *tạo nhắc kèm* như bảo hiểm hay hết bảo hành.
- **Hai người dùng chung**: mỗi việc giao cho một người hoặc cả hai, thông báo gửi đúng máy của người được giao.
- **Thông báo**: máy chủ kiểm tra mỗi giờ và nhắc đúng giờ đã chọn. Việc quá hạn được nhắc lại mỗi ngày cho đến khi xong. Số việc cần làm hiện trên icon app.
- **Chạy offline**: mất mạng vẫn dùng được, có mạng lại thì tự đồng bộ.

## Cấu trúc

```
index.html, css/, js/, sw.js, manifest.webmanifest, icons/   ← giao diện (GitHub Pages)
worker/worker.js                                              ← máy chủ (Cloudflare Worker + D1)
```

| File | Việc |
|---|---|
| `js/app.js` | Giao diện, các màn hình, form |
| `js/schedule.js` | Tính ngày đến hạn |
| `js/store.js` | Lưu trên máy và đồng bộ |
| `js/push.js` | Bật hoặc tắt thông báo |
| `sw.js` | Chạy offline, nhận thông báo |
| `worker/worker.js` | API đồng bộ, gửi Web Push, lịch nhắc mỗi giờ |

---

## Cài đặt (làm trên trình duyệt, không cần Terminal)

### Bước 1 — Đưa code lên GitHub

1. Vào github.com → **New repository** → đặt tên `so-nha` → chọn **Public** → **Create repository**.
2. Bấm **uploading an existing file**, kéo **toàn bộ file và thư mục** trong thư mục `so-nha` vào (giữ nguyên cấu trúc) → **Commit changes**.
3. Vào **Settings → Pages** → mục *Branch* chọn `main`, thư mục `/ (root)` → **Save**.
4. Đợi 1–2 phút. App sẽ chạy ở `https://<tên-github>.github.io/so-nha/`.

### Bước 2 — Tạo máy chủ trên Cloudflare

1. **Tạo database**: Cloudflare → **Storage & Databases → D1** → **Create** → đặt tên `so-nha-db`.
2. **Tạo Worker**: **Workers & Pages → Create → Create Worker** → đặt tên `so-nha-api` → **Deploy**.
3. Bấm **Edit code**, xóa code mẫu, dán toàn bộ nội dung `worker/worker.js` vào → **Deploy**.
4. Vào Worker → **Settings → Bindings → Add → D1 database**:
   - Variable name: `DB`
   - Database: `so-nha-db`
5. **Settings → Variables and Secrets → Add**:
   - Type: **Secret**
   - Name: `HOUSE_KEY`
   - Value: một mã bí mật đủ dài, ví dụ `nha-minh-2026-hoa-sen-73`. Hai vợ chồng sẽ nhập mã này vào app.
6. **Settings → Trigger Events → Add → Cron Triggers** → nhập `0 * * * *` (chạy mỗi giờ) → **Add**.
7. Chép địa chỉ Worker, dạng `https://so-nha-api.<tên-bạn>.workers.dev`. Mở địa chỉ này trên trình duyệt, thấy `"configured":true` là xong.

> Không cần tạo khóa VAPID. Worker tự tạo khóa ở lần bật thông báo đầu tiên và lưu vào D1.

### Bước 3 — Cài lên iPhone (làm trên cả hai máy)

1. Mở link GitHub Pages bằng **Safari** → bấm nút **Chia sẻ** → **Thêm vào MH chính**.
2. Mở **Sổ Nhà** từ màn hình chính (không mở trong Safari).
3. Vào tab **Cài đặt**:
   - Dán *Địa chỉ Worker*, nhập *Mã nhà* → **Lưu & kiểm tra**.
   - *Thành viên*: sửa tên hai người (chỉ cần làm trên một máy, máy kia tự cập nhật) → chọn **Tôi là** đúng người.
   - **Bật thông báo** → cho phép → bấm **Gửi thử** để kiểm tra.

Thông báo trên iPhone cần iOS 16.4 trở lên, và app phải được mở từ màn hình chính.

---

## Cập nhật app sau này

- **Sửa giao diện**: sửa file trên GitHub (bút chì ✏️ → Commit). Mở `sw.js`, tăng `CACHE = 'sonha-v1'` lên `v2` để điện thoại tải bản mới. Đóng hẳn app rồi mở lại.
- **Sửa máy chủ**: dán lại `worker/worker.js` vào Cloudflare → Deploy. Dữ liệu trong D1 vẫn giữ nguyên.

## Gặp lỗi

| Hiện tượng | Cách xử lý |
|---|---|
| "Sai mã nhà" | Kiểm tra secret `HOUSE_KEY` trên Cloudflare, chú ý phân biệt hoa thường |
| "Chưa gắn D1 database…" | Làm lại Bước 2.4, tên biến phải đúng là `DB` |
| Không thấy nút bật thông báo hoạt động | Phải mở app từ màn hình chính, không mở trong Safari |
| Gửi thử được nhưng không có nhắc tự động | Kiểm tra Cron Trigger `0 * * * *` và giờ nhắc của việc. Bấm *Nhắc ngay các việc đến hạn* để thử |
| Đổi máy hoặc cài lại | Nhập lại địa chỉ Worker và mã nhà, dữ liệu tự tải về |

Nên **Xuất sao lưu** (Cài đặt → Dữ liệu) định kỳ để giữ một bản dự phòng.

## Hướng phát triển tiếp

- Nhắc theo lịch âm (mùng 1, rằm, giỗ)
- Chụp ảnh hóa đơn đính kèm khoản chi
- Nhắc lặp trong ngày (ví dụ cho mèo uống thuốc 2 lần mỗi ngày)
- Báo cáo hóa đơn điện nước theo năm
