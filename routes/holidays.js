// routes/holidays.js - วันหยุดนักขัตฤกษ์/วันหยุดบริษัท: ทุกคนดูได้, Admin เพิ่ม/ลบ
const express = require('express');
const db = require('../db/database');
const { requireAuth, requireRole } = require('./middleware');
const { isDate } = require('../utils/holidays');
const { logAction } = require('../utils/systemLog');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const year = /^\d{4}$/.test(req.query.year || '') ? req.query.year : null;
  const rows = year
    ? db.prepare(`SELECT id, holiday_date, name FROM holidays WHERE substr(holiday_date,1,4) = ? ORDER BY holiday_date`).all(year)
    : db.prepare(`SELECT id, holiday_date, name FROM holidays ORDER BY holiday_date DESC LIMIT 500`).all();
  res.json({ holidays: rows });
});

router.post('/', requireAuth, requireRole('Admin'), (req, res) => {
  const { holiday_date } = req.body;
  const name = String(req.body.name || '').trim();
  if (!isDate(holiday_date) || isNaN(Date.parse(holiday_date))) return res.status(400).json({ error: 'วันที่ไม่ถูกต้อง' });
  if (!name || name.length > 100) return res.status(400).json({ error: 'กรุณาระบุชื่อวันหยุด (ไม่เกิน 100 ตัวอักษร)' });
  try {
    const r = db.prepare('INSERT INTO holidays (holiday_date, name) VALUES (?, ?)').run(holiday_date, name);
    try { logAction(req.session.userId, 'holiday_add', `${holiday_date} ${name}`); } catch (e) { /* log ไม่สำเร็จไม่ขัด */ }
    res.json({ id: r.lastInsertRowid });
  } catch (err) {
    if (/UNIQUE/i.test(err.message)) return res.status(400).json({ error: 'มีวันหยุดวันนี้อยู่แล้ว' });
    console.error('[holidays]', err.message);
    res.status(500).json({ error: 'บันทึกไม่สำเร็จ' });
  }
});

router.delete('/:id', requireAuth, requireRole('Admin'), (req, res) => {
  const r = db.prepare('DELETE FROM holidays WHERE id = ?').run(parseInt(req.params.id, 10) || 0);
  if (!r.changes) return res.status(404).json({ error: 'ไม่พบวันหยุด' });
  res.json({ ok: true });
});

module.exports = router;
