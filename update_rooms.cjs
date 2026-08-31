/**
 * update_rooms.cjs
 * ---------------------------------------------------------------------------
 * BƯỚC 2 (tuỳ chọn) của pipeline TKB.
 *
 * Cập nhật lại PHÒNG HỌC trong schedule_db.json dựa theo file tkb.xls
 * (bảng thời khoá biểu chính thức/mới nhất từ phòng đào tạo).
 *
 * Vì sao cần bước này?
 *   - schedule_db.json được dựng từ "Danh sách lớp học phần", phòng học ở đó
 *     có thể cũ. tkb.xls là bảng xếp phòng cập nhật hơn.
 *   - Script dò theo (Lớp học phần, Thứ, Tiết) và thay mã phòng nếu khác.
 *
 * Định dạng chuỗi thời khoá biểu:  3(1->3)P104C2 Giảng đường C2
 *   3        = thứ (day of week)
 *   1->3     = tiết bắt đầu -> tiết kết thúc
 *   P104C2   = mã phòng
 *   Giảng... = tên giảng đường (được suy ra từ hậu tố mã phòng)
 *
 * Chạy:  node update_rooms.cjs
 * (Chạy SAU build_schedule_db.mjs)
 */

const fs = require('fs');
const xlsx = require('xlsx');

const dbFile = 'schedule_db.json';
const backupFile = 'schedule_db_backup.json';
const xlsFile = process.env.TKB_XLS || 'tkb.xls';

if (!fs.existsSync(dbFile)) {
  console.error(`❌ Chưa có ${dbFile}. Hãy chạy: node build_schedule_db.mjs trước.`);
  process.exit(1);
}
if (!fs.existsSync(xlsFile)) {
  console.warn(`⚠️  Không tìm thấy ${xlsFile} → bỏ qua bước cập nhật phòng.`);
  process.exit(0); // Không coi là lỗi: build vẫn dùng được schedule_db.json cũ.
}

// Load DB + backup an toàn.
const dbRaw = fs.readFileSync(dbFile, 'utf8');
const db = JSON.parse(dbRaw);
fs.writeFileSync(backupFile, dbRaw);

// Đọc file tkb.xls (bảng xếp phòng mới).
const wb = xlsx.readFile(xlsFile);
const sheet = wb.Sheets[wb.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

// Dựng map: { "<Lớp HP>": [ { thu, tiet, phong } ] }
// Dữ liệu bắt đầu từ dòng index 8 (bỏ phần tiêu đề bảng).
const excelMap = {};
for (let i = 8; i < data.length; i++) {
  const row = data[i];
  if (!row || row.length === 0) continue;

  const lop = (row[3] || '').toString().trim(); // cột 3: Lớp HP
  const thu = (row[5] || '').toString().trim(); // cột 5: Thứ
  let tiet = (row[6] || '').toString().trim(); // cột 6: Tiết
  tiet = tiet.replace('->', '-').replace('-', '->'); // chuẩn hoá "1-3" -> "1->3"
  const phong = (row[8] || '').toString().trim(); // cột 8: Phòng

  if (lop) {
    if (!excelMap[lop]) excelMap[lop] = [];
    excelMap[lop].push({ thu, tiet, phong });
  }
}

let studentChangedCount = 0;
const modifiedClasses = new Set();
let itemsChangedCount = 0;

for (const mssv of Object.keys(db)) {
  const student = db[mssv];
  if (!student.tkb) continue;

  let studentChanged = false;
  for (const tkb of student.tkb) {
    const lop = tkb.lop_hoc_phan;
    if (!excelMap[lop]) continue;

    const oldStr = tkb.thoi_khoa_bieu;
    const parts = oldStr.split(';');

    const newParts = parts.map((part) => {
      // Match ví dụ: 3(1->3)P104C2 Giảng đường C2
      const match = part.match(/^(\d+)\((.+?)\)(.*)$/);
      if (match) {
        const day = match[1];
        const periods = match[2]; // "1->3"
        const oldRoom = match[3]; // "P104C2 Giảng đường C2"

        const excelInfo = excelMap[lop].find(
          (x) => x.thu === day && x.tiet === periods
        );
        if (excelInfo && excelInfo.phong) {
          const oldRoomCode = oldRoom.trim().split(' ')[0] || '';
          if (oldRoomCode !== excelInfo.phong) {
            let buildingStr = '';
            if (excelInfo.phong.endsWith('C2')) buildingStr = ' Giảng đường C2';
            else if (excelInfo.phong.endsWith('E5')) buildingStr = ' Giảng đường E5';
            else if (excelInfo.phong.endsWith('E7')) buildingStr = ' Giảng đường E7';
            else if (excelInfo.phong.endsWith('E9')) buildingStr = ' Giảng đường E9';
            else if (excelInfo.phong.startsWith('E1')) buildingStr = ' Giảng đường E1';

            return `${day}(${periods})${excelInfo.phong}${buildingStr}`;
          }
        }
      }
      return part; // không đổi
    });

    const newStr = newParts.join(';');
    if (newStr !== oldStr) {
      tkb.thoi_khoa_bieu = newStr;
      studentChanged = true;
      modifiedClasses.add(lop);
      itemsChangedCount++;
    }
  }
  if (studentChanged) studentChangedCount++;
}

fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), 'utf8');

console.log(
  `✅ Đã cập nhật ${itemsChangedCount} bản ghi TKB cho ${studentChangedCount} sinh viên.`
);
console.log(`   Số lớp bị ảnh hưởng: ${modifiedClasses.size}`);
