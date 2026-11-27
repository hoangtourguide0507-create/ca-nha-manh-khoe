# Sổ Nhà 🏠

Web app nhắc việc nhà cho hai vợ chồng. Dữ liệu đồng bộ giữa hai máy, có thông báo đẩy trên màn hình khóa iPhone, và có sổ ghi các khoản chi lớn.

- **Nhắc việc theo 4 kiểu**
  - *Sau N ngày*: lặp lại kể từ lần làm gần nhất. Ví dụ thay cát mèo 3 ngày một lần, làm trễ thì lịch tự lùi theo.
  - *Theo tháng*: ngày cố định mỗi M tháng. Ví dụ tiền điện ngày 5 hằng tháng, bảo hiểm xe hằng năm. Trả trễ vẫn nhắc đúng ngày ở kỳ sau.
  - *Âm lịch*: hằng tháng (mùng 1, rằm, hay bất kỳ ngày âm nào) hoặc hằng năm (ngày giỗ, ông Công ông Táo, Vu Lan…). Tháng thiếu thì ngày 30 tính là ngày 29; giỗ không tính tháng nhuận.
  - *Một lần*: ví dụ hết bảo hành, lịch hẹn.
- **Hôm nay**: hiện việc quá hạn, việc đến hạn hôm nay và việc trong 7 ngày tới. Bấm ✓ là xong, có nút hoàn tác.
- **Chi phí & nơi mua**: việc bật *Ghi chi phí* sẽ hỏi giá và nơi mua mỗi lần xong (Shopee, Lazada, TikTok Shop, cửa hàng, Zalo người bán), gõ tắt được như `850k` hay `1tr2`. Trang chi tiết hiện giá lần trước, giá rẻ nhất, tổng năm, biểu đồ các kỳ và nút **Mua lại** (mở link Shopee, nhắn Zalo người bán, gọi hoặc chỉ đường tới cửa hàng).
- **Quét hóa đơn** (nút tròn **📷 Chụp bill** giữa thanh công cụ mở thẳng camera; hoặc tab *Chi tiêu* → 📷 Quét hóa đơn để chọn ảnh có sẵn): chụp bill siêu thị, app tự đọc tên quán, ngày mua, từng món (số lượng, đơn giá, thành tiền), giảm giá và tổng tiền rồi điền sẵn vào khoản chi để xem lại trước khi lưu. Đọc chữ ngay trên máy, ảnh không gửi đi đâu. Lần đầu tải bộ đọc chữ khoảng 110 MB.
- **Giá từng món** (tab *Chi tiêu* → 🏷️): tra giá mỗi món qua các lần mua, giá gần nhất, ▲▼ so với lần trước, thấp nhất/cao nhất và nơi mua.
- **Khoản chi**: ghi số tiền, ngày giờ, nhóm, cách thanh toán, người chi. Có tổng theo năm và theo nhóm. Từ một khoản chi có thể *tạo nhắc kèm* như bảo hiểm hay hết bảo hành.
- **Chi phí định kỳ**: tab *Chi tiêu* gom tiền các việc có ghi chi phí (điện nước, lõi lọc, tẩy giun…) theo năm, theo nhóm, từng việc và theo người/thú cưng. Thẻ của mỗi người (VD Thúi) hiện tổng chi năm nay.
- **Nhắc đặt hàng sớm**: việc mua online đặt *Nhắc đặt hàng trước N ngày* → mục 🛒 *Cần đặt hàng* ở màn Hôm nay và thông báo đẩy, có nút mở Shopee/Zalo và nút *Đã đặt*.
- **So giá**: khi nhập số tiền, đắt hơn lần trước từ 20% thì cảnh báo kèm giá rẻ nhất từng mua và nơi mua; lịch sử hiện ▲▼ % từng lần.
- **Danh bạ nơi mua**: gom shop Shopee, người bán Zalo, cửa hàng từ các lần mua; thêm, sửa (cập nhật cho mọi việc và lịch sử), bấm để mở link, nhắn Zalo hoặc gọi.
- **Người & thú cưng**: thêm Thúi, Má, Bé Na… rồi gắn vào việc (một việc gắn được nhiều người). Bấm vào avatar ở tab *Việc* để xem riêng việc của người đó. Gõ tên việc có chứa tên (VD “Thay cát cho Thúi”) thì tự chọn; thêm tên mới thì các việc cũ có tên đó cũng tự được gắn.
- **Hai người dùng chung**: mỗi việc giao cho một người hoặc cả hai, thông báo gửi đúng máy của người được giao.
- **Thông báo**: máy chủ kiểm tra mỗi giờ và nhắc từ giờ đã chọn (0:00–23:00). Nếu lỡ một lượt thì lượt sau vẫn nhắc, mỗi việc chỉ nhắc một lần mỗi ngày. Việc quá hạn được nhắc lại mỗi ngày cho đến khi xong. Số việc cần làm hiện trên icon app.
- **Chạy offline**: mất mạng vẫn dùng được, có mạng lại thì tự đồng bộ.

