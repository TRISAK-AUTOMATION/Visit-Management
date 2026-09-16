// routes/visitRequests.js
const { getEmailRows, getShowDocCode } = require('../utils/emailFields');
const express = require('express');
const crypto = require('crypto');
const db = require('../db/database');
const { requireAuth, requireRole } = require('./middleware');
const { sendNewRequestEmail, sendDecisionEmail, sendRevisionEmail } = require('../utils/mailer');
const { logAction } = require('../utils/systemLog');
const { getDepartmentsForUser, approverIdsForDepartments } = require('../utils/userDepartments');

const router = express.Router();

const TOKEN_TTL_DAYS = 7;
const EDITABLE_STATUSES = ['pending', 'draft', 'revision'];
// สถานะที่ผู้ขอสามารถกลับมา "อัปเดตข้อมูลหลังปฏิบัติงาน" ได้ (เช่น เวลาออกจริง/เข้าจริง, ไมล์, OT ฯลฯ)
// อนุญาตเฉพาะคำขอที่อนุมัติแล้ว และการอัปเดตนี้จะไม่เปลี่ยนสถานะ/ไม่ต้องส่งขออนุมัติใหม่ (อนุมัติแค่ครั้งเดียว)
const POST_VISIT_EDITABLE_STATUSES = ['approved'];

