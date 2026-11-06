// routes/retentionSettings.js - ตั้งค่า/สั่งรัน การลบข้อมูลอัตโนมัติ (เฉพาะ Admin)
const express = require('express');
const db = require('../db/database');
const { requireAuth, requireRole } = require('./middleware');
const { logAction } = require('../utils/systemLog');
const { runRetentionCleanup, DATA_TYPES, LABELS } = require('../utils/retention');
const testData = require('../utils/testDataCleanup');

const router = express.Router();
const UNITS = ['day', 'month', 'year'];

router.get('/', requireAuth, requireRole('Admin'), (req, res) => {
  const rows = db.prepare('SELECT * FROM retention_settings').all();
  res.json({ settings: rows.map(r => ({ ...r, label: LABELS[r.data_type] || r.data_type })) });
});


// ===== ล้างข้อมูลทดสอบ (ใบลา / OT) =====
const guardEnabled = (req, res, next) => testData.isEnabled() ? next() : res.status(403).json({ error: 'ฟังก์ชันล้างข้อมูลทดสอบถูกปิดอยู่ (เปิดได้ที่สวิตช์ด้านบนของส่วนนี้)' });
const fmtD = (n) => Math.round(n * 100) / 100;

router.get('/test-data', requireAuth, requireRole('Admin'), (req, res) => res.json(testData.summary()));

router.put('/test-data/enabled', requireAuth, requireRole('Admin'), (req, res) => {
  const on = !!(req.body && req.body.enabled);
  testData.setEnabled(on);
  logAction(req.session.userId, 'toggle_test_data_cleanup', `${on ? 'เปิด' : 'ปิด'}ฟังก์ชันล้างข้อมูลทดสอบ`);
  res.json({ ok: true, enabled: on });
});

router.post('/test-data/leave', requireAuth, requireRole('Admin'), guardEnabled, (req, res) => {
  const r = testData.purgeLeave();
  logAction(req.session.userId, 'delete_all_leave', `ลบใบลาทั้งหมดทิ้งถาวร (${r.deleted} ใบ) คืนวันลา: พักร้อน ${fmtD(r.refunded.vacation)} / กิจ ${fmtD(r.refunded.personal)} / ป่วย ${fmtD(r.refunded.sick)} วัน (${r.users} คน) - ล้างข้อมูลทดสอบ`);
  res.json({ ok: true, ...r });
});

router.post('/test-data/ot', requireAuth, requireRole('Admin'), guardEnabled, (req, res) => {
  const r = testData.purgeOt();
  logAction(req.session.userId, 'delete_all_ot', `ลบคำขอ OT ทั้งหมดทิ้งถาวร (${r.deleted} ใบ) - ล้างข้อมูลทดสอบ`);
  res.json({ ok: true, ...r });
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
