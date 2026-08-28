// routes/formFields.js - Admin CMS: จัดการ Field ของฟอร์ม "สร้างคำขอ Visit" แบบ Dynamic
// ไม่กระทบคอลัมน์เดิมของ visit_requests เลย (core fields ยังทำงานเหมือนเดิมทุกจุด)
const express = require('express');
const db = require('../db/database');
const { requireAuth, requireRole } = require('./middleware');
const { logAction } = require('../utils/systemLog');

const router = express.Router();

const FIELD_TYPES = ['text', 'textarea', 'number', 'email', 'phone', 'date', 'time', 'datetime', 'dropdown', 'multiselect', 'checkbox', 'radio', 'file'];
const OPTION_TYPES = ['dropdown', 'multiselect', 'radio'];
const KEY_RE = /^[a-z][a-z0-9_]*$/;
// field ที่จำเป็นต่อระบบ (ไม่อยู่ใน core_field_settings เพราะซ่อน/ลบไม่ได้) แต่ยังใช้เป็นจุดอ้างอิงตำแหน่งได้
const ESSENTIAL_FIELD_KEYS = ['visit_date', 'customer_id', 'time_from', 'time_to', 'purpose'];

// ตรวจสอบว่า position_after ที่ส่งมาอ้างอิงถึง field ที่มีอยู่จริงในระบบหรือไม่ (core หรือ custom ก็ได้)
function isValidPosition(value) {
  if (!value || value === 'TOP') return true;
  if (ESSENTIAL_FIELD_KEYS.includes(value)) return true;
  const core = db.prepare('SELECT 1 FROM core_field_settings WHERE field_key = ?').get(value);
  if (core) return true;
  const custom = db.prepare('SELECT 1 FROM custom_form_fields WHERE field_key = ?').get(value);
  return !!custom;
}

function parseField(row) {
  if (!row) return row;
  let options = [];
  if (row.options) {
    try { options = JSON.parse(row.options); } catch (e) { options = []; }
  }
  return {
    ...row,
    options,
    is_required: !!row.is_required,
    show_in_email: !!row.show_in_email,
    is_active: !!row.is_active
  };
}

// GET /api/form-fields  -> field ที่ active เท่านั้น (ใช้ render ฟอร์มจริง เข้าถึงได้ทุก role ที่ login แล้ว)
// GET /api/form-fields?all=1 -> ทุก field รวม inactive (Admin เท่านั้น ใช้ในหน้า Form Builder)
router.get('/', requireAuth, (req, res) => {
  if (req.query.all) {
    if (req.session.role !== 'Admin') return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้' });
    const rows = db.prepare('SELECT * FROM custom_form_fields ORDER BY sort_order ASC, id ASC').all();
    return res.json({ fields: rows.map(parseField) });
  }
  const rows = db.prepare('SELECT * FROM custom_form_fields WHERE is_active = 1 ORDER BY sort_order ASC, id ASC').all();
  res.json({ fields: rows.map(parseField) });
});

