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
// summary: { vendor, date, total, items[{name, quantity, unitPrice, amount, check}], discount, service, vat, status, notes[] }
```
