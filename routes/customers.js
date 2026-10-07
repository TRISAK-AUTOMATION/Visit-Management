// routes/customers.js
const express = require('express');
const db = require('../db/database');
const { requireAuth, requireRole } = require('./middleware');
const { logAction } = require('../utils/systemLog');
const { getDepartmentsForUser } = require('../utils/userDepartments');

const router = express.Router();

const COMPANIES = ['TAC', 'FAC', 'HTC'];

// GET /api/customers?q=&company=&include_archived=1
// - หน้าค้นหาลูกค้าตอนสร้างคำขอ Visit จะไม่ส่ง include_archived มา จึงเห็นเฉพาะลูกค้าที่ยังใช้งานอยู่
// - หน้า Customer (Admin) จะส่ง include_archived=1 มา เพื่อให้เห็น/จัดการลูกค้าที่ถูกเก็บถาวรด้วย
router.get('/', requireAuth, (req, res) => {
  const { q, company, include_archived, pending } = req.query;
  let where = [];
  let params = [];

  if (!include_archived) where.push('is_archived = 0');
  if (pending === '1') where.push('is_pending = 1');
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

// ---------- ลูกค้าใหม่ (รอตรวจสอบ) - เพิ่มจากหน้าสร้างคำขอ Visit ----------
// ใช้เมื่อไป Visit ที่ยังไม่เคยเป็นลูกค้าในระบบ: สร้างเป็นลูกค้ารหัสชั่วคราว NEW-0001 และ is_pending=1 ให้ Admin ตรวจสอบภายหลัง
// สิทธิ์: เหมือนสิทธิ์สร้างคำขอ Visit (Approver/Admin หรือพนักงานแผนก Engineer) - ตรงกับ canAccessVisit ฝั่งหน้าเว็บ

// ตัดคำนำหน้า/ท้ายชื่อบริษัท เว้นวรรค และเครื่องหมาย เพื่อเทียบชื่อซ้ำ (เช่น "บริษัท แสนรู้ จำกัด" = "แสนรู้")
function normalizeName(s) {
  return (s || '').toString().toLowerCase()
    .replace(/บริษัท|บจก\.?|บมจ\.?|จำกัด|\(มหาชน\)|มหาชน|company|co\.|ltd\.?|limited|inc\.?|corp\.?/g, '')
    .replace(/[\s.,()\-_/&]+/g, '');
}

function canCreatePendingCustomer(userId, role) {
  if (role !== 'Employee') return true;
  let depts = getDepartmentsForUser(userId);
  if (!depts.length) {
    const u = db.prepare('SELECT department FROM users WHERE id = ?').get(userId);
    if (u && u.department) depts = [u.department];
  }
  return depts.includes('Engineer');
}

router.post('/pending', requireAuth, (req, res) => {
  const { userId, role } = req.session;
  if (!canCreatePendingCustomer(userId, role)) {
    return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เพิ่มลูกค้าใหม่' });
  }
  const name = (req.body.name || '').toString().trim();
  if (!name) return res.status(400).json({ error: 'กรุณากรอกชื่อลูกค้า/บริษัท' });
  if (name.length > 200) return res.status(400).json({ error: 'ชื่อลูกค้า/บริษัทยาวเกินไป' });

  // กันชื่อซ้ำ: ถ้ามีลูกค้า (ที่ยังไม่เก็บถาวร) ชื่อเหมือนกันหลังตัดคำนำหน้า/เว้นวรรค ให้ client ใช้รายเดิมแทน
  const norm = normalizeName(name);
  if (norm) {
    const dup = db.prepare('SELECT * FROM customers WHERE is_archived = 0').all()
      .find(c => normalizeName(c.name) === norm);
    if (dup) {
      return res.status(409).json({ error: 'มีลูกค้าชื่อนี้อยู่ในระบบแล้ว', duplicate: dup });
    }
  }

  const prefix = 'NEW-';
  const row = db.prepare(`
    SELECT MAX(CAST(SUBSTR(code, LENGTH(?) + 1) AS INTEGER)) AS maxSeq FROM customers WHERE code LIKE ?
  `).get(prefix, `${prefix}%`);
  const code = `${prefix}${((row.maxSeq || 0) + 1).toString().padStart(4, '0')}`;

  const info = db.prepare(`
    INSERT INTO customers (code, name, contact_person, phone, tax_id, company, is_pending, created_by)
    VALUES (?, ?, ?, ?, ?, NULL, 1, ?)
  `).run(code, name, (req.body.contact_person || '').toString().trim(), (req.body.phone || '').toString().trim(),
    (req.body.tax_id || '').toString().trim(), userId);

  logAction(userId, 'create_pending_customer', `เพิ่มลูกค้าใหม่ (รอตรวจสอบ) ${code} - ${name}`);
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ customer });
});

