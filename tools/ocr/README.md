# OCR hóa đơn (tách từ chia-tien)

Nguồn: https://github.com/sakutara/chia-tien @ `265ab6b` (mã MIT, © 2026 Leonard Le).
Model: VietOCR vgg_seq2seq dạng ONNX (Apache-2.0, xem `ocr/vietocr/LICENSE-vietocr-onnx.txt`).

## Luồng xử lý
1. **Cắt & nắn** (`lib/imageScan` + `lib/documentScan`): ảnh xám, ngưỡng Otsu tìm tờ giấy sáng lớn nhất, RANSAC 4 cạnh → 4 góc, nắn phối cảnh, cạnh dài 2800 px. Giữ ảnh xám (không nhị phân hoá).
2. **Chuẩn bị OCR** (`lib/imagePreprocess`): EXIF, 2800 px (phóng ≤3×), xám, kéo giãn tương phản 2–98%.
3. **Worker VietOCR** (`workers/vietOcrWorker`): detector DB (960 px, ngưỡng 0,3, unclip 2) → hộp dòng; thử xoay 90/180/270 nếu điểm tin cậy 0° < 0,6; nắn nghiêng ≥0,5°; mỗi dòng cao 32 px → encoder/decoder, giải mã tham lam, bỏ đoạn lặp ảo giác.
4. **Ghép dòng** (`domain/ocrLayout`): gom từ theo tâm dọc, khoảng cách ngang lớn = 2 dấu cách (ranh giới cột).
5. **Phân tích** (`domain/receipt/*`): chuẩn hoá số (đ/₫, O→0, l→1…), bỏ dấu để khớp từ khoá, đọc tên quán, ngày, món (1 dòng / 2 dòng / bảng STT GTGT), giảm giá, phí, VAT nhiều mức, tổng.
6. **Đối chiếu** (`domain/receiptValidation`): món − giảm + phí + VAT phải = tổng bill, đúng từng đồng; lệch thì thử sửa (1↔4, bỏ dòng tổng bị đọc nhầm thành món…) → OK / CORRECTED / MISMATCH / UNVERIFIED.

## Chỉnh cho điện thoại (v1.12)
- `entry.ts`: thu nhỏ ảnh về cạnh dài 2800 px bằng `<img>` + canvas trước mọi bước (ảnh iPhone 12–48 MP; Safari bỏ qua tuỳ chọn resize của `createImageBitmap`), nhường nhịp vẽ giữa các bước.
- `vietOcrWorker.ts` (bản chỉnh của worker chia-tien): tự tải WASM + 3 model có báo tiến độ MB, lưu Cache `sonha-ocr-v1`, nạp từng model một để giảm bộ nhớ đỉnh; lỗi kèm tên bước.
- `ocrService.ts`: chuyển tiếp tiến độ tải/nạp, giữ chi tiết lỗi (`lastOcrError`).
- `js/app.js`: hiện từng bước, tự dừng và báo lỗi nếu đứng yên quá 90 giây, màn lỗi có chi tiết kỹ thuật + Thử lại.

## Bill máy POS quán (`posReceipt.ts`, v1.13)
- Kiểu "SL · Tên · Thành tiền" (Highlands, Phúc Long, Katinat…): dòng chữ không số ngay dưới món là topping/size → nối vào tên; dòng không SL có số tiền là khuyến mãi (OCR hay mất dấu trừ; tên kiểu mã KM `NWSM.SO.FREE_CAKE`, `KM10%`) hoặc topping tính tiền — thử cả hai cách, chọn cách khớp tổng.
- Tổng lấy từ Thành tiền / Tổng tiền / dòng thanh toán thẻ, tiền mặt (bỏ Tiền thừa); dòng tổng bị đọc hỏng (`10.00`) tự bị loại.
- `stripIdLines`: bỏ dòng ShopID, Check, số HĐ, số bàn, SĐT, MST… trước khi phân tích (cả hai bộ đọc).
- `entry.analyzeText` chạy song song bộ đọc chia-tien và posReceipt, bên nào khớp tổng thì dùng.

## Ảnh chụp màn hình app (`appReceipt.ts`, viết riêng cho Sổ Nhà)
- Nhận diện nguồn theo từ khoá: đơn hàng (Shopee, Lazada, TikTok Shop, Tiki, ShopeeFood, Grab, be) hoặc biên lai (MoMo, ZaloPay, ShopeePay, VNPAY, ngân hàng). Không nhận ra thì dùng bộ đọc bill giấy.
- Đơn hàng: tên món nhiều dòng + `Phân loại hàng` + `x2` + giá (giá gạch ngang bị bỏ), dạng `2x Món` của app đồ ăn, tiền hàng / phí ship / phí khác / voucher, giảm giá / tổng, mã đơn, ngày đặt, phương thức thanh toán.
- Ký hiệu ₫ đứng trước số không có trong bảng chữ của VietOCR nên hay bị đọc thành `đ`, `d`, `4` hoặc `2`, dấu trừ hay mất. Số không có tiền tố mà bắt đầu bằng 4/2 có thêm cách hiểu bỏ chữ số đầu; bộ đối chiếu chọn tổ hợp ít sửa nhất sao cho Σ món = tiền hàng và tiền hàng + phí − giảm = tổng.
- Biên lai: số tiền lớn ở đầu hoặc dòng "Số tiền", người nhận / nhà cung cấp, nội dung, dịch vụ, thời gian, mã giao dịch, phí.
- Nhiều ảnh: `mergeScreens` bỏ tiêu đề lặp và phần trùng ở chỗ nối.

## Dựng lại
```bash
cd tools/ocr && npm i
node build.mjs /đường/dẫn/chia-tien     # chia-tien/app cần `npm ci` trước
```
Kết quả: `js/ocr/ocr.js`, `js/ocr/ocr-worker.js`, `ocr/vietocr/` (≈110 MB, lần quét đầu phải tải về; Service Worker giữ trong cache `sonha-ocr-v1`).

## Dùng
```js
import { scanReceipt, readReceiptText } from './ocr/ocr.js';
const { summary, text } = await scanReceipt(file, { onProgress: (p, stage) => {} });
// ảnh chụp màn hình app, nhiều ảnh: scanReceipt([f1, f2], { screenshot: true })
// summary: { kind: 'paper'|'order'|'payment', source, sourceName, vendor, time, fee, orderId, paymentMethod, content, date, total, items[{name, quantity, unitPrice, amount, check}], discount, service, vat, status, notes[] }
```
