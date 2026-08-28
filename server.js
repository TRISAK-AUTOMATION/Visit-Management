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
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/users', require('./routes/users'));
app.use('/api/visit-requests', require('./routes/pdf'));
app.use('/api/system-logs', require('./routes/systemLogs'));
app.use('/api/form-fields', require('./routes/formFields'));
app.use('/api/core-field-settings', require('./routes/coreFields'));

// ---------- STATIC FRONTEND (React build output จาก client/) ----------
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 TRISAK Visit Management System กำลังทำงานที่ http://localhost:${PORT}`);
});