// แปลงวันที่รูปแบบ YYYY-MM-DD (จาก <input type="date">) ให้เป็น วัน/เดือน/ปี ตามรูปแบบไทย
// ใช้ตอนสร้างข้อความแจ้งเตือน (notifications.message) เพื่อไม่ให้ปนกับรูปแบบสากลที่อ่านสลับกันได้
function formatDateThai(d) {
  if (!d) return '-';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

// สร้างโทเคนอนุมัติ/ไม่อนุมัติผ่านอีเมล ให้ผู้อนุมัติแต่ละคน แล้วส่งอีเมลแจ้งเตือน
// จำกัดเฉพาะผู้อนุมัติที่ดูแลแผนกเดียวกับผู้ขอ (ดูแลได้หลายแผนกก็ได้) + Admin (Admin เห็น/อนุมัติได้ทุกคำขอ)
async function notifyApproversByEmail(vr, requesterName, requesterDept) {
  const approverIds = approverIdsForDepartments([requesterDept]);
  const admins = db.prepare(`SELECT id FROM users WHERE is_active = 1 AND role = 'Admin'`).all().map(r => r.id);
  const ids = Array.from(new Set([...approverIds, ...admins]));
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  const approvers = db.prepare(`SELECT id, full_name, email, email_notify FROM users WHERE id IN (${placeholders})`).all(...ids);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const insertToken = db.prepare(`
    INSERT INTO approval_tokens (token, visit_request_id, approver_id, action, expires_at) VALUES (?, ?, ?, ?, ?)
  `);
  for (const a of approvers) {
    if (!a.email || !a.email_notify) continue;
    const approveToken = generateToken();
    const rejectToken = generateToken();
    insertToken.run(approveToken, vr.id, a.id, 'approve', expiresAt);
    insertToken.run(rejectToken, vr.id, a.id, 'reject', expiresAt);
    sendNewRequestEmail({
  to: a.email, approverName: a.full_name, requesterName, vr, approveToken, rejectToken,
  emailRows: getEmailRows(vr), showDocCode: getShowDocCode()
  }).catch(err => console.error('sendNewRequestEmail error:', err.message));
  }
}

// ตรวจสอบสิทธิ์ของผู้อนุมัติกับคำขอเจาะจง: Admin ทำได้ทุกคำขอ, Approver ทำได้เฉพาะคำขอที่ผู้ขออยู่แผนก (แผนกใดแผนกหนึ่ง) ที่ตนดูแล
// ตรวจซ้ำในชั้น backend เสมอ (ไม่พึ่งแค่การกรองรายการฝั่งหน้าเว็บ) เพื่อกันกรณียิง API ตรงๆ ด้วย request ID ของแผนกอื่น
function isAuthorizedApprover(approverId, requesterId) {
  const approver = db.prepare('SELECT role, is_active FROM users WHERE id = ?').get(approverId);
  if (!approver || !approver.is_active) return false;
  if (approver.role === 'Admin') return true;
  if (approver.role !== 'Approver') return false;
  const requester = db.prepare('SELECT department FROM users WHERE id = ?').get(requesterId);
  if (!requester || !requester.department) return false;
  const approverDepts = getDepartmentsForUser(approverId);
  return approverDepts.includes(requester.department);
}

// ตรรกะกลางสำหรับ "อนุมัติ/ไม่อนุมัติ" ใช้ร่วมกันทั้งจากเว็บแอป (ต้อง login) และจากลิงก์อีเมล (ใช้ token)
// คืนค่า { error } เมื่อทำไม่ได้ หรือ { vr, message } เมื่อสำเร็จ
function applyDecision(visitRequestId, approverId, status, actionLabel, note, channel) {
  const vr = db.prepare('SELECT * FROM visit_requests WHERE id = ?').get(visitRequestId);
  if (!vr) return { error: 'ไม่พบคำขอ', code: 404 };
  if (vr.status !== 'pending') return { error: 'คำขอนี้ถูกดำเนินการไปแล้ว', code: 409, vr };
  if (!isAuthorizedApprover(approverId, vr.requester_id)) {
    return { error: 'คุณไม่มีสิทธิ์ดำเนินการกับคำขอนี้ (ไม่ใช่แผนกของคุณ)', code: 403, vr };
  }

  db.prepare(`
    UPDATE visit_requests
    SET status = ?, approver_id = ?, approved_at = datetime('now'), approval_note = ?
    WHERE id = ?
  `).run(status, approverId, note || '', visitRequestId);

  db.prepare(`INSERT INTO approval_history (visit_request_id, action_by, action, note, channel) VALUES (?, ?, ?, ?, ?)`)
    .run(visitRequestId, approverId, actionLabel, note || '', channel || 'web');

  const message = status === 'approved'
    ? `คำขอออกนอกสถานที่ของคุณ #${vr.code} ได้รับการอนุมัติแล้ว`
    : `คำขอออกนอกสถานที่ของคุณ #${vr.code} ไม่ได้รับการอนุมัติ`;
  db.prepare(`INSERT INTO notifications (user_id, type, message, related_id) VALUES (?, ?, ?, ?)`)
    .run(vr.requester_id, status, message, vr.id);

  return { vr: { ...vr, status }, message };
}

// ---------- Custom Fields (Form Builder) - ไม่กระทบ core fields เดิมเลย ----------
// บันทึกค่าของ field ที่ Admin สร้างเองสำหรับคำขอ Visit หนึ่งรายการ
// customFields: { field_key: value, ... } - เฉพาะ field ที่ active เท่านั้นที่รับค่า (field ที่ปิดใช้งานจะถูกข้าม)
function saveCustomFieldValues(visitRequestId, customFields) {
  if (!customFields || typeof customFields !== 'object') return;
  const activeFields = db.prepare('SELECT id, field_key FROM custom_form_fields WHERE is_active = 1').all();
  const upsert = db.prepare(`
    INSERT INTO visit_custom_values (visit_request_id, field_id, value) VALUES (?, ?, ?)
    ON CONFLICT(visit_request_id, field_id) DO UPDATE SET value = excluded.value
  `);
  for (const f of activeFields) {
    if (Object.prototype.hasOwnProperty.call(customFields, f.field_key)) {
      const raw = customFields[f.field_key];
      const value = Array.isArray(raw) ? JSON.stringify(raw) : (raw === null || raw === undefined ? '' : String(raw));
      upsert.run(visitRequestId, f.id, value);
    }
  }
}

// ตรวจสอบว่า custom field ที่ required ครบถ้วนหรือไม่ (เฉพาะตอนส่งคำขอจริง ไม่ใช่ตอนบันทึกฉบับร่าง)
function validateRequiredCustomFields(customFields) {
  const requiredFields = db.prepare('SELECT field_key, label FROM custom_form_fields WHERE is_active = 1 AND is_required = 1').all();
  const missing = requiredFields.filter(f => {
    const v = customFields ? customFields[f.field_key] : undefined;
    return v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
  });
  return missing;
}

// ดึงค่า custom field ของคำขอ Visit หนึ่งรายการ พร้อม label/type ปัจจุบัน (ใช้แสดงในหน้ารายละเอียด/Calendar/PDF ในอนาคต)
// field ที่ถูกลบไปแล้วจะไม่ปรากฏ (เพราะไม่มีนิยามให้ join แล้ว) ส่วน field ที่ถูกปิดใช้งานยังแสดงได้ตามปกติ (ข้อมูลเก่าไม่หาย)
function getCustomFieldValues(visitRequestId) {
  return db.prepare(`
    SELECT cf.field_key, cf.label, cf.field_type, v.value
    FROM visit_custom_values v
    JOIN custom_form_fields cf ON cf.id = v.field_id
    WHERE v.visit_request_id = ?
    ORDER BY cf.sort_order ASC, cf.id ASC
  `).all(visitRequestId);
}

// ตรวจสอบว่า core field ที่ Admin ตั้งเป็น required (และยังแสดงอยู่) ครบถ้วนหรือไม่
function validateRequiredCoreFields(body) {
  const requiredCore = db.prepare('SELECT field_key, label FROM core_field_settings WHERE is_visible = 1 AND is_required = 1').all();
  return requiredCore.filter(f => {
    const v = body[f.field_key];
    return v === undefined || v === null || (typeof v === 'string' && !v.trim());
  });
}

function generateCode() {
  const year = new Date().getFullYear();
  const prefix = `VR-${year}-`;
  // หาเลขรันสูงสุดที่ "เคยใช้จริง" จาก code ที่มีอยู่ในตาราง (ไม่ใช่นับจำนวนแถว)
  // ป้องกันรหัสซ้ำเมื่อมีการลบคำขอออกไป หรือย้าย/นำเข้าข้อมูลข้ามฐานข้อมูล
  const row = db.prepare(`
    SELECT MAX(CAST(SUBSTR(code, LENGTH(?) + 1) AS INTEGER)) AS maxSeq
    FROM visit_requests
    WHERE code LIKE ?
  `).get(prefix, `${prefix}%`);

  const nextSeq = (row.maxSeq || 0) + 1;
  return `${prefix}${nextSeq.toString().padStart(5, '0')}`;
}

// GET /api/visit-requests?scope=mine|pending|all&status=
router.get('/', requireAuth, (req, res) => {
  const { userId, role } = req.session;
  const { scope = 'mine', status } = req.query;

  let where = [];
  let params = [];

  if (scope === 'mine') {
    where.push('vr.requester_id = ?');
    params.push(userId);
  } else if (scope === 'pending') {
    // สำหรับผู้อนุมัติ: ดูคำขอทั้งหมดที่รอ/อนุมัติ/ไม่อนุมัติ (ไม่รวมฉบับร่าง/รอแก้ไข ที่ยังอยู่กับผู้ขอ)
    if (!['Approver', 'Admin'].includes(role)) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึง' });
    }
    where.push(`vr.status != 'draft'`);
    where.push(`vr.status != 'revision'`);
    // Approver เห็นเฉพาะคำขอของพนักงานแผนกที่ตนดูแล (ดูแลได้หลายแผนก), Admin เห็นทุกคำขอ
    if (role === 'Approver') {
      const myDepts = getDepartmentsForUser(userId);
      if (!myDepts.length) {
        where.push('1 = 0'); // ยังไม่ได้ผูกแผนกใดเลย ไม่ให้เห็นคำขอใครทั้งนั้น
      } else {
        where.push(`u.department IN (${myDepts.map(() => '?').join(',')})`);
        params.push(...myDepts);
      }
    }
  }
  if (status) {
    where.push('vr.status = ?');
    params.push(status);
  }

  const sql = `
    SELECT vr.*, c.name AS customer_name, u.full_name AS requester_name, u.department AS requester_department
    FROM visit_requests vr
    JOIN customers c ON c.id = vr.customer_id
    JOIN users u ON u.id = vr.requester_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY vr.created_at DESC
  `;
  const rows = db.prepare(sql).all(...params);
  res.json({ requests: rows });
});