// รวมลูกค้ารอตรวจสอบเข้ากับลูกค้าเดิมที่มีอยู่แล้ว (Admin) - ย้ายคำขอ Visit/OT ทั้งหมดไปที่ลูกค้าปลายทาง แล้วลบรายที่ซ้ำ
router.post('/:id/merge', requireAuth, requireRole('Admin'), (req, res) => {
  const sourceId = Number(req.params.id);
  const targetId = Number(req.body.target_id);
  if (!targetId || sourceId === targetId) return res.status(400).json({ error: 'กรุณาเลือกลูกค้าปลายทางที่ต้องการรวมเข้าด้วย' });
  const source = db.prepare('SELECT * FROM customers WHERE id = ?').get(sourceId);
  const target = db.prepare('SELECT * FROM customers WHERE id = ?').get(targetId);
  if (!source || !target) return res.status(404).json({ error: 'ไม่พบลูกค้า' });
  if (!source.is_pending) return res.status(400).json({ error: 'รวมได้เฉพาะลูกค้าที่อยู่ในสถานะรอตรวจสอบเท่านั้น' });

  const run = db.transaction(() => {
    const v = db.prepare('UPDATE visit_requests SET customer_id = ? WHERE customer_id = ?').run(targetId, sourceId);
    const o = db.prepare('UPDATE ot_requests SET customer_id = ? WHERE customer_id = ?').run(targetId, sourceId);
    db.prepare('DELETE FROM customers WHERE id = ?').run(sourceId);
    return { visits: v.changes, ots: o.changes };
  });
  const moved = run();
  logAction(req.session.userId, 'merge_customer',
    `รวมลูกค้า ${source.code} - ${source.name} เข้ากับ ${target.code} - ${target.name} (ย้าย Visit ${moved.visits}, OT ${moved.ots})`);
  res.json({ ok: true, ...moved });
});

router.put('/:id', requireAuth, requireRole('Admin'), (req, res) => {
  const { name, contact_person, phone, email, address, company, code, tax_id } = req.body;
  const exists = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!exists) return res.status(404).json({ error: 'ไม่พบลูกค้า' });

  // ลูกค้ารอตรวจสอบ: ถ้า Admin ใส่รหัสจริงมา = ยืนยันเป็นลูกค้าจริง (ออกจากสถานะรอตรวจสอบ) โดยรหัสต้องไม่ซ้ำในบริษัทเดียวกัน
  let newCode = exists.code;
  let newPending = exists.is_pending;
  if (exists.is_pending && code !== undefined && code.toString().trim() && code.toString().trim() !== exists.code) {
    newCode = code.toString().trim();
    const comp = company || null;
    const clash = db.prepare('SELECT id FROM customers WHERE code = ? AND company IS ? AND id != ?').get(newCode, comp, exists.id);
    if (clash) return res.status(400).json({ error: 'รหัสลูกค้านี้มีอยู่แล้วในบริษัทเดียวกัน' });
    newPending = 0;
  }

  db.prepare(`
    UPDATE customers SET code = ?, name = ?, contact_person = ?, phone = ?, email = ?, address = ?, company = ?,
      tax_id = ?, is_pending = ?
    WHERE id = ?
  `).run(newCode, name, contact_person || '', phone || '', email || '', address || '', company || null,
    tax_id !== undefined ? tax_id : exists.tax_id, newPending, req.params.id);
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
  const getByCompany = db.prepare('SELECT id, code FROM customers WHERE company = ? AND is_pending = 0');
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

  // ไม่รวมลูกค้ารอตรวจสอบ (is_pending) - ต้องให้ Admin ตรวจสอบ/รวมเองจากหน้า Customer
  const rows = company
    ? db.prepare('SELECT id FROM customers WHERE company = ? AND is_pending = 0').all(company)
    : db.prepare('SELECT id FROM customers WHERE is_pending = 0').all();

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
