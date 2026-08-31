/**
 * server.mjs – TKB API & Web Interface
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

/* ── Nạp schedule_db.json (cache trong RAM) ──────────────────────────── */
const SCHEDULE_DB_PATH = path.join(__dirname, 'schedule_db.json');

if (!fs.existsSync(SCHEDULE_DB_PATH)) {
  console.error('❌ Không tìm thấy schedule_db.json.');
  console.error('   Hãy chạy: npm run build-db   (build từ file Excel) trước khi start.');
  process.exit(1);
}

let scheduleDbCache = null;
async function getScheduleDb() {
  if (scheduleDbCache) return scheduleDbCache;
  const rawData = await fs.promises.readFile(SCHEDULE_DB_PATH, 'utf8');
  scheduleDbCache = JSON.parse(rawData);
  return scheduleDbCache;
}

/* ── Tiện ích trả JSON ───────────────────────────────────────────────── */
const ok = (res, data) => res.json({ ok: true, data });
const fail = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });

/* ── Express ─────────────────────────────────────────────────────────── */
const app = express();

const origins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(
  cors({
    origin(origin, callback) {
      if (origins.length === 0 || !origin || origins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS Blocked: Domain not allowed'));
      }
    },
  })
);

app.use(express.json());
app.disable('x-powered-by');

app.use((req, _res, next) => {
  process.stdout.write(`[${new Date().toISOString()}] ${req.method} ${req.url}\n`);
  next();
});

/* ── Phục vụ giao diện web tĩnh từ thư mục public ────────────────────── */
app.use(express.static(path.join(__dirname, 'public')));

/* ── API KEY (tuỳ chọn) ────────────────────────────────────────────── */
const API_KEY = process.env.API_KEY ?? null;
app.use((req, res, next) => {
  if (req.path === '/' || req.path === '/index.html') return next();
  if (!API_KEY) return next();

  const provided = req.headers['x-api-key'] ?? req.query.api_key ?? '';
  if (provided === API_KEY) return next();

  return res.status(401).json({
    ok: false,
    error: 'Thiếu hoặc sai API key.',
  });
});

/* ── Trang chủ Giao diện HTML ───────────────────────────────────────── */
app.get('/', (_req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({
      service: 'TKB API – Thời khoá biểu sinh viên',
      status: 'online',
      docs: {
        'GET /api/tkb/:mssv': 'Thời khoá biểu của 1 sinh viên (theo MSSV)',
      },
    });
  }
});

/* ── /api/tkb/:mssv ──────────────────────────────────────────────────── */
app.get('/api/tkb/:mssv', async (req, res) => {
  try {
    const mssv = req.params.mssv.toUpperCase().trim();
    const db = await getScheduleDb();
    const studentData = db[mssv];

    let items = [];
    let ho_ten = null;

    if (studentData) {
      if (Array.isArray(studentData)) {
        items = studentData;
      } else {
        items = studentData.tkb || [];
        ho_ten = studentData.ho_ten || null;
      }
    }

    if (!items || items.length === 0) {
      return ok(res, []);
    }

    const registered = items.map((item, idx) => {
      const rawTkb = String(item.thoi_khoa_bieu ?? '')
        .replace(/Th\?i gian h\?c/g, 'Thời gian học')
        .replace(/Th\?i/g, 'Thời')
        .replace(/h\?c/g, 'học')
        .replace(/Q\?i/g, 'Quí')
        .replace(/L\? /g, 'Lễ ')
        .replace(/L\?p/g, 'Lớp');

      const parts = rawTkb.split(';').map((p) => p.trim());

      let ngayBd = '';
      let ngayKt = '';
      const datePart = parts.find((p) => p.startsWith('Thời gian học:'));
      if (datePart) {
        const dates = datePart.replace('Thời gian học:', '').split('->');
        if (dates.length >= 2) {
          ngayBd = dates[0].trim();
          ngayKt = dates[1].trim();
        }
      }

      const gvPart = parts.find((p) => p.startsWith('GV:'));
      const giangVien = gvPart ? gvPart.replace('GV:', '').trim() : '';

      const scheduleParts = parts.filter(
        (p) => !p.startsWith('Thời gian học:') && !p.startsWith('GV:')
      );
      const formattedSchedules = scheduleParts.map((p) => {
        const match = p.match(/^(\d)\((\d+)->(\d+)\)(.*)$/);
        if (match) {
          const dow = match[1];
          let dayLabel = `Thứ ${dow}`;
          if (dow === '1' || dow === '8') dayLabel = 'Chủ nhật';

          const s = match[2];
          const e = match[3];
          const room = match[4].trim();
          return room
            ? `${dayLabel}: tiết ${s} -> ${e} | ${room}`
            : `${dayLabel}: tiết ${s} -> ${e}`;
        }
        return p;
      });

      const lichHoc = formattedSchedules.join(' | ');

      return {
        ID: String(idx),
        ID_HUY: String(idx),
        MA_LOP: item.ma_hoc_phan,
        MaLop: item.ma_hoc_phan,
        TEN_MON: item.lop_hoc_phan,
        TenMon: item.lop_hoc_phan,
        GIANG_VIEN: giangVien,
        TKB: lichHoc,
        LICH_HOC: lichHoc,
        LichHoc: lichHoc,
        TC: 0,
        SoTinChi: 0,
        HOC_PHI: 0,
        NGAY_BD_TG: ngayBd || '01/01/2026',
        NGAY_KT_TG: ngayKt || '01/01/2026',
        HO_TEN: ho_ten,
        MSSV: mssv,
      };
    });

    ok(res, registered);
  } catch (error) {
    fail(res, 'Lỗi đọc DB TKB: ' + String(error), 500);
  }
});

/* 404 + Error */
app.use((_req, res) => fail(res, 'Endpoint không tồn tại', 404));
app.use((e, _req, res, _next) => {
  console.error(e);
  fail(res, 'Lỗi server nội bộ', 500);
});

/* ── Start ───────────────────────────────────────────────────────────── */
app.listen(PORT, async () => {
  const db = await getScheduleDb();
  console.log('');
  console.log('🚀 TKB API đang chạy');
  console.log(`   URL : http://localhost:${PORT}`);
  console.log(`   SV  : ${Object.keys(db).length.toLocaleString()}`);
  console.log('');
});