// GET single with history
router.get('/:id', requireAuth, (req, res) => {
  const vr = db.prepare(`
    SELECT vr.*, c.name AS customer_name, c.address AS customer_address,
           u.full_name AS requester_name, u.position AS requester_position, u.department AS requester_department,
           a.full_name AS approver_name
    FROM visit_requests vr
    JOIN customers c ON c.id = vr.customer_id
    JOIN users u ON u.id = vr.requester_id
    LEFT JOIN users a ON a.id = vr.approver_id
    WHERE vr.id = ?
  `).get(req.params.id);
  if (!vr) return res.status(404).json({ error: 'ไม่พบคำขอ' });

  const history = db.prepare(`
    SELECT h.*, u.full_name AS actor_name
    FROM approval_history h
    LEFT JOIN users u ON u.id = h.action_by
    WHERE h.visit_request_id = ?
    ORDER BY h.created_at ASC
  `).all(req.params.id);

  const customFields = getCustomFieldValues(req.params.id);

  res.json({ request: vr, history, customFields });
});

// CREATE (รองรับ save_as: 'draft' เพื่อบันทึกฉบับร่างโดยยังไม่ส่งเข้าสู่ระบบอนุมัติ)
router.post('/', requireAuth, (req, res) => {
  const { userId } = req.session;
  const {
    customer_id, visit_date, time_from, time_to, purpose, location,
    contact_person, contact_phone, transport, license_plate, notes,
    job_type, sales_person, mileage_out, mileage_in, actual_time_out, actual_time_back,
    ot_hours, product, participants, customer_tax_id, tax_invoice_date, save_as,
    custom_fields
  } = req.body;

  const isDraft = save_as === 'draft';

  if (!isDraft && (!customer_id || !visit_date || !time_from || !time_to || !purpose)) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' });
  }
  if (!isDraft) {
    const missing = validateRequiredCustomFields(custom_fields);
    if (missing.length) {
      return res.status(400).json({ error: `กรุณากรอก: ${missing.map(f => f.label).join(', ')}` });
    }
    const missingCore = validateRequiredCoreFields(req.body);
    if (missingCore.length) {
      return res.status(400).json({ error: `กรุณากรอก: ${missingCore.map(f => f.label).join(', ')}` });
    }
  }

   const status = isDraft ? 'draft' : 'pending';
  const insertStmt = db.prepare(`
    INSERT INTO visit_requests
      (code, requester_id, customer_id, visit_date, time_from, time_to, purpose, location,
       contact_person, contact_phone, transport, license_plate, notes, status,
       job_type, sales_person, mileage_out, mileage_in, actual_time_out, actual_time_back,
       ot_hours, product, participants, customer_tax_id, tax_invoice_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // เผื่อกรณี code ชนกันพอดี (เช่นมีคนส่งคำขอพร้อมกัน) ให้ generate ใหม่แล้วลองใหม่
  let code, info;
  for (let attempt = 0; attempt < 5; attempt++) {
    code = generateCode();
    try {
      info = insertStmt.run(code, userId, customer_id || null, visit_date || '', time_from || '', time_to || '', purpose || '', location || '',
        contact_person || '', contact_phone || '', transport || '', license_plate || '', notes || '', status,
        job_type || '', sales_person || '', mileage_out || null, mileage_in || null,
        actual_time_out || '', actual_time_back || '', ot_hours || null, product || '',
        participants || '', customer_tax_id || '', tax_invoice_date || '');
      break;
    } catch (err) {
      const isDupCode = err.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed: visit_requests\.code/.test(err.message);
      if (isDupCode && attempt < 4) continue; // ลองใหม่ด้วยรหัสถัดไป
      throw err;
    }
  }

  const vrId = info.lastInsertRowid;
  saveCustomFieldValues(vrId, custom_fields);
  const requester = db.prepare('SELECT full_name, department FROM users WHERE id = ?').get(userId);

  if (isDraft) {
    db.prepare(`INSERT INTO approval_history (visit_request_id, action_by, action, channel) VALUES (?, ?, 'บันทึกฉบับร่าง', 'web')`).run(vrId, userId);
    logAction(userId, 'create_draft', `บันทึกฉบับร่างคำขอ #${code}`);
    return res.status(201).json({ id: vrId, code, status });
  }

  db.prepare(`INSERT INTO approval_history (visit_request_id, action_by, action, channel) VALUES (?, ?, 'ส่งคำขอ', 'web')`).run(vrId, userId);
  logAction(userId, 'submit_request', `ส่งคำขอ #${code}`);

  notifyRequestSubmitted(vrId, requester);

  res.status(201).json({ id: vrId, code, status });
});

