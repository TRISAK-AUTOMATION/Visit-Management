// routes/customers.js
const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('./middleware');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const q = req.query.q;
  let rows;
  if (q) {
    rows = db.prepare(`SELECT * FROM customers WHERE name LIKE ? OR code LIKE ? ORDER BY id`).all(`%${q}%`, `%${q}%`);
  } else {
    rows = db.prepare(`SELECT * FROM customers ORDER BY id`).all();
  }
  res.json({ customers: rows });
});

router.get('/:id', requireAuth, (req, res) => {
  const row = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบลูกค้า' });
  res.json({ customer: row });
});

router.post('/', requireAuth, (req, res) => {
  const { name, contact_person, phone, email, address } = req.body;
  if (!name) return res.status(400).json({ error: 'กรุณากรอกชื่อลูกค้า/บริษัท' });
  const last = db.prepare(`SELECT code FROM customers ORDER BY id DESC LIMIT 1`).get();
  const nextNum = last ? parseInt(last.code.split('-')[1]) + 1 : 1;
  const code = `CUS-${nextNum.toString().padStart(3, '0')}`;
  const info = db.prepare(`
    INSERT INTO customers (code, name, contact_person, phone, email, address)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(code, name, contact_person || '', phone || '', email || '', address || '');
  res.status(201).json({ id: info.lastInsertRowid, code });
});

router.put('/:id', requireAuth, (req, res) => {
  const { name, contact_person, phone, email, address } = req.body;
  const exists = db.prepare('SELECT id FROM customers WHERE id = ?').get(req.params.id);
  if (!exists) return res.status(404).json({ error: 'ไม่พบลูกค้า' });
  db.prepare(`
    UPDATE customers SET name = ?, contact_person = ?, phone = ?, email = ?, address = ?
    WHERE id = ?
  `).run(name, contact_person || '', phone || '', email || '', address || '', req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', requireAuth, (req, res) => {
  const used = db.prepare('SELECT COUNT(*) c FROM visit_requests WHERE customer_id = ?').get(req.params.id).c;
  if (used > 0) return res.status(400).json({ error: 'ไม่สามารถลบลูกค้านี้ได้ เนื่องจากมีคำขอ Visit ที่เกี่ยวข้องอยู่' });
  db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