// POST /api/form-fields -> สร้าง Field ใหม่ (Admin)
router.post('/', requireAuth, requireRole('Admin'), (req, res) => {
  const { field_key, label, field_type, placeholder, description, options, is_required, default_value, show_in_email, position_after } = req.body;

  if (!field_key || !KEY_RE.test(field_key)) {
    return res.status(400).json({ error: 'field_key ต้องเป็นตัวพิมพ์เล็ก a-z, 0-9, _ เท่านั้น และขึ้นต้นด้วยตัวอักษร' });
  }
  if (!label || !label.trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อหัวข้อ (Label)' });
  if (!FIELD_TYPES.includes(field_type)) return res.status(400).json({ error: 'ประเภท Field ไม่ถูกต้อง' });
  if (!isValidPosition(position_after)) return res.status(400).json({ error: 'ตำแหน่งที่เลือกไม่ถูกต้อง' });

  const dup = db.prepare('SELECT id FROM custom_form_fields WHERE field_key = ?').get(field_key);
  if (dup) return res.status(400).json({ error: 'มี field_key นี้อยู่แล้ว' });

  let optionsJson = null;
  if (OPTION_TYPES.includes(field_type)) {
    const opts = Array.isArray(options) ? options.filter(o => (o || '').toString().trim()) : [];
    if (!opts.length) return res.status(400).json({ error: 'กรุณาระบุตัวเลือกอย่างน้อย 1 รายการ' });
    optionsJson = JSON.stringify(opts);
  }

  const maxOrder = db.prepare('SELECT MAX(sort_order) m FROM custom_form_fields').get().m;
  const sortOrder = (maxOrder === null ? -1 : maxOrder) + 1;

  const info = db.prepare(`
    INSERT INTO custom_form_fields
      (field_key, label, field_type, placeholder, description, options, is_required, default_value, show_in_email, sort_order, position_after, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(field_key, label.trim(), field_type, placeholder || '', description || '', optionsJson,
    is_required ? 1 : 0, default_value || '', show_in_email ? 1 : 0, sortOrder, position_after || '', req.session.userId);

  logAction(req.session.userId, 'create_form_field', `เพิ่ม Field ใหม่ในฟอร์ม Visit: ${label} (${field_key})`);
  res.status(201).json({ id: info.lastInsertRowid });
});

// PUT /api/form-fields/:id -> แก้ไข Field (Admin)
router.put('/:id', requireAuth, requireRole('Admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM custom_form_fields WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'ไม่พบ Field นี้' });

  const { label, field_type, placeholder, description, options, is_required, default_value, show_in_email, position_after } = req.body;

  if (!label || !label.trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อหัวข้อ (Label)' });
  if (!FIELD_TYPES.includes(field_type)) return res.status(400).json({ error: 'ประเภท Field ไม่ถูกต้อง' });
  if (position_after === existing.field_key) return res.status(400).json({ error: 'ไม่สามารถวางตำแหน่งอ้างอิงตัวเองได้' });
  if (!isValidPosition(position_after)) return res.status(400).json({ error: 'ตำแหน่งที่เลือกไม่ถูกต้อง' });

  let optionsJson = null;
  if (OPTION_TYPES.includes(field_type)) {
    const opts = Array.isArray(options) ? options.filter(o => (o || '').toString().trim()) : [];
    if (!opts.length) return res.status(400).json({ error: 'กรุณาระบุตัวเลือกอย่างน้อย 1 รายการ' });
    optionsJson = JSON.stringify(opts);
  }

  const oldLabel = existing.label;
  db.prepare(`
    UPDATE custom_form_fields
    SET label = ?, field_type = ?, placeholder = ?, description = ?, options = ?,
        is_required = ?, default_value = ?, show_in_email = ?, position_after = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(label.trim(), field_type, placeholder || '', description || '', optionsJson,
    is_required ? 1 : 0, default_value || '', show_in_email ? 1 : 0, position_after || '', req.params.id);

  logAction(req.session.userId, 'edit_form_field',
    `แก้ไข Field ในฟอร์ม Visit: "${oldLabel}" -> "${label}" (${existing.field_key})`);
  res.json({ ok: true });
});

// PATCH /api/form-fields/:id/active -> เปิด/ปิดการใช้งาน (ไม่ลบข้อมูล)
router.patch('/:id/active', requireAuth, requireRole('Admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM custom_form_fields WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'ไม่พบ Field นี้' });
  const isActive = req.body.is_active ? 1 : 0;
  db.prepare('UPDATE custom_form_fields SET is_active = ?, updated_at = datetime(\'now\') WHERE id = ?').run(isActive, req.params.id);
  logAction(req.session.userId, isActive ? 'enable_form_field' : 'disable_form_field',
    `${isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'} Field: ${existing.label} (${existing.field_key})`);
  res.json({ ok: true, is_active: !!isActive });
});

// PATCH /api/form-fields/reorder -> จัดลำดับใหม่ทั้งชุด { order: [id, id, id, ...] }
router.patch('/reorder', requireAuth, requireRole('Admin'), (req, res) => {
  const order = req.body.order;
  if (!Array.isArray(order) || !order.length) return res.status(400).json({ error: 'ข้อมูลลำดับไม่ถูกต้อง' });
  const stmt = db.prepare('UPDATE custom_form_fields SET sort_order = ? WHERE id = ?');
  const tx = db.transaction((ids) => { ids.forEach((id, idx) => stmt.run(idx, id)); });
  tx(order);
  logAction(req.session.userId, 'reorder_form_fields', `จัดลำดับ Field ในฟอร์ม Visit ใหม่`);
  res.json({ ok: true });
});

// DELETE /api/form-fields/:id -> ลบ Field ถาวร (แนะนำให้ปิดใช้งานแทนถ้าเป็นไปได้)
// ค่าที่เคยกรอกไว้ในคำขอเก่า (visit_custom_values) จะไม่ถูกลบตาม เพื่อไม่ให้ข้อมูล Visit เดิมเสียหาย
// แต่จะไม่มี label ให้แสดงอีกต่อไปเพราะตัวนิยาม Field ถูกลบไปแล้ว (คำเตือนนี้ควรแสดงที่หน้าเว็บก่อนลบ)
router.delete('/:id', requireAuth, requireRole('Admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM custom_form_fields WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'ไม่พบ Field นี้' });
  db.prepare('DELETE FROM custom_form_fields WHERE id = ?').run(req.params.id);
  logAction(req.session.userId, 'delete_form_field', `ลบ Field ในฟอร์ม Visit: ${existing.label} (${existing.field_key})`);
  res.json({ ok: true });
});

module.exports = router;