// แจ้งเตือนผู้อนุมัติ (ในระบบ + อีเมล) เมื่อมีคำขอเข้าสู่สถานะ pending
function notifyRequestSubmitted(vrId, requester) {
  const approverIds = approverIdsForDepartments([requester.department]);
  const admins = db.prepare(`SELECT id FROM users WHERE is_active = 1 AND role = 'Admin'`).all().map(r => r.id);
  const ids = Array.from(new Set([...approverIds, ...admins]));
  const approvers = ids.length
    ? db.prepare(`SELECT id FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids)
    : [];
  const notifStmt = db.prepare(`INSERT INTO notifications (user_id, type, message, related_id) VALUES (?, 'new_request', ?, ?)`);
  const vr = db.prepare('SELECT * FROM visit_requests WHERE id = ?').get(vrId);
  for (const a of approvers) {
    notifStmt.run(a.id, `มีคำขอออกนอกสถานที่ใหม่จาก ${requester.full_name} วันที่ ${formatDateThai(vr.visit_date)} เวลา ${vr.time_from} - ${vr.time_to}`, vrId);
  }
  const vrWithCustomer = db.prepare(`
    SELECT vr.*, c.name AS customer_name FROM visit_requests vr LEFT JOIN customers c ON c.id = vr.customer_id WHERE vr.id = ?
  `).get(vrId);
  notifyApproversByEmail(vrWithCustomer, requester.full_name, requester.department)
    .catch(err => console.error('notifyApproversByEmail error:', err.message));
}

// SUBMIT: ส่งฉบับร่าง หรือคำขอที่ถูกส่งกลับแก้ไข เข้าสู่สถานะรออนุมัติ
router.post('/:id/submit', requireAuth, (req, res) => {
  const vr = db.prepare('SELECT * FROM visit_requests WHERE id = ?').get(req.params.id);
  if (!vr) return res.status(404).json({ error: 'ไม่พบคำขอ' });
  if (vr.requester_id !== req.session.userId) return res.status(403).json({ error: 'ไม่มีสิทธิ์ดำเนินการกับคำขอนี้' });
  if (!['draft', 'revision'].includes(vr.status)) {
    return res.status(400).json({ error: 'สามารถส่งคำขอได้เฉพาะฉบับร่างหรือคำขอที่ถูกส่งกลับแก้ไขเท่านั้น' });
  }
  if (!vr.customer_id || !vr.visit_date || !vr.time_from || !vr.time_to || !vr.purpose) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วนก่อนส่งคำขอ' });
  }
  const existingCustomValues = {};
  getCustomFieldValues(vr.id).forEach(f => { existingCustomValues[f.field_key] = f.value; });
  const missingCustom = validateRequiredCustomFields(existingCustomValues);
  if (missingCustom.length) {
    return res.status(400).json({ error: `กรุณากรอก: ${missingCustom.map(f => f.label).join(', ')} ก่อนส่งคำขอ` });
  }
  const missingCore = validateRequiredCoreFields(vr);
  if (missingCore.length) {
    return res.status(400).json({ error: `กรุณากรอก: ${missingCore.map(f => f.label).join(', ')} ก่อนส่งคำขอ` });
  }

  const wasDraft = vr.status === 'draft';
  db.prepare(`UPDATE visit_requests SET status = 'pending' WHERE id = ?`).run(req.params.id);
  db.prepare(`INSERT INTO approval_history (visit_request_id, action_by, action, channel) VALUES (?, ?, ?, 'web')`)
    .run(req.params.id, req.session.userId, wasDraft ? 'ส่งคำขอ (จากฉบับร่าง)' : 'ส่งคำขออีกครั้งหลังแก้ไข');
  logAction(req.session.userId, 'submit_request', `ส่งคำขอ #${vr.code}${wasDraft ? ' (จากฉบับร่าง)' : ' (หลังแก้ไข)'}`);

  const requester = db.prepare('SELECT full_name, department FROM users WHERE id = ?').get(req.session.userId);
  notifyRequestSubmitted(vr.id, requester);

  res.json({ ok: true });
});

