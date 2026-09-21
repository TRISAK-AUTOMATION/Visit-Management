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
  const rows = db.prepare('SELECT * FROM core_field_settings ORDER BY sort_order ASC, field_key ASC').all();
  res.json({
    settings: rows.map(r => ({ ...r, is_visible: !!r.is_visible, is_required: !!r.is_required, show_in_email: !!r.show_in_email }))
  });
});

// PATCH /api/core-field-settings/:field_key/email -> เปิด/ปิด "แสดงใน Email แจ้งเตือน" ของ Field เดิม (แยกจากการแก้ label/visibility)
router.patch('/:field_key/email', requireAuth, requireRole('Admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM core_field_settings WHERE field_key = ?').get(req.params.field_key);
  if (!existing) return res.status(404).json({ error: 'ไม่พบ Field นี้' });
  const showInEmail = req.body.show_in_email ? 1 : 0;
  db.prepare('UPDATE core_field_settings SET show_in_email = ?, updated_at = datetime(\'now\'), updated_by = ? WHERE field_key = ?')
    .run(showInEmail, req.session.userId, req.params.field_key);
  logAction(req.session.userId, 'edit_core_field_email',
    `${showInEmail ? 'เปิด' : 'ปิด'}แสดงใน Email สำหรับ Field เดิม: ${existing.label} (${req.params.field_key})`);
  res.json({ ok: true, show_in_email: !!showInEmail });
});

// PATCH /api/core-field-settings/reorder -> Admin จัดลำดับ Field เดิมใหม่ทั้งชุด { order: [field_key, field_key, ...] }
router.patch('/reorder', requireAuth, requireRole('Admin'), (req, res) => {
  const order = req.body.order;
  if (!Array.isArray(order) || !order.length) return res.status(400).json({ error: 'ข้อมูลลำดับไม่ถูกต้อง' });
  const stmt = db.prepare('UPDATE core_field_settings SET sort_order = ? WHERE field_key = ?');
  const tx = db.transaction((keys) => { keys.forEach((key, idx) => stmt.run(idx, key)); });
  tx(order);
  logAction(req.session.userId, 'reorder_core_fields', `จัดลำดับ Field เดิมของระบบใหม่`);
  res.json({ ok: true });
});

// GET /api/core-field-settings/essential-labels -> ทุกคนที่ login แล้ว (ใช้ render ฟอร์ม Create Visit จริง)
// Label ของ Field พื้นฐานที่จำเป็นต่อระบบ (วันที่ / รหัสลูกค้า / เวลาเริ่ม / เวลาสิ้นสุด / วัตถุประสงค์)
// ต่างจาก core_field_settings ตรงที่ field กลุ่มนี้ไม่มี is_visible/is_required ให้ปรับ (ต้องแสดง+บังคับกรอกเสมอ) แก้ได้แค่ชื่อหัวข้อ
router.get('/essential-labels', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT field_key, label FROM essential_field_labels').all();
  res.json({ labels: rows });
});

// PUT /api/core-field-settings/essential-labels/:field_key -> Admin แก้ label เท่านั้น
router.put('/essential-labels/:field_key', requireAuth, requireRole('Admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM essential_field_labels WHERE field_key = ?').get(req.params.field_key);
  if (!existing) return res.status(404).json({ error: 'ไม่พบ Field นี้' });

  const { label } = req.body;
  if (!label || !label.trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อหัวข้อ (Label)' });

  db.prepare(`
    UPDATE essential_field_labels
    SET label = ?, updated_at = datetime('now'), updated_by = ?
    WHERE field_key = ?
  `).run(label.trim(), req.session.userId, req.params.field_key);

  logAction(req.session.userId, 'edit_essential_field_label',
    `แก้ไขชื่อหัวข้อ Field พื้นฐาน (${req.params.field_key}): "${existing.label}" -> "${label.trim()}"`);
  res.json({ ok: true });
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
