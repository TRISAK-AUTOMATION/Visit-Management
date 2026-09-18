// routes/customers.js
const express = require('express');
const db = require('../db/database');
const { requireAuth, requireRole } = require('./middleware');
const { logAction } = require('../utils/systemLog');

const router = express.Router();

const COMPANIES = ['TAC', 'FAC', 'HTC'];

// GET /api/customers?q=&company=&include_archived=1
// - หน้าค้นหาลูกค้าตอนสร้างคำขอ Visit จะไม่ส่ง include_archived มา จึงเห็นเฉพาะลูกค้าที่ยังใช้งานอยู่
// - หน้า Customer (Admin) จะส่ง include_archived=1 มา เพื่อให้เห็น/จัดการลูกค้าที่ถูกเก็บถาวรด้วย
router.get('/', requireAuth, (req, res) => {
  const { q, company, include_archived } = req.query;
  let where = [];
  let params = [];

  if (!include_archived) where.push('is_archived = 0');
  if (company) { where.push('company = ?'); params.push(company); }
  if (q) {
    where.push('(name LIKE ? OR code LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  const sql = `SELECT * FROM customers ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY company, id`;
  const rows = db.prepare(sql).all(...params);
  res.json({ customers: rows, companies: COMPANIES });
});

router.get('/:id', requireAuth, (req, res) => {
  const row = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'ไม่พบลูกค้า' });
  res.json({ customer: row });
});