// UPDATE (แก้ไขคำขอ - เฉพาะเจ้าของคำขอ และเฉพาะสถานะที่ยังแก้ไขได้: pending / draft / revision)
router.put('/:id', requireAuth, (req, res) => {
  const vr = db.prepare('SELECT * FROM visit_requests WHERE id = ?').get(req.params.id);
  if (!vr) return res.status(404).json({ error: 'ไม่พบคำขอ' });
  if (vr.requester_id !== req.session.userId) return res.status(403).json({ error: 'ไม่มีสิทธิ์แก้ไขคำขอนี้' });
  const isPostVisitUpdate = POST_VISIT_EDITABLE_STATUSES.includes(vr.status);
  if (!EDITABLE_STATUSES.includes(vr.status) && !isPostVisitUpdate) {
    return res.status(400).json({ error: 'ไม่สามารถแก้ไขคำขอที่ดำเนินการแล้วได้' });
  }

  const fields = ['customer_id', 'visit_date', 'time_from', 'time_to', 'purpose', 'location',
    'contact_person', 'contact_phone', 'transport', 'license_plate', 'notes',
    'job_type', 'sales_person', 'mileage_out', 'mileage_in', 'actual_time_out', 'actual_time_back',
    'ot_hours', 'product', 'participants', 'customer_tax_id', 'tax_invoice_date'];
  const updates = [];
  const values = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      values.push(req.body[f]);
    }
  }
  if (updates.length) {
    values.push(req.params.id);
    // หมายเหตุ: ไม่แตะคอลัมน์ status เลย ดังนั้นคำขอที่ "อนุมัติแล้ว" จะยังคงเป็น approved อยู่เหมือนเดิมหลังอัปเดต
    // (ไม่ต้องส่งขออนุมัติซ้ำ - อนุมัติแค่ครั้งเดียวตามที่ต้องการ)
    db.prepare(`UPDATE visit_requests SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }
  if (req.body.custom_fields) {
    saveCustomFieldValues(req.params.id, req.body.custom_fields);
  }
  if (isPostVisitUpdate) {
    db.prepare(`INSERT INTO approval_history (visit_request_id, action_by, action, channel) VALUES (?, ?, 'อัปเดตข้อมูลหลังปฏิบัติงาน', 'web')`).run(req.params.id, req.session.userId);
    logAction(req.session.userId, 'update_after_visit', `อัปเดตข้อมูลหลังปฏิบัติงาน #${vr.code}`);
  } else {
    logAction(req.session.userId, 'edit_request', `แก้ไขคำขอ #${vr.code}`);
  }
  res.json({ ok: true });
});

// CANCEL (ยกเลิกคำขอโดยเจ้าของ - รวมถึงฉบับร่าง/คำขอที่รอแก้ไข)
router.post('/:id/cancel', requireAuth, (req, res) => {
  const vr = db.prepare('SELECT * FROM visit_requests WHERE id = ?').get(req.params.id);
  if (!vr) return res.status(404).json({ error: 'ไม่พบคำขอ' });
  if (vr.requester_id !== req.session.userId) return res.status(403).json({ error: 'ไม่มีสิทธิ์ยกเลิกคำขอนี้' });
  if (!EDITABLE_STATUSES.includes(vr.status)) return res.status(400).json({ error: 'ไม่สามารถยกเลิกคำขอที่ดำเนินการแล้วได้' });

  db.prepare(`UPDATE visit_requests SET status = 'cancelled' WHERE id = ?`).run(req.params.id);
  db.prepare(`INSERT INTO approval_history (visit_request_id, action_by, action, channel) VALUES (?, ?, 'ยกเลิกคำขอ', 'web')`).run(req.params.id, req.session.userId);
  logAction(req.session.userId, 'cancel_request', `ยกเลิกคำขอ #${vr.code}`);
  res.json({ ok: true });
});