**Link app:** https://hoangtourguide0507-create.github.io/ca-nha-manh-khoe/
**Máy chủ:** https://so-nha-api.hoangtourguide0507.workers.dev (đã điền sẵn trong app)

## Cấu trúc

```
index.html, css/, js/, sw.js, manifest.webmanifest, icons/   ← giao diện (GitHub Pages)
worker/worker.js                                              ← máy chủ (Cloudflare Worker + D1)
```

| File | Việc |
|---|---|
| `js/app.js` | Giao diện, các màn hình, form |
| `js/schedule.js` | Tính ngày đến hạn |
| `js/lunar.js` | Đổi ngày dương sang âm lịch Việt Nam (UTC+7), tìm ngày âm kế tiếp |
| `js/store.js` | Lưu trên máy và đồng bộ. Địa chỉ Worker mặc định nằm ở `DEFAULT_API` |
| `js/push.js` | Bật hoặc tắt thông báo |
| `js/ocr/` | Bộ đọc hóa đơn đã đóng gói (dựng từ `tools/ocr/`, mã gốc [sakutara/chia-tien](https://github.com/sakutara/chia-tien), MIT) |
| `ocr/vietocr/` | Model VietOCR ONNX + thư viện WASM (Apache-2.0), tải khi quét lần đầu |
| `sw.js` | Chạy offline, nhận thông báo |
| `worker/worker.js` | API đồng bộ, gửi Web Push, lịch nhắc mỗi giờ |
| `.github/workflows/deploy-worker.yml` | Tự deploy Worker lên Cloudflare khi `worker/` đổi |

---

## Cài đặt (làm trên trình duyệt, không cần Terminal)

### Bước 1 — Đưa code lên GitHub

1. Vào github.com → **New repository** → đặt tên (nhà mình dùng `ca-nha-manh-khoe`) → chọn **Public** → **Create repository**.
2. Bấm **uploading an existing file**, kéo **toàn bộ file và thư mục** vào (giữ nguyên cấu trúc) → **Commit changes**.
3. Vào **Settings → Pages** → mục *Branch* chọn `main`, thư mục `/ (root)` → **Save**.
4. Đợi 1–2 phút. App sẽ chạy ở `https://<tên-github>.github.io/<tên-repo>/`, của nhà mình là https://hoangtourguide0507-create.github.io/ca-nha-manh-khoe/

### Bước 2 — Tạo máy chủ trên Cloudflare

1. **Tạo database**: Cloudflare → **Storage & Databases → D1** → **Create** → đặt tên `so-nha-db`.
2. **Tạo Worker**: **Workers & Pages → Create → Create Worker** → đặt tên `so-nha-api` → **Deploy**.
3. Bấm **Edit code**, xóa code mẫu, dán toàn bộ nội dung `worker/worker.js` vào → **Deploy**.
4. Vào Worker → **Settings → Bindings → Add → D1 database**:
   - Variable name: `DB`
   - Database: `so-nha-db`
5. *(Không bắt buộc)* Muốn khóa bằng mã nhà thì vào **Settings → Variables and Secrets → Add**:
   - Type: **Secret**
   - Name: `HOUSE_KEY`
   - Value: một mã bí mật, sau đó nhập mã này vào app trên cả hai máy.

   Nếu không đặt, ai biết địa chỉ Worker cũng xem và sửa được dữ liệu. Có thể thêm mã nhà bất cứ lúc nào mà không phải sửa code.
6. **Settings → Trigger Events → Add → Cron Triggers** → nhập `0 * * * *` (chạy mỗi giờ) → **Add**.
7. Chép địa chỉ Worker, dạng `https://so-nha-api.<tên-bạn>.workers.dev`. Mở địa chỉ này trên trình duyệt, thấy `"configured":true` là xong.
8. Mở `js/store.js`, sửa dòng `DEFAULT_API` thành địa chỉ Worker này để app tự điền sẵn trên mọi máy. Nhà mình đã điền: `https://so-nha-api.hoangtourguide0507.workers.dev`.

> Không cần tạo khóa VAPID. Worker tự tạo khóa ở lần bật thông báo đầu tiên và lưu vào D1.

### Bước 3 — Cài lên iPhone (làm trên cả hai máy)

1. Mở link GitHub Pages bằng **Safari** → bấm nút **Chia sẻ** → **Thêm vào MH chính**.
2. Mở **Sổ Nhà** từ màn hình chính (không mở trong Safari).
3. Vào tab **Cài đặt**:
   - *Địa chỉ Worker* đã được điền sẵn, không cần nhập. Chỉ khi đặt `HOUSE_KEY` mới cần nhập *Mã nhà* → **Lưu & kiểm tra**.
   - *Thành viên*: sửa tên hai người (chỉ cần làm trên một máy, máy kia tự cập nhật) → chọn **Tôi là** đúng người.
   - **Bật thông báo** → cho phép → bấm **Gửi thử** để kiểm tra.

Thông báo trên iPhone cần iOS 16.4 trở lên, và app phải được mở từ màn hình chính.

---

## Cập nhật app sau này

- **Sửa giao diện**: sửa file trên GitHub (bút chì ✏️ → Commit). Mở `sw.js`, tăng số phiên bản trong `CACHE` (hiện là `'sonha-v10'`) lên `v11`, `v12`… để điện thoại tải bản mới. Đóng hẳn app rồi mở lại.
- **Sửa máy chủ**: tự động — mỗi lần `worker/worker.js` đổi trên nhánh `main`, GitHub Actions đưa Worker lên Cloudflare (xem bên dưới). Dữ liệu trong D1 vẫn giữ nguyên. Chưa cài thì dán tay `worker/worker.js` vào Cloudflare → Deploy như cũ.

## Tự cập nhật Worker (làm một lần)

1. **Tạo mã truy cập Cloudflare**: dash.cloudflare.com → ảnh đại diện góc phải → **Profile → API Tokens → Create Token** → mẫu **Edit Cloudflare Workers** → **Use template**.
   - Mục *Permissions* bấm **+ Add more** → `Account` · `D1` · `Edit`.
   - *Account Resources*: chọn tài khoản của bạn. *Zone Resources*: **All zones** (hoặc để mặc định).
   - **Continue to summary → Create Token** → bấm **Copy** (mã chỉ hiện một lần).
2. **Dán vào GitHub**: repo → **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `CLOUDFLARE_API_TOKEN` · Secret: dán mã vừa chép → **Add secret**.
3. **Chạy thử**: repo → tab **Actions** → *Deploy Worker lên Cloudflare* → **Run workflow**. Có dấu ✓ xanh là xong.

Workflow tự đọc database D1 đang gắn với Worker `so-nha-api` (không cần ghi ID vào repo), giữ nguyên Cron `0 * * * *`, giữ nguyên secret `HOUSE_KEY` nếu có. Nếu báo lỗi "Token thấy N tài khoản", thêm secret `CLOUDFLARE_ACCOUNT_ID` (Account ID ở trang *Workers & Pages*, cột bên phải).

## Gặp lỗi

| Hiện tượng | Cách xử lý |
|---|---|
| "Sai mã nhà" | Mã trong app phải giống secret `HOUSE_KEY` trên Cloudflare (phân biệt hoa thường), hoặc xóa secret nếu không dùng mã |
| "Chưa gắn D1 database…" | Làm lại Bước 2.4, tên biến phải đúng là `DB` |
| Không thấy nút bật thông báo hoạt động | Phải mở app từ màn hình chính, không mở trong Safari |
| Gửi thử được nhưng không có nhắc tự động | Kiểm tra Cron Trigger `0 * * * *` và giờ nhắc của việc. Bấm *Nhắc ngay các việc đến hạn* để thử |
| Đổi máy hoặc cài lại | Địa chỉ Worker tự điền sẵn, dữ liệu tự tải về (nhập lại mã nhà nếu có đặt) |

Nên **Xuất sao lưu** (Cài đặt → Dữ liệu) định kỳ để giữ một bản dự phòng.

## Hướng phát triển tiếp

- Chụp ảnh hóa đơn đính kèm khoản chi
- Nhắc lặp trong ngày (ví dụ cho mèo uống thuốc 2 lần mỗi ngày)
- Báo cáo hóa đơn điện nước theo năm
