// routes/retentionSettings.js - ตั้งค่า/สั่งรัน การลบข้อมูลอัตโนมัติ (เฉพาะ Admin)
const express = require('express');
const db = require('../db/database');
const { requireAuth, requireRole } = require('./middleware');
const { logAction } = require('../utils/systemLog');
const { runRetentionCleanup, DATA_TYPES, LABELS } = require('../utils/retention');

const router = express.Router();
const UNITS = ['day', 'month', 'year'];

router.get('/', requireAuth, requireRole('Admin'), (req, res) => {
  const rows = db.prepare('SELECT * FROM retention_settings').all();
  res.json({ settings: rows.map(r => ({ ...r, label: LABELS[r.data_type] || r.data_type })) });
});

router.put('/:data_type', requireAuth, requireRole('Admin'), (req, res) => {
  const { data_type } = req.params;
  const { enabled, retain_value, retain_unit } = req.body;

  if (!DATA_TYPES.includes(data_type)) return res.status(400).json({ error: 'ประเภทข้อมูลไม่ถูกต้อง' });
  if (!UNITS.includes(retain_unit)) return res.status(400).json({ error: `หน่วยเวลาไม่ถูกต้อง (${UNITS.join(', ')})` });
  const n = Number(retain_value);
  if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: 'จำนวนต้องเป็นจำนวนเต็มมากกว่า 0' });

  db.prepare(`
    UPDATE retention_settings SET enabled = ?, retain_value = ?, retain_unit = ? WHERE data_type = ?
  `).run(enabled ? 1 : 0, n, retain_unit, data_type);

  logAction(req.session.userId, 'update_retention_setting',
    `ตั้งค่าลบอัตโนมัติ "${LABELS[data_type] || data_type}": ${enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'} เก็บไว้ ${n} ${retain_unit}`);

  res.json({ ok: true });
});

// สั่งรันทันที (สำหรับทดสอบ หรือเคลียร์ข้อมูลตามกฎที่ตั้งไว้ทันทีโดยไม่ต้องรอรอบถัดไป)
router.post('/run-now', requireAuth, requireRole('Admin'), (req, res) => {
  const results = runRetentionCleanup();
  logAction(req.session.userId, 'run_retention_now', `สั่งรันลบข้อมูลอัตโนมัติด้วยตนเอง: ${JSON.stringify(results)}`);
  res.json({ ok: true, results });
});

module.exports = router;
