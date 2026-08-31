/**
 * build_schedule_db.mjs
 * ---------------------------------------------------------------------------
 * BƯỚC 1 của pipeline TKB.
 *
 * Đọc TẤT CẢ file Excel (.xls / .xlsx) trong thư mục danh sách lớp học phần
 * rồi tổng hợp thành 1 file JSON duy nhất: schedule_db.json
 *
 * Cấu trúc mỗi file Excel là "Danh sách lớp học phần" xuất từ hệ thống nhà
 * trường, trong đó:
 *   - Vài dòng đầu chứa thông tin môn: "Lớp học phần", "Mã học phần",
 *     "Thời khóa biểu".
 *   - Bảng bên dưới (bắt đầu bằng cột "STT") là danh sách sinh viên.
 *
 * Output db có dạng:
 *   {
 *     "<MSSV>": {
 *       "ho_ten": "Nguyễn Văn A",
 *       "tkb": [
 *         { "lop_hoc_phan": "...", "ma_hoc_phan": "...", "thoi_khoa_bieu": "..." }
 *       ]
 *     }
 *   }
 *
 * Chạy:  node build_schedule_db.mjs
 */

import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';

// Thư mục chứa các file Excel danh sách lớp học phần.
// Có thể đổi bằng biến môi trường DATA_DIR khi deploy.
const DIR = process.env.DATA_DIR || 'DS LỚP HP 090226';
const OUT_FILE = 'schedule_db.json';

if (!fs.existsSync(DIR)) {
  console.error(`❌ Không tìm thấy thư mục dữ liệu: "${DIR}"`);
  console.error('   Hãy đặt các file .xls danh sách lớp vào thư mục này,');
  console.error('   hoặc set biến môi trường DATA_DIR trỏ tới thư mục đúng.');
  process.exit(1);
}

const files = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.xls') || f.endsWith('.xlsx'));

if (files.length === 0) {
  console.error(`❌ Thư mục "${DIR}" không có file .xls/.xlsx nào.`);
  process.exit(1);
}

console.log(`Tìm thấy ${files.length} file Excel trong "${DIR}". Bắt đầu xử lý...`);

// db structure: { "MSSV": { ho_ten, tkb: [ { lop_hoc_phan, ma_hoc_phan, thoi_khoa_bieu } ] } }
const db = {};

for (const file of files) {
  const filePath = path.join(DIR, file);
  try {
    const wb = xlsx.readFile(filePath);

    // Một file có thể có nhiều sheet, ta lặp qua tất cả.
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

      let lop_hoc_phan = '';
      let ma_hoc_phan = '';
      let thoi_khoa_bieu = '';

      // Tìm thông tin môn học (thường nằm ở 15 dòng đầu).
      for (let i = 0; i < 15; i++) {
        if (!rows[i]) continue;
        const label = String(rows[i][0] || '').trim();
        if (label.startsWith('Lớp học phần')) {
          lop_hoc_phan = (rows[i][2] || '').toString().trim();
        }
        if (label.startsWith('Mã học phần')) {
          ma_hoc_phan = (rows[i][2] || '').toString().trim();
        }
        if (label.startsWith('Thời khóa biểu')) {
          thoi_khoa_bieu = (rows[i][2] || '').toString().trim();
        }
      }

      if (!lop_hoc_phan || !ma_hoc_phan) {
        // Sheet này không phải danh sách điểm danh → bỏ qua.
        continue;
      }

      const courseInfo = { lop_hoc_phan, ma_hoc_phan, thoi_khoa_bieu };

      // Tìm danh sách sinh viên (bắt đầu từ dòng có cột đầu là "STT").
      let started = false;
      for (let i = 0; i < rows.length; i++) {
        if (!started && rows[i] && String(rows[i][0]).trim() === 'STT') {
          started = true;
          continue;
        }
        if (started) {
          // Dừng khi gặp dòng trống / thiếu MSSV (kết thúc danh sách).
          if (!rows[i] || rows[i].length < 2 || !rows[i][1]) break;

          const mssv = String(rows[i][1]).trim();
          if (!mssv || mssv === 'undefined') break;

          const ho = String(rows[i][2] || '').trim();
          const ten = String(rows[i][3] || '').trim();
          const ho_ten = `${ho} ${ten}`.trim();

          if (!db[mssv]) {
            db[mssv] = { ho_ten, tkb: [] };
          } else if (!db[mssv].ho_ten && ho_ten) {
            db[mssv].ho_ten = ho_ten; // cập nhật tên nếu trước đó chưa có
          }

          // Tránh trùng môn nếu sinh viên xuất hiện nhiều lần trong cùng file.
          const exists = db[mssv].tkb.some(
            (c) =>
              c.ma_hoc_phan === courseInfo.ma_hoc_phan &&
              c.lop_hoc_phan === courseInfo.lop_hoc_phan
          );
          if (!exists) db[mssv].tkb.push(courseInfo);
        }
      }
    }
  } catch (error) {
    console.error(`⚠️  Lỗi khi đọc file ${file}:`, error.message);
  }
}

const totalStudents = Object.keys(db).length;
console.log(`Đã tổng hợp được TKB cho ${totalStudents} sinh viên.`);

fs.writeFileSync(OUT_FILE, JSON.stringify(db, null, 2), 'utf-8');
console.log(`✅ Đã lưu dữ liệu vào ${OUT_FILE} thành công!`);
