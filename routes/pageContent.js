// routes/pageContent.js - Admin CMS: แก้ไขข้อความ (Page Title ฯลฯ) ของหน้าต่างๆ โดยไม่ต้องแก้ Source Code
const express = require('express');
const db = require('../db/database');
const { requireAuth, requireRole } = require('./middleware');
const { logAction } = require('../utils/systemLog');

const router = express.Router();

// GET /api/page-content -> ทุกคนที่ login แล้ว (ใช้ render title ของทุกหน้าจริง) คืนเป็น { key: value } ทั้งชุด
router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT content_key, content_value FROM page_content').all();
  const content = {};
  rows.forEach(r => { content[r.content_key] = r.content_value; });
  res.json({ content });
});

// key ที่ยอมรับ: page.<path> / menu.<href|group> / form.<section>... / <name>.title (รุ่นเดิม) — ไม่มีข้อมูลสำคัญ แค่ข้อความแสดงผล
const KEY_RE = /^[A-Za-z0-9_]+\.[A-Za-z0-9_\-./?=&:@ ]{1,100}$/;

// PUT /api/page-content/:key -> Admin แก้ข้อความ (สร้างใหม่ให้ถ้ายังไม่มี เพราะค่าเริ่มต้นอยู่ในโค้ดของแต่ละหน้า)
router.put('/:key', requireAuth, requireRole('Admin'), (req, res) => {
  const key = String(req.params.key);
  if (!KEY_RE.test(key)) return res.status(400).json({ error: 'รหัสข้อความไม่ถูกต้อง' });
  const value = req.body && typeof req.body.value === 'string' ? req.body.value.trim() : '';
  if (!value) return res.status(400).json({ error: 'กรุณาระบุข้อความ' });
  if (value.length > 200) return res.status(400).json({ error: 'ข้อความยาวเกินไป (ไม่เกิน 200 ตัวอักษร)' });
  const existing = db.prepare('SELECT content_value FROM page_content WHERE content_key = ?').get(key);
  db.prepare(`INSERT INTO page_content (content_key, content_value, updated_at, updated_by) VALUES (?, ?, datetime('now'), ?)
              ON CONFLICT(content_key) DO UPDATE SET content_value = excluded.content_value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .run(key, value, req.session.userId);
  logAction(req.session.userId, 'edit_page_content', `แก้ไขข้อความ (${key}): "${existing ? existing.content_value : '(ค่าเริ่มต้น)'}" -> "${value}"`);
  res.json({ ok: true });
});

// DELETE /api/page-content/:key -> คืนค่าเริ่มต้น (ลบ override)
router.delete('/:key', requireAuth, requireRole('Admin'), (req, res) => {
  const key = String(req.params.key);
  if (!KEY_RE.test(key)) return res.status(400).json({ error: 'รหัสข้อความไม่ถูกต้อง' });
  db.prepare('DELETE FROM page_content WHERE content_key = ?').run(key);
  logAction(req.session.userId, 'reset_page_content', `คืนค่าเริ่มต้นข้อความ (${key})`);
  res.json({ ok: true });
});

module.exports = router;
