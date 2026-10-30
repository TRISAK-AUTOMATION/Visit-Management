// routes/formOptions.js - ตัวเลือกของฟอร์ม Visit (Objective/Problem/Project/Potential/Found/Action ฯลฯ) ที่ Admin จัดการได้
const express = require('express');
const db = require('../db/database');
const { requireAuth, requireRole } = require('./middleware');
const { logAction } = require('../utils/systemLog');

const router = express.Router();

const GROUPS = {
  objective: 'Visit Objective (หัวข้อ 2)',
  problems: 'Customer Problem (3.3)',
  projects: 'Upcoming Project (3.4)',
  timings: 'Project Timing (3.4)',
  potentials: 'Potential Product (3.5)',
  found: 'What did we find? (หัวข้อ 4)',
  actions: 'Next Action (หัวข้อ 5)',
  job_type: 'Job Type (หัวข้อ 1)',
  transport: 'Transport (หัวข้อ 1)',
  company: 'Company (หัวข้อ 1)'
};
const bool = (v) => (v ? 1 : 0);
const flag = (r) => ({ id: r.id, group_key: r.group_key, value: r.value, sort_order: r.sort_order, is_active: !!r.is_active, is_other: !!r.is_other, is_exclusive: !!r.is_exclusive });

// ทุกคนที่ login: เฉพาะตัวเลือกที่เปิดใช้ เรียงตามลำดับ (ใช้ render ฟอร์มจริง)
router.get('/', requireAuth, (req, res) => {
  const out = {};
  Object.keys(GROUPS).forEach((g) => { out[g] = []; });
  db.prepare('SELECT * FROM form_options WHERE is_active = 1 ORDER BY sort_order ASC, id ASC').all()
    .forEach((r) => { if (out[r.group_key]) out[r.group_key].push(flag(r)); });
  res.json({ options: out });
});

// Admin: ทั้งหมด รวมที่ปิดใช้
router.get('/admin', requireAuth, requireRole('Admin'), (req, res) => {
  const rows = db.prepare('SELECT * FROM form_options ORDER BY sort_order ASC, id ASC').all().map(flag);
  res.json({ groups: Object.entries(GROUPS).map(([key, title]) => ({ key, title, items: rows.filter((r) => r.group_key === key) })) });
});

const cleanValue = (v) => String(v === undefined || v === null ? '' : v).trim().replace(/\s+/g, ' ');

router.post('/', requireAuth, requireRole('Admin'), (req, res) => {
  const { group_key } = req.body || {};
  const value = cleanValue(req.body && req.body.value);
  if (!GROUPS[group_key]) return res.status(400).json({ error: 'กลุ่มตัวเลือกไม่ถูกต้อง' });
  if (!value) return res.status(400).json({ error: 'กรุณาระบุชื่อตัวเลือก' });
  if (value.length > 80) return res.status(400).json({ error: 'ชื่อตัวเลือกยาวเกินไป (ไม่เกิน 80 ตัวอักษร)' });
  if (db.prepare('SELECT 1 FROM form_options WHERE group_key = ? AND value = ?').get(group_key, value)) return res.status(409).json({ error: 'มีตัวเลือกนี้อยู่แล้ว' });
  const next = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM form_options WHERE group_key = ?').get(group_key) || { n: 0 }).n;
  const r = db.prepare('INSERT INTO form_options (group_key, value, sort_order, is_other, is_exclusive) VALUES (?, ?, ?, ?, ?)')
    .run(group_key, value, next, bool(req.body.is_other), bool(req.body.is_exclusive));
  logAction(req.session.userId, 'add_form_option', `เพิ่มตัวเลือก "${value}" ใน ${GROUPS[group_key]}`);
  res.json({ ok: true, id: r.lastInsertRowid });
});

router.patch('/reorder', requireAuth, requireRole('Admin'), (req, res) => {
  const { group_key, order } = req.body || {};
  if (!GROUPS[group_key] || !Array.isArray(order) || order.some((n) => !Number.isInteger(n))) return res.status(400).json({ error: 'ข้อมูลลำดับไม่ถูกต้อง' });
  const st = db.prepare('UPDATE form_options SET sort_order = ? WHERE id = ? AND group_key = ?');
  db.transaction(() => order.forEach((id, i) => st.run(i, id, group_key)))();
  logAction(req.session.userId, 'reorder_form_options', `จัดลำดับตัวเลือก ${GROUPS[group_key]}`);
  res.json({ ok: true });
});

router.patch('/:id', requireAuth, requireRole('Admin'), (req, res) => {
  const row = db.prepare('SELECT * FROM form_options WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'ไม่พบตัวเลือก' });
  const b = req.body || {};
  const value = b.value !== undefined ? cleanValue(b.value) : row.value;
  if (!value) return res.status(400).json({ error: 'กรุณาระบุชื่อตัวเลือก' });
  if (value.length > 80) return res.status(400).json({ error: 'ชื่อตัวเลือกยาวเกินไป (ไม่เกิน 80 ตัวอักษร)' });
  if (value !== row.value && db.prepare('SELECT 1 FROM form_options WHERE group_key = ? AND value = ? AND id != ?').get(row.group_key, value, row.id)) {
    return res.status(409).json({ error: 'มีตัวเลือกนี้อยู่แล้ว' });
  }
  db.prepare('UPDATE form_options SET value = ?, is_active = ?, is_other = ?, is_exclusive = ? WHERE id = ?').run(
    value, b.is_active === undefined ? row.is_active : bool(b.is_active), b.is_other === undefined ? row.is_other : bool(b.is_other),
    b.is_exclusive === undefined ? row.is_exclusive : bool(b.is_exclusive), row.id);
  logAction(req.session.userId, 'edit_form_option', `แก้ไขตัวเลือก ${GROUPS[row.group_key]}: "${row.value}" -> "${value}"`);
  res.json({ ok: true });
});

router.delete('/:id', requireAuth, requireRole('Admin'), (req, res) => {
  const row = db.prepare('SELECT * FROM form_options WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'ไม่พบตัวเลือก' });
  const left = db.prepare('SELECT COUNT(*) c FROM form_options WHERE group_key = ? AND is_active = 1 AND id != ?').get(row.group_key, row.id).c;
  if (['job_type', 'transport', 'company'].includes(row.group_key) && left < 1) return res.status(400).json({ error: 'ต้องเหลืออย่างน้อย 1 ตัวเลือกในกลุ่มนี้' });
  db.prepare('DELETE FROM form_options WHERE id = ?').run(row.id);
  logAction(req.session.userId, 'delete_form_option', `ลบตัวเลือก "${row.value}" จาก ${GROUPS[row.group_key]} (คำขอเก่ายังเก็บข้อความเดิมไว้)`);
  res.json({ ok: true });
});

module.exports = router;