// ลบคำขอ Visit ทิ้งถาวร (ไม่ใช่แค่ยกเลิก/เปลี่ยนสถานะ) - เฉพาะ Admin เท่านั้น ใช้สำหรับเคลียร์ข้อมูลทดสอบ
// ลบข้อมูลลูกผูกทั้งหมดที่อ้างถึงคำขอนี้ด้วย (ไม่มี ON DELETE CASCADE ในสคีมา จึงต้องลบเองให้ครบ)
function deleteVisitRequestCascade(id) {
  db.prepare('DELETE FROM approval_history WHERE visit_request_id = ?').run(id);
  db.prepare('DELETE FROM approval_tokens WHERE visit_request_id = ?').run(id);
  db.prepare('DELETE FROM visit_custom_values WHERE visit_request_id = ?').run(id);
  db.prepare('DELETE FROM notifications WHERE related_id = ?').run(id);
  db.prepare('DELETE FROM visit_requests WHERE id = ?').run(id);
}

// ลบคำขอ Visit "ทั้งหมด" ในระบบทิ้งถาวร - สำหรับเคลียร์ข้อมูลทดสอบก่อนใช้งานจริง (เฉพาะ Admin)
// หมายเหตุ: ต้อง define ไว้ "ก่อน" router.delete('/:id') ด้านล่าง เพราะ Express จับเส้นทางตามลำดับที่ประกาศ
// ถ้า '/:id' อยู่ก่อน จะจับ '/bulk/all' เป็น id='bulk' แทนที่จะไปเส้นทางนี้
router.delete('/bulk/all', requireAuth, requireRole('Admin'), (req, res) => {
  const rows = db.prepare('SELECT id FROM visit_requests').all();
  const tx = db.transaction(() => {
    rows.forEach(r => deleteVisitRequestCascade(r.id));
  });
  tx();
  logAction(req.session.userId, 'delete_all_requests', `ลบคำขอ Visit ทั้งหมดทิ้งถาวร (${rows.length} รายการ) - ล้างข้อมูลทดสอบ`);
  res.json({ ok: true, deleted: rows.length });
});

router.delete('/:id', requireAuth, requireRole('Admin'), (req, res) => {
  const vr = db.prepare('SELECT * FROM visit_requests WHERE id = ?').get(req.params.id);
  if (!vr) return res.status(404).json({ error: 'ไม่พบคำขอ' });
  deleteVisitRequestCascade(req.params.id);
  logAction(req.session.userId, 'delete_request', `ลบคำขอ #${vr.code} ถาวร`);
  res.json({ ok: true });
});

// REQUEST REVISION: ผู้อนุมัติส่งคำขอกลับไปให้ผู้ขอแก้ไข (เฉพาะคำขอที่สถานะ pending)
router.post('/:id/request-revision', requireAuth, requireRole('Approver', 'Admin'), (req, res) => {
  const vr = db.prepare('SELECT * FROM visit_requests WHERE id = ?').get(req.params.id);
  if (!vr) return res.status(404).json({ error: 'ไม่พบคำขอ' });
  if (vr.status !== 'pending') return res.status(400).json({ error: 'คำขอนี้ไม่ได้อยู่ในสถานะรออนุมัติ' });
  if (!isAuthorizedApprover(req.session.userId, vr.requester_id)) {
    return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ดำเนินการกับคำขอนี้ (ไม่ใช่แผนกของคุณ)' });
  }

  const note = (req.body.note || '').trim();
  if (!note) return res.status(400).json({ error: 'กรุณาระบุเหตุผล/สิ่งที่ต้องแก้ไข' });

  db.prepare(`UPDATE visit_requests SET status = 'revision', approval_note = ? WHERE id = ?`).run(note, req.params.id);
  db.prepare(`INSERT INTO approval_history (visit_request_id, action_by, action, note, channel) VALUES (?, ?, 'ส่งกลับแก้ไข', ?, 'web')`)
    .run(req.params.id, req.session.userId, note);
  logAction(req.session.userId, 'request_revision', `ส่งคำขอ #${vr.code} กลับให้แก้ไข`);

  const requester = db.prepare('SELECT full_name, email, email_notify FROM users WHERE id = ?').get(vr.requester_id);
  const approver = db.prepare('SELECT full_name FROM users WHERE id = ?').get(req.session.userId);
  db.prepare(`INSERT INTO notifications (user_id, type, message, related_id) VALUES (?, 'revision', ?, ?)`)
    .run(vr.requester_id, `คำขอออกนอกสถานที่ของคุณ #${vr.code} ถูกส่งกลับให้แก้ไข`, vr.id);
  if (requester && requester.email && requester.email_notify) {
    sendRevisionEmail({
      to: requester.email, requesterName: requester.full_name, vr, approverName: approver ? approver.full_name : '-', note
    }).catch(err => console.error('sendRevisionEmail error:', err.message));
  }

  res.json({ ok: true });
});

// APPROVE
router.post('/:id/approve', requireAuth, requireRole('Approver', 'Admin'), (req, res) => {
  handleDecision(req, res, 'approved', 'อนุมัติ');
});

