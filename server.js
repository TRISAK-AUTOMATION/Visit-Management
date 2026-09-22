// server.js - จุดเริ่มต้นของแอปพลิเคชัน TRISAK Visit Management System
require('dotenv').config(); // โหลดค่าคอนฟิกจากไฟล์ .env (เช่น SMTP_HOST, APP_BASE_URL) ถ้ามี
const path = require('path');
const express = require('express');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '8mb' })); // เผื่อรองรับ custom field ประเภทแนบไฟล์ (Form Builder) ที่ส่งเป็น base64
app.use(express.urlencoded({ extended: true })); // สำหรับฟอร์มยืนยันอนุมัติ/ไม่อนุมัติที่ส่งมาจากลิงก์ในอีเมล
app.use(session({
  secret: 'trisak-visit-management-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 ชั่วโมง
}));

// ---------- API ROUTES ----------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/visit-requests', require('./routes/visitRequests'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/leave-requests', require('./routes/leave'));
app.use('/api/ot-requests', require('./routes/ot'));
app.use('/api/ot-requests', require('./routes/otPdf'));
app.use('/api/kpi', require('./routes/kpi'));
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
