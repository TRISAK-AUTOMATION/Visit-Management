// server.js - จุดเริ่มต้นของแอปพลิเคชัน TRISAK Visit Management System
require('dotenv').config(); // โหลดค่าคอนฟิกจากไฟล์ .env (เช่น SMTP_HOST, APP_BASE_URL) ถ้ามี
const path = require('path');
const express = require('express');
const session = require('express-session');
const SqliteSessionStore = require('./utils/sqliteSessionStore');

const app = express();
const PORT = process.env.PORT || 3000;
// ระบบถูกเปิดผ่าน proxy (เช่น ngrok) - ให้ Express เชื่อ X-Forwarded-* ของ proxy ชั้นแรก
// เพื่อให้รู้ว่าผู้ใช้เข้าผ่าน https (cookie แบบ secure) และได้ IP จริงของผู้ใช้ (ใช้จำกัดการล็อกอินผิด)
app.set('trust proxy', 1);

app.use(express.json({ limit: '8mb' })); // เผื่อรองรับ custom field ประเภทแนบไฟล์ (Form Builder) ที่ส่งเป็น base64
app.use(express.urlencoded({ extended: true })); // สำหรับฟอร์มยืนยันอนุมัติ/ไม่อนุมัติที่ส่งมาจากลิงก์ในอีเมล
// secret ของ session ควรตั้งใน .env (SESSION_SECRET=ข้อความสุ่มยาวๆ) ไม่ควรเขียนตายตัวในโค้ด
if (!process.env.SESSION_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[ผิดพลาด] NODE_ENV=production แต่ยังไม่ได้ตั้ง SESSION_SECRET ใน .env — ไม่ยอมเริ่มระบบ (กันใช้ secret ชั่วคราวที่ใครก็รู้)');
    process.exit(1);
  }
  console.warn('[คำเตือน] ยังไม่ได้ตั้ง SESSION_SECRET ใน .env — ใช้ค่าชั่วคราวซึ่งไม่ปลอดภัยสำหรับใช้งานจริง (ผู้ที่รู้ค่านี้ปลอมตัวเป็นผู้ใช้ได้)');
}
app.use(session({
  secret: process.env.SESSION_SECRET || 'trisak-dev-only-secret-change-me',
  resave: false,
  saveUninitialized: false,
  store: new SqliteSessionStore(require('./db/database')), // เก็บ session ใน SQLite เพื่อให้ "จำฉันไว้" ไม่หายเมื่อรีสตาร์ท server
  cookie: {
    maxAge: 1000 * 60 * 60 * 8,
    httpOnly: true,   // JavaScript ในหน้าเว็บอ่าน cookie นี้ไม่ได้
    sameSite: 'lax',  // ไม่ส่ง cookie ไปกับคำขอข้ามเว็บ (ลดความเสี่ยง CSRF)
    secure: 'auto'    // เข้าผ่าน https (เช่น ngrok) = ตั้ง secure ให้เอง, เข้าผ่าน http://localhost = ไม่ตั้ง จะได้ยังใช้งานได้
  } // 8 ชั่วโมง (ค่าเริ่มต้น; ถ้าติ๊ก "จำฉันไว้" จะถูกขยายเป็น 30 วันตอนล็อกอิน ดู routes/auth.js)
}));

// ---------- เตรียมฐานข้อมูล: เพิ่ม index ที่ยังไม่มี (ไม่แตะข้อมูล) ----------
require('./utils/dbMaintenance').ensureColumns(require('./db/database'));
require('./utils/dbMaintenance').ensureIndexes(require('./db/database'));

// ---------- API ROUTES ----------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/visit-requests', require('./routes/visitRequests'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/brands', require('./routes/brands'));
app.use('/api/leave-requests', require('./routes/leavePdf'));
app.use('/api/leave-requests', require('./routes/leave'));
app.use('/api/ot-requests', require('./routes/ot'));
app.use('/api/ot-requests', require('./routes/otPdf'));
app.use('/api/kpi', require('./routes/kpi'));
app.use('/api/report', require('./routes/report'));
app.use('/api/approval-templates', require('./routes/approvalTemplates'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/users', require('./routes/users'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/visit-requests', require('./routes/pdf'));
app.use('/api/system-logs', require('./routes/systemLogs'));
app.use('/api/form-fields', require('./routes/formFields'));
app.use('/api/core-field-settings', require('./routes/coreFields'));
app.use('/api/retention-settings', require('./routes/retentionSettings'));
app.use('/api/page-content', require('./routes/pageContent'));
app.use('/api/email-settings', require('./routes/emailSettings'));
app.use('/api/pdf-settings', require('./routes/pdfSettings'));

// ---------- STATIC FRONTEND (React build output จาก client/) ----------
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------- จัดการ error กลาง ----------
// ไม่ปล่อยให้ Express ตอบหน้า error ที่มี stack trace (เปิดเผยโครงสร้างโค้ด/ที่อยู่ไฟล์) — log ไว้ที่ console แล้วตอบ JSON สั้นๆ
app.use('/api', (req, res) => res.status(404).json({ error: 'ไม่พบเส้นทางที่เรียก' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'ข้อมูลที่ส่งมามีขนาดใหญ่เกินไป' });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'รูปแบบข้อมูลที่ส่งมาไม่ถูกต้อง' });
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err && err.stack ? err.stack : err);
  res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง' });
});

app.listen(PORT, () => {
  console.log(`🚀 TRISAK Visit Management System กำลังทำงานที่ http://localhost:${PORT}`);

  // ---------- ตัวจับเวลาลบข้อมูลอัตโนมัติ (Data Retention) ----------
  // เช็คทุก 24 ชม. ว่ามีกฎไหนเปิดใช้งานอยู่บ้าง แล้วลบข้อมูลที่เก่าเกินกำหนดตามกฎนั้น
  // รันครั้งแรกหลังสตาร์ท 2 นาที (ไม่รอเต็มวันแรก) จากนั้นรันซ้ำทุก 24 ชม.
  const { runRetentionCleanup } = require('./utils/retention');
  const DAY_MS = 24 * 60 * 60 * 1000;
  setTimeout(() => {
    try { runRetentionCleanup(); } catch (err) { console.error('[retention] รันตอนสตาร์ทไม่สำเร็จ:', err.message); }
    setInterval(() => {
      try { runRetentionCleanup(); } catch (err) { console.error('[retention] รันตามรอบไม่สำเร็จ:', err.message); }
    }, DAY_MS);
  }, 2 * 60 * 1000);
});