// REJECT
router.post('/:id/reject', requireAuth, requireRole('Approver', 'Admin'), (req, res) => {
  handleDecision(req, res, 'rejected', 'ไม่อนุมัติ');
});

function handleDecision(req, res, status, actionLabel) {
  const note = req.body.note || '';
  const result = applyDecision(req.params.id, req.session.userId, status, actionLabel, note, 'web');
  if (result.error) return res.status(result.code || 400).json({ error: result.error });

  // ล้าง (invalidate) ลิงก์อนุมัติทางอีเมลที่ยังไม่ถูกใช้ของคำขอนี้ เพราะถูกตัดสินใจผ่านเว็บแอปแล้ว
  db.prepare(`UPDATE approval_tokens SET used_at = datetime('now') WHERE visit_request_id = ? AND used_at IS NULL`)
    .run(req.params.id);

  logAction(req.session.userId, status === 'approved' ? 'approve_request' : 'reject_request', `${actionLabel}คำขอ #${result.vr.code}`);
  sendDecisionResultEmail(result.vr, req.session.userId, status, note, 'web');

  res.json({ ok: true });
}

// ส่งอีเมลแจ้งผลอนุมัติกลับไปยังผู้ขอ (ใช้ทั้งจากเว็บแอปและจากลิงก์อีเมล)
function sendDecisionResultEmail(vr, approverId, status, note, viaChannel) {
  const requester = db.prepare('SELECT full_name, email, email_notify FROM users WHERE id = ?').get(vr.requester_id);
  const approver = db.prepare('SELECT full_name FROM users WHERE id = ?').get(approverId);
  if (!requester || !requester.email || !requester.email_notify) return;
  sendDecisionEmail({
    to: requester.email, requesterName: requester.full_name, vr, status,
    approverName: approver ? approver.full_name : '-', note, viaChannel
  }).catch(err => console.error('sendDecisionEmail error:', err.message));
}

// ---------- อนุมัติ/ไม่อนุมัติผ่านลิงก์ในอีเมล ----------
// GET: แสดงหน้ายืนยันก่อน (ไม่กระทำการใดๆ กับข้อมูล) ป้องกันกรณีอีเมล/สแกนเนอร์เปิดลิงก์อัตโนมัติ
router.get('/email-action/:token', (req, res) => {
  const row = db.prepare(`
    SELECT t.*, vr.code, vr.status AS vr_status, vr.visit_date, vr.time_from, vr.time_to, vr.purpose,
           c.name AS customer_name, u.full_name AS requester_name, a.full_name AS approver_name
    FROM approval_tokens t
    JOIN visit_requests vr ON vr.id = t.visit_request_id
    JOIN users u ON u.id = vr.requester_id
    JOIN users a ON a.id = t.approver_id
    LEFT JOIN customers c ON c.id = vr.customer_id
    WHERE t.token = ?
  `).get(req.params.token);

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(renderEmailActionPage(row, req.params.token));
});

// POST: ยืนยันการอนุมัติ/ไม่อนุมัติจริง (ตรวจสอบเงื่อนไขซ้ำทุกครั้งฝั่งเซิร์ฟเวอร์)
router.post('/email-action/:token', (req, res) => {
  const row = db.prepare(`SELECT * FROM approval_tokens WHERE token = ?`).get(req.params.token);
  res.set('Content-Type', 'text/html; charset=utf-8');

  if (!row) return res.status(404).send(renderMessagePage('ไม่พบลิงก์นี้', 'ลิงก์อนุมัตินี้ไม่ถูกต้อง หรืออาจถูกลบไปแล้ว', 'error'));
  if (row.used_at) return res.send(renderMessagePage('ลิงก์นี้ถูกใช้งานไปแล้ว', 'คำขอนี้ถูกดำเนินการไปแล้วก่อนหน้านี้ (อาจอนุมัติผ่านเว็บแอปหรืออีเมลอื่น)', 'info'));
  if (new Date(row.expires_at) < new Date()) return res.send(renderMessagePage('ลิงก์หมดอายุ', 'กรุณาเข้าสู่ระบบเว็บแอปพลิเคชันเพื่อดำเนินการแทน', 'error'));

  const note = (req.body && req.body.note) || '';
  const status = row.action === 'approve' ? 'approved' : 'rejected';
  const actionLabel = row.action === 'approve' ? 'อนุมัติ' : 'ไม่อนุมัติ';

  const result = applyDecision(row.visit_request_id, row.approver_id, status, actionLabel, note, 'email');

  // ทำเครื่องหมายว่าโทเคนนี้ (และโทเคนคู่ที่เหลือของคำขอเดียวกัน) ถูกใช้ไปแล้ว ไม่ว่าผลลัพธ์จะสำเร็จหรือไม่
  db.prepare(`UPDATE approval_tokens SET used_at = datetime('now') WHERE visit_request_id = ? AND used_at IS NULL`)
    .run(row.visit_request_id);

  if (result.error) {
    return res.send(renderMessagePage('ไม่สามารถดำเนินการได้', result.error, 'info'));
  }

  logAction(row.approver_id, status === 'approved' ? 'approve_request' : 'reject_request', `${actionLabel}คำขอ #${result.vr.code} (ผ่านอีเมล)`);
  sendDecisionResultEmail(result.vr, row.approver_id, status, note, 'email');

  res.send(renderMessagePage(
    status === 'approved' ? '✓ อนุมัติคำขอเรียบร้อยแล้ว' : '✕ ไม่อนุมัติคำขอเรียบร้อยแล้ว',
    `คำขอ #${result.vr.code} ถูกบันทึกผลในระบบแล้ว และมีการแจ้งเตือนไปยังผู้ขอทั้งในระบบและทางอีเมล`,
    'success'
  ));
});

