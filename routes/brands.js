// routes/brands.js - Brand Master (รายการยี่ห้อสำหรับช่อง Current Products / Brands ในฟอร์ม Visit)
const express = require('express');
const db = require('../db/database');
const { requireAuth, requireRole } = require('./middleware');
const { logAction } = require('../utils/systemLog');

const router = express.Router();

// ทุกคนที่ login แล้ว: เฉพาะยี่ห้อที่เปิดใช้งาน (ใช้ในฟอร์ม Visit)
router.get('/', requireAuth, (req, res) => {
  const brands = db.prepare('SELECT id, name FROM brands WHERE is_active = 1 ORDER BY sort_order ASC, name ASC').all();
  res.json({ brands });
});

// Admin: ทั้งหมด (รวมที่ปิดใช้งาน)
router.get('/all', requireAuth, requireRole('Admin'), (req, res) => {
  const brands = db.prepare('SELECT * FROM brands ORDER BY sort_order ASC, name ASC').all();
  res.json({ brands: brands.map(b => ({ ...b, is_active: !!b.is_active })) });
});

function cleanName(v) { return (v || '').toString().replace(/\s+/g, ' ').trim().slice(0, 60); }

router.post('/', requireAuth, requireRole('Admin'), (req, res) => {
  const name = cleanName(req.body.name);
  if (!name) return res.status(400).json({ error: 'กรุณากรอกชื่อยี่ห้อ' });
  if (db.prepare('SELECT 1 FROM brands WHERE LOWER(name) = LOWER(?)').get(name)) {
    return res.status(409).json({ error: 'มียี่ห้อนี้อยู่แล้ว' });
  }
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM brands').get().m;
  const info = db.prepare('INSERT INTO brands (name, sort_order) VALUES (?, ?)').run(name, max + 1);
  logAction(req.session.userId, 'create_brand', `เพิ่มยี่ห้อ ${name}`);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/:id', requireAuth, requireRole('Admin'), (req, res) => {
  const b = db.prepare('SELECT * FROM brands WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ error: 'ไม่พบยี่ห้อ' });
  const name = req.body.name !== undefined ? cleanName(req.body.name) : b.name;
  if (!name) return res.status(400).json({ error: 'กรุณากรอกชื่อยี่ห้อ' });
  const dup = db.prepare('SELECT 1 FROM brands WHERE LOWER(name) = LOWER(?) AND id != ?').get(name, b.id);
  if (dup) return res.status(409).json({ error: 'มียี่ห้อนี้อยู่แล้ว' });
  const active = req.body.is_active !== undefined ? (req.body.is_active ? 1 : 0) : b.is_active;
  const order = Number.isFinite(Number(req.body.sort_order)) && req.body.sort_order !== undefined ? Number(req.body.sort_order) : b.sort_order;
  db.prepare('UPDATE brands SET name = ?, is_active = ?, sort_order = ? WHERE id = ?').run(name, active, order, b.id);
  logAction(req.session.userId, 'edit_brand', `แก้ไขยี่ห้อ ${b.name}${name !== b.name ? ' -> ' + name : ''}${active !== b.is_active ? (active ? ' (เปิดใช้งาน)' : ' (ปิดใช้งาน)') : ''}`);
  res.json({ ok: true });
});

// ลบถาวร: ปลอดภัยเพราะคำขอ Visit เก่าเก็บ "ชื่อยี่ห้อ" เป็นข้อความไว้เอง ไม่ได้อ้างอิง id
router.delete('/:id', requireAuth, requireRole('Admin'), (req, res) => {
  const b = db.prepare('SELECT * FROM brands WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ error: 'ไม่พบยี่ห้อ' });
  db.prepare('DELETE FROM brands WHERE id = ?').run(b.id);
  logAction(req.session.userId, 'delete_brand', `ลบยี่ห้อ ${b.name}`);
  res.json({ ok: true });
});

module.exports = router;
