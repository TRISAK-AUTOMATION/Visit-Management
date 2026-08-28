// routes/coreFields.js - Admin CMS: ซ่อน/แสดง และเปลี่ยนชื่อ Label ของ Field เดิมของระบบ
// สำคัญ: ไม่มี endpoint ลบ field เดิมเด็ดขาด เพราะ field เหล่านี้ผูกกับคอลัมน์จริงใน visit_requests
// ที่ PDF / Report / Email เดิมอ้างอิงชื่อคอลัมน์ตรงๆ — ทำได้แค่ "ซ่อนจากหน้า Create Visit" (ข้อมูลเก่า/PDF/Report ไม่กระทบ)
const express = require('express');
const db = require('../db/database');
const { requireAuth, requireRole } = require('./middleware');
const { logAction } = require('../utils/systemLog');

const router = express.Router();

// GET /api/core-field-settings -> ทุกคนที่ login แล้ว (ใช้ render ฟอร์ม Create Visit จริง)
router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM core_field_settings ORDER BY field_key').all();
  res.json({
    settings: rows.map(r => ({ ...r, is_visible: !!r.is_visible, is_required: !!r.is_required }))
  });
});

// PUT /api/core-field-settings/:field_key -> Admin แก้ label / is_visible / is_required
router.put('/:field_key', requireAuth, requireRole('Admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM core_field_settings WHERE field_key = ?').get(req.params.field_key);
  if (!existing) return res.status(404).json({ error: 'ไม่พบ Field นี้' });

  const { label, is_visible, is_required } = req.body;
  if (!label || !label.trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อหัวข้อ (Label)' });

  db.prepare(`
    UPDATE core_field_settings
    SET label = ?, is_visible = ?, is_required = ?, updated_at = datetime('now'), updated_by = ?
    WHERE field_key = ?
  `).run(label.trim(), is_visible ? 1 : 0, is_required ? 1 : 0, req.session.userId, req.params.field_key);

  const changeNote = [];
  if (existing.label !== label.trim()) changeNote.push(`ชื่อ "${existing.label}" -> "${label.trim()}"`);
  if (!!existing.is_visible !== !!is_visible) changeNote.push(is_visible ? 'เปิดแสดง' : 'ซ่อนจากฟอร์ม');
  if (!!existing.is_required !== !!is_required) changeNote.push(is_required ? 'ตั้งเป็นจำเป็นต้องกรอก' : 'ตั้งเป็นไม่บังคับ');

  logAction(req.session.userId, 'edit_core_field',
    `แก้ไข Field เดิม (${req.params.field_key}): ${changeNote.join(', ') || 'ไม่มีการเปลี่ยนแปลง'}`);
  res.json({ ok: true });
});

module.exports = router;