function pageShell(bodyHtml) {
  return `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TRISAK Visit Management</title>
  <style>
    body{font-family:'Segoe UI',Arial,sans-serif;background:#f3f4f6;margin:0;padding:40px 16px;color:#1f2937;}
    .card{max-width:480px;margin:0 auto;background:#fff;border-radius:10px;padding:28px 26px;box-shadow:0 1px 4px rgba(0,0,0,.08);}
    h2{margin-top:0;}
    table{width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;}
    td{padding:5px 6px;} td:first-child{color:#6b7280;width:110px;}
    textarea{width:100%;box-sizing:border-box;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-family:inherit;margin:10px 0;}
    .btn{display:inline-block;padding:10px 22px;margin:6px 8px 6px 0;border:none;border-radius:6px;font-weight:600;font-size:14px;cursor:pointer;color:#fff;text-decoration:none;}
    .approve{background:#16a34a;} .reject{background:#dc2626;} .muted{color:#6b7280;font-size:13px;}
    .badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;}
    .success{background:#dcfce7;color:#166534;} .error{background:#fee2e2;color:#991b1b;} .info{background:#fef9c3;color:#854d0e;}
  </style></head><body>${bodyHtml}</body></html>`;
}

function renderMessagePage(title, desc, tone) {
  return pageShell(`
    <div class="card">
      <span class="badge ${tone}">${tone === 'success' ? 'สำเร็จ' : tone === 'error' ? 'ผิดพลาด' : 'แจ้งเตือน'}</span>
      <h2>${title}</h2>
      <p class="muted">${desc}</p>
      <a class="btn approve" href="/login">ไปที่เว็บแอปพลิเคชัน</a>
    </div>`);
}

function renderEmailActionPage(row, token) {
  if (!row) return renderMessagePage('ไม่พบลิงก์นี้', 'ลิงก์อนุมัตินี้ไม่ถูกต้อง หรืออาจถูกลบไปแล้ว', 'error');
  if (row.used_at) return renderMessagePage('ลิงก์นี้ถูกใช้งานไปแล้ว', 'คำขอนี้ถูกดำเนินการไปแล้วก่อนหน้านี้ (อาจอนุมัติผ่านเว็บแอปหรืออีเมลอื่น)', 'info');
  if (new Date(row.expires_at) < new Date()) return renderMessagePage('ลิงก์หมดอายุ', 'กรุณาเข้าสู่ระบบเว็บแอปพลิเคชันเพื่อดำเนินการแทน', 'error');
  if (row.vr_status !== 'pending') return renderMessagePage('คำขอนี้ถูกดำเนินการไปแล้ว', `สถานะปัจจุบันของคำขอ #${row.code}: ${row.vr_status} (อาจถูกดำเนินการผ่านช่องทางอื่นไปแล้ว)`, 'info');

  const isApprove = row.action === 'approve';
  return pageShell(`
    <div class="card">
      <h2>ยืนยัน${isApprove ? 'การอนุมัติ' : 'การไม่อนุมัติ'}คำขอ #${row.code}</h2>
      <table>
        <tr><td>ผู้ขอ</td><td>${row.requester_name}</td></tr>
        <tr><td>ลูกค้า</td><td>${row.customer_name || '-'}</td></tr>
        <tr><td>วันที่/เวลา</td><td>${row.visit_date} (${row.time_from} - ${row.time_to})</td></tr>
        <tr><td>วัตถุประสงค์</td><td>${row.purpose}</td></tr>
        <tr><td>ผู้อนุมัติ</td><td>${row.approver_name}</td></tr>
      </table>
      <form method="POST" action="/api/visit-requests/email-action/${token}">
        <textarea name="note" rows="3" placeholder="หมายเหตุ (ถ้ามี)"></textarea>
        <button class="btn ${isApprove ? 'approve' : 'reject'}" type="submit">ยืนยัน${isApprove ? '✓ อนุมัติ' : '✕ ไม่อนุมัติ'}</button>
      </form>
      <p class="muted">หรือเข้าสู่ระบบเพื่อดูรายละเอียดและดำเนินการผ่านเว็บแอปพลิเคชันแทนก็ได้</p>
    </div>`);
}

module.exports = router;
