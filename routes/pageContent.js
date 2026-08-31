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

// PUT /api/page-content/:key -> Admin แก้ข้อความ
router.put('/:key', requireAuth, requireRole('Admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM page_content WHERE content_key = ?').get(req.params.key);
  if (!existing) return res.status(404).json({ error: 'ไม่พบข้อความนี้ในระบบ' });

  const { value } = req.body;
  if (!value || !value.trim()) return res.status(400).json({ error: 'กรุณาระบุข้อความ' });

  db.prepare(`
    UPDATE page_content SET content_value = ?, updated_at = datetime('now'), updated_by = ? WHERE content_key = ?
  `).run(value.trim(), req.session.userId, req.params.key);

  logAction(req.session.userId, 'edit_page_content',
    `แก้ไขข้อความหน้า (${req.params.key}): "${existing.content_value}" -> "${value.trim()}"`);
  res.json({ ok: true });
});

module.exports = router;
