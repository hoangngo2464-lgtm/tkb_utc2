# TKB API — Thời khoá biểu sinh viên

API đọc **file Excel danh sách lớp học phần** → tổng hợp thành 1 cơ sở dữ liệu JSON → phục vụ **thời khoá biểu (TKB)** của từng sinh viên qua HTTP. Deploy sẵn trên **Render** (gói free).

Hướng dẫn này viết cho **người mới hoàn toàn** — làm theo từng bước là chạy được.

---

## 1. Nó làm gì?

```
File Excel (.xls)                                    HTTP API
┌─────────────────────┐   build   ┌──────────────────┐   serve   ┌────────────────────┐
│ DS LỚP HP 090226/    │ ────────► │ schedule_db.json │ ────────► │ GET /api/tkb/:mssv  │
│   ANH.xls, BS0.xls…  │           │  (6600+ SV)      │           │  → lịch học của SV  │
│ tkb.xls (xếp phòng)  │           └──────────────────┘           └────────────────────┘
└─────────────────────┘
     BƯỚC 1 + 2                                                        BƯỚC 3
```

Pipeline gồm **3 bước**, tương ứng 3 file:

| Bước | File | Việc |
|------|------|------|
| 1 | `build_schedule_db.mjs` | Đọc mọi `.xls` trong thư mục `DS LỚP HP 090226/` → sinh ra `schedule_db.json` |
| 2 | `update_rooms.cjs` | (Tuỳ chọn) Cập nhật **phòng học** mới nhất từ `tkb.xls` vào `schedule_db.json` |
| 3 | `server.mjs` | Chạy web server, trả TKB tại `GET /api/tkb/:mssv` |

> Lệnh `npm run build-db` chạy gộp **bước 1 + 2**. Lệnh `npm start` chạy **bước 3**.

---

## 2. Cấu trúc thư mục

```
tkb-api/
├── DS LỚP HP 090226/        # DỮ LIỆU GỐC: các file .xls danh sách lớp học phần
│   ├── ANH.xls
│   ├── BS0.xls
│   └── ... (66 file)
├── tkb.xls                  # DỮ LIỆU GỐC: bảng xếp phòng mới (dùng cho bước 2)
├── build_schedule_db.mjs    # Bước 1
├── update_rooms.cjs         # Bước 2
├── server.mjs               # Bước 3 (API)
├── package.json             # Khai báo script + thư viện
├── render.yaml              # Cấu hình deploy Render
├── .gitignore
└── README.md                # File này
```

`schedule_db.json` **không có sẵn** — nó được **sinh ra** khi chạy bước 1+2 (và bị `.gitignore` bỏ qua).

---

## 3. Chạy thử trên máy (local)

### Yêu cầu
- **Node.js 22** trở lên → tải tại <https://nodejs.org> (chọn bản LTS 22.x). Kiểm tra:
  ```bash
  node -v      # phải in ra v22.x.x
  ```

### Các bước
```bash
# 1. Vào thư mục dự án
cd tkb-api

# 2. Cài thư viện (express, cors, xlsx)
npm install

# 3. Build cơ sở dữ liệu từ Excel  (chạy bước 1 + 2)
npm run build-db
#    → tạo ra file schedule_db.json

# 4. Khởi động server
npm start
#    → 🚀 TKB API đang chạy tại http://localhost:3000
```

### Thử API
Mở trình duyệt hoặc dùng `curl`:
```bash
# Kiểm tra sống
curl http://localhost:3000/

# Lấy thời khoá biểu 1 sinh viên (thay bằng MSSV có thật)
curl http://localhost:3000/api/tkb/6251010166
```

Kết quả mẫu:
```json
{
  "ok": true,
  "data": [
    {
      "MA_LOP": "Tiếng Anh A2-ANHA2.4",
      "TEN_MON": "Tiếng Anh A2-1-25-Lớp 1",
      "GIANG_VIEN": "Bùi Thị Nga",
      "TKB": "Thứ 6: tiết 11 -> 14 | P402C2 Giảng đường C2",
      "NGAY_BD_TG": "02/03/2026",
      "NGAY_KT_TG": "09/05/2026",
      "HO_TEN": "Nguyễn Tấn Phát",
      "MSSV": "6251010166"
    }
  ]
}
```

> MSSV không có dữ liệu sẽ trả `{"ok":true,"data":[]}` (mảng rỗng), không phải lỗi.

---

## 4. Deploy lên Render (miễn phí)

Render tự chạy `buildCommand` để build DB, rồi `startCommand` để chạy server. Cấu hình đã có sẵn trong `render.yaml`.

### Bước 4.1 — Đưa code lên GitHub
Render deploy từ một repo GitHub. Nếu chưa có:
```bash
cd tkb-api
git init
git add .
git commit -m "TKB API"
# Tạo repo rỗng trên github.com rồi:
git remote add origin https://github.com/<tên-bạn>/tkb-api.git
git branch -M main
git push -u origin main
```