router.post('/', requireAuth, requireRole('Admin'), (req, res) => {
  const { name, contact_person, phone, email, address, company } = req.body;
  if (!name) return res.status(400).json({ error: 'กรุณากรอกชื่อลูกค้า/บริษัท' });
  const last = db.prepare(`SELECT code FROM customers ORDER BY id DESC LIMIT 1`).get();
  const nextNum = last ? parseInt(last.code.split('-')[1]) + 1 : 1;
  const code = `CUS-${nextNum.toString().padStart(3, '0')}`;
  const info = db.prepare(`
    INSERT INTO customers (code, name, contact_person, phone, email, address, company)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(code, name, contact_person || '', phone || '', email || '', address || '', company || null);
  res.status(201).json({ id: info.lastInsertRowid, code });
});

router.put('/:id', requireAuth, requireRole('Admin'), (req, res) => {
  const { name, contact_person, phone, email, address, company } = req.body;
  const exists = db.prepare('SELECT id FROM customers WHERE id = ?').get(req.params.id);
  if (!exists) return res.status(404).json({ error: 'ไม่พบลูกค้า' });
  db.prepare(`
    UPDATE customers SET name = ?, contact_person = ?, phone = ?, email = ?, address = ?, company = ?
    WHERE id = ?
  `).run(name, contact_person || '', phone || '', email || '', address || '', company || null, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', requireAuth, requireRole('Admin'), (req, res) => {
  const used = db.prepare('SELECT COUNT(*) c FROM visit_requests WHERE customer_id = ?').get(req.params.id).c;
  if (used > 0) return res.status(400).json({ error: 'ไม่สามารถลบลูกค้านี้ได้ เนื่องจากมีคำขอ Visit ที่เกี่ยวข้องอยู่' });
  db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- นำเข้าฐานข้อมูลลูกค้าจากไฟล์ (Excel/CSV) - เฉพาะ Admin ----------
// Body: { company: 'TAC'|'FAC'|'HTC', records: [{ code, name, contact_person, phone, email, address, tax_id }, ...] }
// การ Parse ไฟล์ (.xlsx/.csv) ทำที่ฝั่งหน้าเว็บ (browser) แล้วส่งเป็น JSON array มาที่นี่
// พฤติกรรม: "แทนที่ทั้งหมด" ของบริษัทนั้น - ลูกค้าเดิมของบริษัทนี้ที่ "ไม่มี" ในไฟล์ใหม่ จะถูกลบออก
//   ยกเว้นรายที่มีคำขอ Visit เก่าอ้างอิงอยู่ จะ "เก็บถาวร" (is_archived=1) แทนการลบจริง เพื่อไม่ให้ข้อมูลคำขอเก่าพัง
router.post('/import', requireAuth, requireRole('Admin'), (req, res) => {
  const { company, records } = req.body;

  if (!COMPANIES.includes(company)) {
    return res.status(400).json({ error: `กรุณาระบุบริษัทให้ถูกต้อง (${COMPANIES.join(', ')})` });
  }
  if (!Array.isArray(records) || !records.length) {
    return res.status(400).json({ error: 'ไม่พบข้อมูลในไฟล์ที่อัปโหลด' });
  }

  const upsert = db.prepare(`
    INSERT INTO customers (code, name, contact_person, phone, email, address, tax_id, company, is_archived)
    VALUES (@code, @name, @contact_person, @phone, @email, @address, @tax_id, @company, 0)
    ON CONFLICT(code, company) DO UPDATE SET
      name = excluded.name,
      contact_person = excluded.contact_person,
      phone = excluded.phone,
      email = excluded.email,
      address = excluded.address,
      tax_id = excluded.tax_id,
      is_archived = 0,
      archived_at = NULL
  `);
  const checkUsage = db.prepare('SELECT COUNT(*) c FROM visit_requests WHERE customer_id = ?');
  const archiveStmt = db.prepare("UPDATE customers SET is_archived = 1, archived_at = datetime('now') WHERE id = ?");
  const deleteStmt = db.prepare('DELETE FROM customers WHERE id = ?');
  const getByCompany = db.prepare('SELECT id, code FROM customers WHERE company = ?');
  const findByCodeAndCompany = db.prepare('SELECT id FROM customers WHERE code = ? AND company = ?');

  let inserted = 0, updated = 0, skipped = 0, archived = 0, deleted = 0;

  const run = db.transaction(() => {
    const seenCodes = new Set();
    for (const r of records) {
      const code = (r.code || '').toString().trim();
      const name = (r.name || '').toString().trim();
      if (!code || !name) { skipped++; continue; }
      if (seenCodes.has(code)) { skipped++; continue; }
      seenCodes.add(code);

      const existing = findByCodeAndCompany.get(code, company);
      upsert.run({
        code, name, company,
        contact_person: (r.contact_person || '').toString().trim(),
        phone: (r.phone || '').toString().trim(),
        email: (r.email || '').toString().trim(),
        address: (r.address || '').toString().trim(),
        tax_id: (r.tax_id || '').toString().trim()
      });
      if (existing) updated++; else inserted++;
    }

    // ลูกค้าเดิมของบริษัทนี้ที่ไม่อยู่ในไฟล์ใหม่ -> ลบ (หรือเก็บถาวรถ้ามีคำขอ Visit เก่าอ้างอิงอยู่)
    const existingRows = getByCompany.all(company);
    for (const row of existingRows) {
      if (seenCodes.has(row.code)) continue;
      const used = checkUsage.get(row.id).c;
      if (used > 0) { archiveStmt.run(row.id); archived++; }
      else { deleteStmt.run(row.id); deleted++; }
    }
  });

  run();

  logAction(req.session.userId, 'import_customers',
    `นำเข้าฐานข้อมูลลูกค้าบริษัท ${company}: เพิ่มใหม่ ${inserted}, อัปเดต ${updated}, เก็บถาวร ${archived}, ลบ ${deleted}, ข้าม ${skipped}`);

  res.json({ inserted, updated, archived, deleted, skipped });
});

// ---------- ลบข้อมูลลูกค้าทั้งหมด (หรือเฉพาะบริษัทที่เลือก) - เฉพาะ Admin ----------
// Body: { company: 'TAC'|'FAC'|'HTC' } - ถ้าไม่ระบุ company = ลบทั้งหมดทุกบริษัท
// รายที่มีคำขอ Visit เก่าอ้างอิงอยู่จะถูก "เก็บถาวร" แทนการลบจริง เช่นเดียวกับตอนนำเข้าไฟล์ใหม่
router.delete('/bulk/all', requireAuth, requireRole('Admin'), (req, res) => {
  const { company } = req.query || {};
  if (company && !COMPANIES.includes(company)) {
    return res.status(400).json({ error: `บริษัทไม่ถูกต้อง (${COMPANIES.join(', ')})` });
  }

  const rows = company
    ? db.prepare('SELECT id FROM customers WHERE company = ?').all(company)
    : db.prepare('SELECT id FROM customers').all();

  const checkUsage = db.prepare('SELECT COUNT(*) c FROM visit_requests WHERE customer_id = ?');
  const archiveStmt = db.prepare("UPDATE customers SET is_archived = 1, archived_at = datetime('now') WHERE id = ?");
  const deleteStmt = db.prepare('DELETE FROM customers WHERE id = ?');

  let deleted = 0, archived = 0;
  const run = db.transaction(() => {
    for (const row of rows) {
      const used = checkUsage.get(row.id).c;
      if (used > 0) { archiveStmt.run(row.id); archived++; }
      else { deleteStmt.run(row.id); deleted++; }
    }
  });
  run();

  logAction(req.session.userId, 'delete_all_customers',
    `ลบข้อมูลลูกค้า${company ? ' บริษัท ' + company : 'ทั้งหมดทุกบริษัท'}: ลบ ${deleted}, เก็บถาวร ${archived}`);

  res.json({ deleted, archived });
});

module.exports = router;