> ⚠️ **Quan trọng:** file `.xls` (`DS LỚP HP 090226/` và `tkb.xls`) **PHẢI được commit** lên GitHub, vì Render cần chúng để build `schedule_db.json`. Chúng **không** nằm trong `.gitignore` nên `git add .` đã bao gồm sẵn — cứ kiểm tra `git status` thấy các file `.xls` là ổn.

### Bước 4.2 — Tạo service trên Render
1. Đăng nhập <https://render.com> → **New +** → **Blueprint**.
2. Kết nối tài khoản GitHub, chọn repo `tkb-api`.
3. Render tự đọc `render.yaml` và tạo 1 **Web Service** tên `tkb-api`.
4. (Tuỳ chọn) Ở phần **Environment**, nhập giá trị cho `API_KEY` nếu muốn bảo vệ API (xem mục 5). Không cần thì để trống.
5. Bấm **Apply / Create** → chờ Render:
   - `npm install` (cài thư viện)
   - `npm run build-db` (build DB từ Excel — mất ~1–2 phút)
   - `npm start` (khởi động)
6. Xong sẽ có URL công khai dạng `https://tkb-api-xxxx.onrender.com`.

### Bước 4.3 — Kiểm tra
```bash
curl https://tkb-api-xxxx.onrender.com/api/tkb/6251010166
```

> 💤 **Lưu ý gói Free của Render:** service sẽ "ngủ" sau ~15 phút không có request. Lần gọi đầu tiên sau khi ngủ sẽ chậm ~30–50 giây để khởi động lại — hoàn toàn bình thường.

---

## 5. Bảo vệ API bằng API key (tuỳ chọn)

Mặc định API **mở** cho mọi người gọi. Muốn giới hạn:

1. Trên Render → service → tab **Environment** → thêm biến:
   ```
   API_KEY = mot-chuoi-bi-mat-cua-ban
   ```
2. Sau đó mọi request (trừ `/`) phải kèm key:
   ```bash
   # Cách 1: header
   curl -H "x-api-key: mot-chuoi-bi-mat-cua-ban" https://.../api/tkb/6251010166

   # Cách 2: query
   curl "https://.../api/tkb/6251010166?api_key=mot-chuoi-bi-mat-cua-ban"
   ```
Thiếu/sai key → trả lỗi `401`.

**Giới hạn domain (CORS):** đặt biến `CORS_ORIGINS` (các domain cách nhau bằng dấu phẩy) để chỉ cho phép web của bạn gọi:
```
CORS_ORIGINS = https://utce2.app,http://localhost:5173
```
Để trống = cho phép tất cả.

---

## 6. Cập nhật dữ liệu học kỳ mới

Khi có danh sách lớp / xếp phòng mới:
1. Thay các file `.xls` trong `DS LỚP HP 090226/` và/hoặc `tkb.xls`.
2. Commit & push:
   ```bash
   git add .
   git commit -m "Cập nhật TKB học kỳ mới"
   git push
   ```
3. Render tự động build lại và deploy (vì `autoDeploy: true`).

Chạy lại local để kiểm tra trước khi push: `npm run build-db && npm start`.

---

## 7. Tham chiếu

### Biến môi trường
| Biến | Mặc định | Ý nghĩa |
|------|----------|---------|
| `PORT` | `3000` | Cổng server (Render tự set) |
| `API_KEY` | *(không)* | Bật xác thực nếu có giá trị |
| `CORS_ORIGINS` | *(rỗng = mọi domain)* | Danh sách domain được phép, cách nhau bằng `,` |
| `DATA_DIR` | `DS LỚP HP 090226` | Thư mục chứa file Excel (dùng ở bước 1) |
| `TKB_XLS` | `tkb.xls` | File xếp phòng (dùng ở bước 2) |

### Endpoint
| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/` | Health check + mô tả dịch vụ |
| GET | `/api/tkb/:mssv` | Thời khoá biểu của sinh viên theo MSSV |

### Lệnh npm
| Lệnh | Việc |
|------|------|
| `npm run build-db` | Build `schedule_db.json` từ Excel (bước 1 + 2) |
| `npm start` | Chạy server (bước 3) |
| `npm run dev` | Chạy server có tự reload khi sửa code |

---

## 8. Xử lý sự cố

| Hiện tượng | Nguyên nhân & cách sửa |
|-----------|------------------------|
| `❌ Không tìm thấy schedule_db.json` khi `npm start` | Chưa build DB → chạy `npm run build-db` trước. |
| `❌ Không tìm thấy thư mục dữ liệu` khi build | Thiếu thư mục `DS LỚP HP 090226/` hoặc sai tên → kiểm tra, hoặc set `DATA_DIR`. |
| Deploy Render nhưng gọi API ra `data: []` | File `.xls` chưa được commit lên GitHub → kiểm tra `git status`, thêm và push lại. |
| Request đầu tiên rất chậm | Gói Free ngủ sau 15 phút — bình thường, đợi ~30–50s. |
| Lỗi `401 Thiếu hoặc sai API key` | Đã đặt `API_KEY` trên Render → nhớ gửi kèm header `x-api-key`. |
| `node -v` báo bản < 22 | Cài Node.js 22 LTS từ nodejs.org. |
