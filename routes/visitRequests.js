// routes/visitRequests.js
const { getEmailRows, getShowDocCode } = require('../utils/emailFields');
const express = require('express');
const db = require('../db/database');
const { requireAuth, requireRole } = require('./middleware');
const { sendNewRequestEmail, sendDecisionEmail, sendRevisionEmail } = require('../utils/mailer');
const { logAction } = require('../utils/systemLog');
const approvalEngine = require('../utils/approvalEngine');
const { canViewAll } = require('../utils/viewScope');
const { applyVisitLevelToCustomer } = require('../utils/customerLevels');
const signatureUtil = require('../utils/signature');
const { timesOverlap, leaveWindow } = require('../utils/overlap');
const { visitInputError } = require('../utils/inputChecks');

const router = express.Router();

// ไม่รวม 'pending' เพราะคำขอที่กำลังอยู่ระหว่างอนุมัติ (อาจผ่านบาง State ไปแล้วในกรณี multi-stage)
// ห้ามแก้ไขข้อมูลตรงๆ โดยไม่ reset workflow — ถ้าจะแก้ ผู้ขอต้องรอถูก "ส่งกลับแก้ไข" (revision) ก่อน
// ซึ่งตอน resubmit (POST /:id/submit) จะ reset workflow กลับไป State แรกให้เองอยู่แล้ว (เหมือน leave.js)
const EDITABLE_STATUSES = ['draft', 'revision'];
// ยกเลิกคำขอ (cancel) เป็นคนละกรณีกับแก้ไขข้อมูล - อนุญาตให้ยกเลิกได้แม้อยู่ระหว่างอนุมัติ (pending)
const CANCELLABLE_STATUSES = ['draft', 'pending', 'revision'];
// สถานะที่ผู้ขอสามารถกลับมา "อัปเดตข้อมูลหลังปฏิบัติงาน" ได้ (เช่น เวลาออกจริง/เข้าจริง, ไมล์, OT ฯลฯ)
// อนุญาตเฉพาะคำขอที่อนุมัติแล้ว และการอัปเดตนี้จะไม่เปลี่ยนสถานะ/ไม่ต้องส่งขออนุมัติใหม่ (อนุมัติแค่ครั้งเดียว)
const POST_VISIT_EDITABLE_STATUSES = ['approved'];
const COMPLETED_LOCK_MSG = 'คำขอนี้แจ้ง Visit Completed แล้ว ไม่สามารถย้อนกลับหรือแก้ไขข้อมูลได้อีก';

// แปลงวันที่รูปแบบ YYYY-MM-DD (จาก <input type="date">) ให้เป็น วัน/เดือน/ปี ตามรูปแบบไทย
// ใช้ตอนสร้างข้อความแจ้งเตือน (notifications.message) เพื่อไม่ให้ปนกับรูปแบบสากลที่อ่านสลับกันได้
function formatDateThai(d) {
  if (!d) return '-';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

// เช็คว่าผู้ใช้นี้มี Template อนุมัติของโมดูล "visit" ที่เปิดใช้งานอยู่ (is_active=1) และเลือกเขาไว้เป็น Requester จริงหรือไม่
// เงื่อนไข: ต้องมี Template ที่ active + มีเขาอยู่ใน Requester + Template นั้นต้องมีอย่างน้อย 1 State ที่มีผู้อนุมัติจริง (ไม่งั้นถือว่ายังตั้งค่าไม่ครบ ไม่นับว่ามีสิทธิ์)
function isEligibleVisitRequester(userId) {
  const tpl = db.prepare(`
    SELECT t.id FROM approval_templates t
    JOIN template_requesters tr ON tr.template_id = t.id
    WHERE t.module = 'visit' AND t.is_active = 1 AND tr.user_id = ?
    LIMIT 1
  `).get(userId);
  if (!tpl) return false;
  const stateCount = db.prepare(`
    SELECT COUNT(*) AS c FROM template_states ts
    WHERE ts.template_id = ? AND EXISTS (SELECT 1 FROM template_state_approvers a WHERE a.state_id = ts.id)
  `).get(tpl.id).c;
  return stateCount > 0;
}
const NOT_ELIGIBLE_MSG = 'คุณยังไม่มีสิทธิ์ส่งคำขอออกนอกสถานที่ กรุณาติดต่อผู้ดูแลระบบเพื่อเพิ่มชื่อคุณในรายชื่อผู้มีสิทธิ์ (Requester) ของ Template อนุมัติก่อน';

// ---------- Custom Fields (Form Builder) - ไม่กระทบ core fields เดิมเลย ----------
// บันทึกค่าของ field ที่ Admin สร้างเองสำหรับคำขอ Visit หนึ่งรายการ
// customFields: { field_key: value, ... } - เฉพาะ field ที่ active เท่านั้นที่รับค่า (field ที่ปิดใช้งานจะถูกข้าม)
// ค่าแนบไฟล์ (Data URL) ต้องขึ้นต้นด้วย data: และไม่ใหญ่เกินไป — กันค่าแปลกๆ (เช่น javascript:) ที่จะถูกนำไปใส่ใน href ของลิงก์ดาวน์โหลดฝั่งหน้าเว็บ
const MAX_FILE_DATA_LEN = 7000000; // ไฟล์ 4MB เมื่อเป็น base64 ≈ 5.4 ล้านตัวอักษร
function isValidFileValue(v) {
  if (v === undefined || v === null || v === '') return true;
  return typeof v === 'string' && v.startsWith('data:') && v.length <= MAX_FILE_DATA_LEN;
}

// คืนข้อความ error (string) ถ้าข้อมูลไม่ถูกต้อง, คืน null ถ้าบันทึกสำเร็จ
function saveCustomFieldValues(visitRequestId, customFields) {
  if (!customFields || typeof customFields !== 'object') return null;
  const activeFields = db.prepare('SELECT id, field_key, label, field_type FROM custom_form_fields WHERE is_active = 1').all();
  // ตรวจให้ครบก่อนเขียนจริง จะได้ไม่บันทึกไปครึ่งๆ กลางๆ
  for (const f of activeFields) {
    if (f.field_type === 'file' && Object.prototype.hasOwnProperty.call(customFields, f.field_key) && !isValidFileValue(customFields[f.field_key])) {
      return `ไฟล์แนบในช่อง "${f.label}" ไม่ถูกต้องหรือมีขนาดใหญ่เกินไป`;
    }
  }
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
  return null;
}

// ฟิลด์หลักของคำขอ Visit ที่รับจาก body (ใช้ทั้งตอนสร้างและแก้ไข)
const VISIT_SCALAR_FIELDS = ['customer_id', 'visit_date', 'time_from', 'time_to', 'purpose', 'location',
  'contact_person', 'contact_phone', 'transport', 'license_plate', 'notes',
  'job_type', 'sales_person', 'mileage_out', 'mileage_in', 'actual_time_out', 'actual_time_back',
  'ot_hours', 'product', 'participants', 'customer_tax_id', 'tax_invoice_date'];
const MAX_SCALAR_TEXT_LEN = 10000;

// ค่าของฟิลด์หลักต้องเป็นข้อความ/ตัวเลข/ว่างเท่านั้น (ถ้าเป็น object/array/boolean จะทำให้ฐานข้อมูลล้มเป็น error 500) และข้อความต้องไม่ยาวผิดปกติ
// คืนชื่อฟิลด์แรกที่ไม่ถูกต้อง หรือ null ถ้าถูกต้องทั้งหมด
function findInvalidScalarField(body) {
  for (const f of VISIT_SCALAR_FIELDS) {
    const v = body[f];
    if (v === undefined || v === null) continue;
    if (typeof v === 'number') { if (!Number.isFinite(v)) return f; continue; }
    if (typeof v === 'string') { if (v.length > MAX_SCALAR_TEXT_LEN) return f; continue; }
    return f;
  }
  return null;
}

// ตรวจลูกค้าที่เลือก: customer_id เป็น NOT NULL + FK ในฐานข้อมูล (ถ้าไม่ตรวจก่อน จะได้ error 500 แทนข้อความเตือน)
// ตรวจเฉพาะเมื่อมีการส่ง customer_id มา (undefined = ไม่ได้แก้ช่องนี้)
function customerError(customerId) {
  if (customerId === undefined) return null;
  if (customerId === null || customerId === '') return 'กรุณาเลือกลูกค้า';
  const cid = Number(customerId);
  if (!Number.isInteger(cid) || !db.prepare('SELECT 1 FROM customers WHERE id = ?').get(cid)) return 'ไม่พบข้อมูลลูกค้าที่เลือก กรุณาเลือกลูกค้าใหม่จากรายการ';
  return null;
}

// ใช้โยนออกจาก transaction เพื่อ rollback แล้วตอบ 400 พร้อมข้อความ
class ValidationError extends Error {}

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
  const requiredCore = db.prepare('SELECT field_key, label FROM core_field_settings WHERE is_visible = 1 AND is_required = 1 AND field_key NOT IN (\'actual_time_out\', \'actual_time_back\')').all();
  return requiredCore.filter(f => {
    const v = body[f.field_key];
    return v === undefined || v === null || (typeof v === 'string' && !v.trim());
  });
}


// ---------- ฟิลด์ใหม่ของฟอร์ม Visit แบบ Single Page ----------
// คอลัมน์ธรรมดา + คอลัมน์ JSON (ผู้ติดต่อหลายคน, Objective, During Visit, Opportunity, Action Plan, Customer Level, Next Visit)
const EXTRA_TEXT_FIELDS = ['request_date', 'company', 'customer_type', 'meeting_start', 'meeting_end'];
const EXTRA_JSON_FIELDS = ['contacts_json', 'objective_json', 'during_visit_json', 'opportunity_json',
  'action_plan_json', 'customer_level_json', 'next_visit_json'];
const MAX_JSON_LEN = 200000;

// เขียนฟิลด์ใหม่ลงคำขอ — รับเฉพาะ key ที่ส่งมา (ไม่ส่ง = ไม่แตะ) และตรวจว่า JSON ถูกต้อง/ไม่ใหญ่เกินไป
// คืนข้อความ error (string) ถ้าข้อมูลไม่ถูกต้อง
function saveVisitExtras(id, body) {
  const sets = [];
  const vals = [];
  for (const f of EXTRA_TEXT_FIELDS) {
    if (body[f] !== undefined) { sets.push(`${f} = ?`); vals.push(body[f] === null ? '' : String(body[f]).slice(0, 200)); }
  }
  for (const f of EXTRA_JSON_FIELDS) {
    if (body[f] === undefined) continue;
    let str = body[f];
    if (str === null || str === '') { sets.push(`${f} = ?`); vals.push(null); continue; }
    if (typeof str !== 'string') str = JSON.stringify(str);
    if (str.length > MAX_JSON_LEN) return `ข้อมูลส่วน ${f} ใหญ่เกินไป`;
    try { JSON.parse(str); } catch (e) { return `ข้อมูลส่วน ${f} ไม่ถูกต้อง`; }
    sets.push(`${f} = ?`); vals.push(str);
  }
  if (sets.length) db.prepare(`UPDATE visit_requests SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  return null;
}

// ตอนส่งคำขอจริง: ผู้ติดต่อที่มีข้อมูลต้องมีชื่อ (Contact Name *)
function validateContactsJson(raw) {
  if (!raw) return null;
  try {
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(list)) return null;
    const bad = list.some(c => c && (c.position || c.telephone || c.ext || c.mobile || c.email) && !String(c.name || '').trim());
    return bad ? 'กรุณากรอกชื่อผู้ติดต่อ (Contact Name) ให้ครบทุกคน' : null;
  } catch (e) { return null; }
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

// GET /api/visit-requests/my-status-counts  -> จำนวนคำขอ Visit ของฉัน แยกตามขั้นตอน (ใช้โชว์ตัวเลขที่เมนูข้างซ้าย)
// ต้องอยู่ก่อน route '/:id' ไม่งั้นจะถูกตีความว่า id = 'my-status-counts'
router.get('/my-status-counts', requireAuth, (req, res) => {
  // approved = อนุมัติแล้วแต่ยังไม่แจ้งเสร็จสิ้น (กำลังดำเนินการ), completed = ผู้ขอกด "Visit Completed" แล้ว
  const rows = db.prepare(`
    SELECT CASE WHEN status = 'approved' AND completed_at IS NOT NULL THEN 'completed' ELSE status END AS st, COUNT(*) AS c
    FROM visit_requests WHERE requester_id = ? GROUP BY st`).all(req.session.userId);
  const counts = { draft: 0, pending: 0, revision: 0, approved: 0, completed: 0, rejected: 0 };
  rows.forEach(r => { if (r.st in counts) counts[r.st] = r.c; });
  res.json({ counts });
});

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
    if (!['Approver', 'Admin'].includes(role) && !approvalEngine.hasEverBeenApprover(userId)) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึง' });
    }
    where.push(`vr.status != 'draft'`);
    where.push(`vr.status != 'revision'`);
    // ผู้มีสิทธิ์อนุมัติ (ผ่านด่านด้านบนแล้ว) เห็นคำขอของทุกคน เพื่อให้ตรงกับตัวเลขบน Dashboard
  } else {
    // scope อื่นๆ (เช่น 'all') ไม่รองรับ - เดิมหลุดไปไม่มีตัวกรองและคืนคำขอของทุกคน (รวมฉบับร่างคนอื่น)
    return res.status(400).json({ error: 'scope ไม่ถูกต้อง' });
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
    ORDER BY vr.created_at DESC, vr.id DESC
  `;
  let rows = db.prepare(sql).all(...params);
  // แบ่งหน้า (ไม่บังคับ): ถ้าส่ง page_size มา จะคืนเฉพาะหน้านั้นพร้อม total; ถ้าไม่ส่ง คืนทั้งหมดเหมือนเดิม
  const pageSize = Math.min(200, parseInt(req.query.page_size, 10) || 0);
  const total = rows.length;
  if (pageSize > 0) {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    rows = rows.slice((page - 1) * pageSize, page * pageSize);
  }
  // ประวัติล่าสุดของใบที่รออนุมัติ: ดึงรอบเดียว (เดิมยิง query ทีละใบ)
  const lastHist = new Map();
  const pendingIds = scope === 'pending' ? rows.filter((r) => r.status === 'pending').map((r) => r.id) : [];
  if (pendingIds.length) {
    db.prepare(`SELECT visit_request_id AS rid, action, note FROM approval_history
                WHERE visit_request_id IN (${pendingIds.map(() => '?').join(',')}) AND (action LIKE 'ส่งคำขอ%' OR action LIKE 'แก้ไขหลังอนุมัติ%')
                ORDER BY id ASC`).all(...pendingIds).forEach((h) => lastHist.set(h.rid, h));   // แถวหลังสุดทับแถวก่อนหน้า = ล่าสุด
  }
  if (scope === 'pending') {
    // บอกหน้าเว็บว่าคนนี้ "กดอนุมัติใบนี้ได้จริงไหม" (อยู่ในรายชื่อผู้อนุมัติ State ปัจจุบันของใบนั้น) จะได้ไม่โชว์ปุ่มที่กดแล้วถูกปฏิเสธ
    // และให้ Admin เห็นปุ่มรีเซ็ตสายอนุมัติ เมื่อใบที่ค้างอยู่ใช้รายชื่อเก่า (เช่น เพิ่มผู้อนุมัติใน Template หลังส่งคำขอ)
    const isAdminUser = role === 'Admin';
    for (const r of rows) {
      if (r.status !== 'pending') continue;
      r.can_act = approvalEngine.canActOn('visit', r.id, userId);
      r.waiting_for = approvalEngine.currentApproverNames('visit', r.id).join(', ');
      r.can_resync = isAdminUser && approvalEngine.canResync('visit', r.id);
      // แยก "คำขอใหม่" กับ "คำขอที่ถูกแก้ไขหลังอนุมัติแล้วส่งกลับมา": ดูรายการล่าสุดที่ทำให้ใบนี้กลับมารออนุมัติ
      const last = lastHist.get(r.id);
      r.is_update = !!(last && last.action.startsWith('แก้ไขหลังอนุมัติ'));
      r.update_summary = r.is_update ? (last.note || '') : '';
    }
  }
  res.json(pageSize > 0 ? { requests: rows, total, page_size: pageSize } : { requests: rows });
});

// ข้อมูลสำหรับหน้าปฏิทิน: เฉพาะคำขอที่ "รออนุมัติ" หรือ "อนุมัติแล้ว" (ไม่รวมฉบับร่าง/ส่งกลับแก้ไข/ไม่อนุมัติ/ยกเลิก) และเลือกเฉพาะคอลัมน์ที่ใช้ (ไม่ส่ง JSON ก้อนใหญ่ของฟอร์มมาด้วย)
// ทุกคนที่ล็อกอินเห็นปฏิทินรวม (ใคร/ที่ไหน/เมื่อไร) แต่หมายเหตุภายในเห็นเฉพาะเจ้าของ/ผู้มีสิทธิ์อนุมัติ
router.get('/calendar/events', requireAuth, (req, res) => {
  const base = `
    SELECT vr.id, vr.code, vr.requester_id, vr.visit_date, vr.time_from, vr.time_to, vr.purpose, vr.location,
           vr.participants, vr.notes, vr.job_type, vr.status, vr.completed_at,
           c.name AS customer_name,
           u.full_name AS requester_name, u.department AS requester_department,
           a.full_name AS approver_name
    FROM visit_requests vr
    LEFT JOIN customers c ON c.id = vr.customer_id
    JOIN users u ON u.id = vr.requester_id
    LEFT JOIN users a ON a.id = vr.approver_id
    WHERE vr.status IN ('pending', 'approved')`;
  const rows = db.prepare(`${base} ORDER BY vr.visit_date ASC, vr.time_from ASC`).all();
  const full = canViewAll(req.session);
  for (const r of rows) {
    if (!full && r.requester_id !== req.session.userId) r.notes = null; // พนักงานทั่วไปเห็นว่าใครไปไหน แต่ไม่เห็นหมายเหตุภายใน
    if (r.status === 'pending') r.waiting_for = approvalEngine.currentApproverNames('visit', r.id).join(', ');
  }
  res.json({ requests: rows });
});

// ตรวจ Visit/ลา ของตัวเองที่เวลาทับกัน (ใช้เตือนก่อนส่งคำขอ ไม่บล็อกการส่ง)
// GET /api/visit-requests/conflicts?date=YYYY-MM-DD&time_from=HH:MM&time_to=HH:MM&exclude_id=
router.get('/conflicts', requireAuth, (req, res) => {
  const { date, time_from, time_to } = req.query;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return res.status(400).json({ error: 'วันที่ไม่ถูกต้อง' });
  const me = req.session.userId, exclude = parseInt(req.query.exclude_id, 10) || 0;
  const conflicts = [];
  db.prepare(`SELECT id, code, time_from, time_to, status FROM visit_requests
              WHERE requester_id = ? AND visit_date = ? AND status IN ('pending','approved') AND id != ?`).all(me, date, exclude)
    .forEach((v) => { if (timesOverlap(time_from, time_to, v.time_from, v.time_to)) conflicts.push({ type: 'visit', code: v.code, label: `Visit ${v.code} (${v.time_from || '-'}-${v.time_to || '-'})` }); });
  db.prepare(`SELECT code, leave_type, leave_mode, time_from, time_to FROM leave_requests
              WHERE requester_id = ? AND status IN ('pending','approved') AND date_from <= ? AND date_to >= ?`).all(me, date, date)
    .forEach((l) => { const [f, t] = leaveWindow(l.leave_mode, l.time_from, l.time_to);
      if (timesOverlap(time_from, time_to, f, t)) conflicts.push({ type: 'leave', code: l.code, label: `${l.leave_type} ${l.code}` }); });
  res.json({ conflicts });
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

  const isRequester = vr.requester_id === req.session.userId;
  const isAdmin = req.session.role === 'Admin';
  const isParticipant = approvalEngine.isWorkflowParticipant('visit', vr.id, req.session.userId);
  const isViewer = canViewAll(req.session) && vr.status !== 'draft'; // ผู้มีสิทธิ์อนุมัติดูได้ทุกคำขอ (ยกเว้นฉบับร่างของคนอื่น)
  if (!isRequester && !isAdmin && !isParticipant && !isViewer) {
    return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ดูคำขอนี้' });
  }

  const history = db.prepare(`
    SELECT h.*, u.full_name AS actor_name
    FROM approval_history h
    LEFT JOIN users u ON u.id = h.action_by
    WHERE h.visit_request_id = ?
    ORDER BY h.created_at ASC, h.id ASC
  `).all(req.params.id);

  const customFields = getCustomFieldValues(req.params.id);
  const workflow = approvalEngine.getWorkflow('visit', vr.id);

  res.json({
    request: vr, history, customFields, workflow,
    customer_signature: db.prepare('SELECT data_url, signer_name, signer_title, signed_at FROM visit_customer_signatures WHERE visit_request_id = ?').get(vr.id) || null,
    can_act: vr.status === 'pending' && approvalEngine.canActOn('visit', vr.id, req.session.userId),
    can_resync: isAdmin && vr.status === 'pending' && approvalEngine.canResync('visit', vr.id)
  });
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

  const badField = findInvalidScalarField(req.body);
  if (badField) return res.status(400).json({ error: `ข้อมูลในช่อง ${badField} ไม่ถูกต้องหรือยาวเกินไป` });
  {
    // ฉบับร่างก็ต้องมีลูกค้า เพราะคอลัมน์ customer_id ในฐานข้อมูลเป็น NOT NULL
    const bad = visitInputError(req.body) || customerError(customer_id === undefined ? null : customer_id);
    if (bad) return res.status(400).json({ error: bad });
  }

  if (!isDraft && (!customer_id || !visit_date || !time_from || !time_to)) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' });
  }
  if (!isDraft) {
    const contactErr = validateContactsJson(req.body.contacts_json);
    if (contactErr) return res.status(400).json({ error: contactErr });
    const missing = validateRequiredCustomFields(custom_fields);
    if (missing.length) {
      return res.status(400).json({ error: `กรุณากรอก: ${missing.map(f => f.label).join(', ')}` });
    }
    const missingCore = validateRequiredCoreFields(req.body);
    if (missingCore.length) {
      return res.status(400).json({ error: `กรุณากรอก: ${missingCore.map(f => f.label).join(', ')}` });
    }
    // ยังไม่มี Template อนุมัติไหนเซ็ตชื่อผู้ใช้นี้ไว้เป็น Requester เลย -> บล็อกตอนส่งคำขอ (ฟอร์มกรอก/บันทึกร่างได้ปกติ แต่ส่งจริงไม่ได้)
    if (!isEligibleVisitRequester(userId)) {
      return res.status(403).json({ error: NOT_ELIGIBLE_MSG });
    }
    {
      const noApprover = approvalEngine.checkCanSubmit('visit', userId);
      if (noApprover) return res.status(400).json({ error: noApprover });
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
  const customErr = saveCustomFieldValues(vrId, custom_fields);
  const extrasErr = customErr || saveVisitExtras(vrId, req.body);
  if (extrasErr) {
    // ข้อมูลส่วนใหม่ไม่ถูกต้อง -> ยกเลิกคำขอที่เพิ่งสร้าง (ยังไม่มี workflow/ประวัติ) แล้วแจ้งผู้ใช้
    db.prepare('DELETE FROM visit_custom_values WHERE visit_request_id = ?').run(vrId);
    db.prepare('DELETE FROM visit_requests WHERE id = ?').run(vrId);
    return res.status(400).json({ error: extrasErr });
  }
  const requester = db.prepare('SELECT full_name, department FROM users WHERE id = ?').get(userId);

  if (isDraft) {
    db.prepare(`INSERT INTO approval_history (visit_request_id, action_by, action, channel) VALUES (?, ?, 'บันทึกฉบับร่าง', 'web')`).run(vrId, userId);
    logAction(userId, 'create_draft', `บันทึกฉบับร่างคำขอ #${code}`);
    return res.status(201).json({ id: vrId, code, status });
  }

  db.prepare(`INSERT INTO approval_history (visit_request_id, action_by, action, channel) VALUES (?, ?, 'ส่งคำขอ', 'web')`).run(vrId, userId);
  logAction(userId, 'submit_request', `ส่งคำขอ #${code}`);

  approvalEngine.createWorkflow('visit', vrId, userId);
  notifyRequestSubmitted(vrId, requester);

  res.status(201).json({ id: vrId, code, status });
});

// แจ้งเตือนผู้อนุมัติ (ในระบบ + อีเมล) เมื่อมีคำขอเข้าสู่สถานะ pending
// isAdvance = true เมื่อเรียกตอน state เลื่อนไปคนถัดไป (ไม่ใช่ตอนส่งคำขอครั้งแรก) - แจ้งเฉพาะผู้อนุมัติของ state ปัจจุบัน ไม่ต้องแจ้ง Admin ซ้ำทุกรอบ
function notifyRequestSubmitted(vrId, requester, isAdvance = false, changes = null) {
  const currentApproverIds = approvalEngine.getCurrentApproverIds('visit', vrId);
  const admins = isAdvance ? [] : db.prepare(`SELECT id FROM users WHERE is_active = 1 AND role = 'Admin'`).all().map(r => r.id);
  const ids = Array.from(new Set([...currentApproverIds, ...admins]));
  if (!ids.length) return;
  const approvers = db.prepare(`SELECT id, full_name, email, email_notify FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  const vr = db.prepare('SELECT * FROM visit_requests WHERE id = ?').get(vrId);
  const msg = (changes && changes.length)
    ? `${requester.full_name} แก้ไขคำขอออกนอกสถานที่ที่อนุมัติแล้ว (วันที่ ${formatDateThai(vr.visit_date)}) กรุณาอนุมัติอีกครั้ง — แก้ไข: ${changes.slice(0, 3).join(' | ')}${changes.length > 3 ? ` และอีก ${changes.length - 3} รายการ` : ''}`.slice(0, 480)
    : isAdvance
    ? `คำขอออกนอกสถานที่ของ ${requester.full_name} วันที่ ${formatDateThai(vr.visit_date)} เวลา ${vr.time_from} - ${vr.time_to} ถึงคิวที่ต้องให้คุณอนุมัติแล้ว`
    : `มีคำขอออกนอกสถานที่ใหม่จาก ${requester.full_name} วันที่ ${formatDateThai(vr.visit_date)} เวลา ${vr.time_from} - ${vr.time_to}`;
  const notifStmt = db.prepare(`INSERT INTO notifications (user_id, type, message, related_id) VALUES (?, 'new_request', ?, ?)`);
  const vrWithCustomer = db.prepare(`
    SELECT vr.*, c.name AS customer_name FROM visit_requests vr LEFT JOIN customers c ON c.id = vr.customer_id WHERE vr.id = ?
  `).get(vrId);
  for (const a of approvers) {
    notifStmt.run(a.id, msg, vrId);
    if (a.email && a.email_notify) {
      sendNewRequestEmail({
        to: a.email, approverName: a.full_name, requesterName: requester.full_name, vr: vrWithCustomer,
        emailRows: getEmailRows(vrWithCustomer), showDocCode: getShowDocCode()
      }).catch(err => console.error('sendNewRequestEmail error:', err.message));
    }
  }
}

// SUBMIT: ส่งฉบับร่าง หรือคำขอที่ถูกส่งกลับแก้ไข เข้าสู่สถานะรออนุมัติ
router.post('/:id/submit', requireAuth, (req, res) => {
  const vr = db.prepare('SELECT * FROM visit_requests WHERE id = ?').get(req.params.id);
  if (!vr) return res.status(404).json({ error: 'ไม่พบคำขอ' });
  if (vr.requester_id !== req.session.userId) return res.status(403).json({ error: 'ไม่มีสิทธิ์ดำเนินการกับคำขอนี้' });
  if (!['draft', 'revision'].includes(vr.status)) {
    return res.status(400).json({ error: 'สามารถส่งคำขอได้เฉพาะฉบับร่างหรือคำขอที่ถูกส่งกลับแก้ไขเท่านั้น' });
  }
  if (!vr.customer_id || !vr.visit_date || !vr.time_from || !vr.time_to) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วนก่อนส่งคำขอ' });
  }
  { const bad = visitInputError(vr); if (bad) return res.status(400).json({ error: bad }); }
  const contactErr = validateContactsJson(vr.contacts_json);
  if (contactErr) return res.status(400).json({ error: contactErr });
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
  // ยังไม่มี Template อนุมัติไหนเซ็ตชื่อผู้ใช้นี้ไว้เป็น Requester เลย -> บล็อกตอนส่งคำขอ
  if (!isEligibleVisitRequester(req.session.userId)) {
    return res.status(403).json({ error: NOT_ELIGIBLE_MSG });
  }
  {
    const noApprover = approvalEngine.checkCanSubmit('visit', req.session.userId);
    if (noApprover) return res.status(400).json({ error: noApprover });
  }

  const wasDraft = vr.status === 'draft';
  db.prepare(`UPDATE visit_requests SET status = 'pending', approver_id = NULL, approved_at = NULL, approval_note = '' WHERE id = ?`).run(req.params.id);
  db.prepare(`INSERT INTO approval_history (visit_request_id, action_by, action, channel) VALUES (?, ?, ?, 'web')`)
    .run(req.params.id, req.session.userId, wasDraft ? 'ส่งคำขอ (จากฉบับร่าง)' : 'ส่งคำขออีกครั้งหลังแก้ไข');
  logAction(req.session.userId, 'submit_request', `ส่งคำขอ #${vr.code}${wasDraft ? ' (จากฉบับร่าง)' : ' (หลังแก้ไข)'}`);

  const requester = db.prepare('SELECT full_name, department FROM users WHERE id = ?').get(req.session.userId);
  approvalEngine.createWorkflow('visit', vr.id, req.session.userId); // เริ่ม workflow ใหม่จาก State แรกเสมอ (ดึง Template ล่าสุด ณ ตอนนี้)
  notifyRequestSubmitted(vr.id, requester);

  res.json({ ok: true });
});

// UPDATE (แก้ไขคำขอ - เฉพาะเจ้าของคำขอ และเฉพาะสถานะที่ยังแก้ไขได้: draft / revision, หรือ post-visit update ตอน approved)
// ชื่อฟิลด์ภาษาไทยสำหรับสรุปว่า "แก้อะไรบ้าง" ตอนแก้ไขหลังอนุมัติ
const FIELD_LABELS = {
  customer_id: 'ลูกค้า', visit_date: 'วันที่', time_from: 'เวลาเริ่ม', time_to: 'เวลาสิ้นสุด', purpose: 'วัตถุประสงค์', location: 'สถานที่',
  contact_person: 'ผู้ติดต่อ', contact_phone: 'เบอร์โทร', transport: 'ยานพาหนะ', license_plate: 'ทะเบียนรถ', notes: 'หมายเหตุ',
  job_type: 'ประเภทงาน', sales_person: 'ผู้ดูแลการขาย', mileage_out: 'เลขไมล์ออก', mileage_in: 'เลขไมล์กลับ',
  actual_time_out: 'เวลาออกจริง', actual_time_back: 'เวลากลับจริง', ot_hours: 'ชั่วโมง OT', product: 'สินค้า', participants: 'ผู้ร่วมงาน',
  customer_tax_id: 'เลขผู้เสียภาษีลูกค้า', tax_invoice_date: 'วันที่ใบกำกับภาษี',
  request_date: 'วันที่ขอ', company: 'บริษัท', customer_type: 'ประเภทลูกค้า', meeting_start: 'เวลาเริ่มพบลูกค้า', meeting_end: 'เวลาจบการพบลูกค้า',
  contacts_json: 'ข้อมูลผู้ติดต่อ', objective_json: 'วัตถุประสงค์การเข้าพบ', during_visit_json: 'ข้อมูลระหว่าง Visit', opportunity_json: 'โอกาสทางธุรกิจ',
  action_plan_json: 'แผนดำเนินการ', customer_level_json: 'ระดับลูกค้า', next_visit_json: 'แผน Visit ครั้งต่อไป'
};
const norm = (v) => (v === null || v === undefined) ? '' : String(v).trim();
const normJson = (v) => { if (v === null || v === undefined || v === '') return ''; try { return JSON.stringify(typeof v === 'string' ? JSON.parse(v) : v); } catch (e) { return String(v); } };
const clip = (s, n = 60) => { const t = norm(s).replace(/\s+/g, ' '); return t.length > n ? t.slice(0, n) + '…' : t; };

// ภาพถ่ายข้อมูลที่ผู้อนุมัติสนใจ (ฟิลด์หลัก + ฟิลด์เสริม + custom fields) ไว้เทียบก่อน/หลังแก้ไข
function snapshotForDiff(id) {
  const row = db.prepare('SELECT * FROM visit_requests WHERE id = ?').get(id) || {};
  const customer = row.customer_id ? db.prepare('SELECT name FROM customers WHERE id = ?').get(row.customer_id) : null;
  const scalars = {};
  for (const f of [...VISIT_SCALAR_FIELDS, ...EXTRA_TEXT_FIELDS]) scalars[f] = f === 'customer_id' ? norm(customer && customer.name) : norm(row[f]);
  for (const f of EXTRA_JSON_FIELDS) scalars[f] = normJson(row[f]);
  const custom = {};
  getCustomFieldValues(id).forEach(c => { custom[c.field_key] = { label: c.label, value: norm(c.value) }; });
  return { scalars, custom };
}

// คืนรายการสิ่งที่เปลี่ยน เช่น ["วันที่: 09/10/2026 → 12/10/2026", "ข้อมูลผู้ติดต่อ: มีการแก้ไข"]
function diffSnapshots(a, b) {
  const out = [];
  for (const f of Object.keys(b.scalars)) {
    if (a.scalars[f] === b.scalars[f]) continue;
    const label = FIELD_LABELS[f] || f;
    if (f.endsWith('_json')) out.push(`${label}: มีการแก้ไข`);
    else out.push(`${label}: ${clip(a.scalars[f]) || '(ว่าง)'} → ${clip(b.scalars[f]) || '(ว่าง)'}`);
  }
  for (const k of new Set([...Object.keys(a.custom), ...Object.keys(b.custom)])) {
    const x = a.custom[k] ? a.custom[k].value : '', y = b.custom[k] ? b.custom[k].value : '';
    if (x !== y) out.push(`${(b.custom[k] || a.custom[k]).label}: ${clip(x) || '(ว่าง)'} → ${clip(y) || '(ว่าง)'}`);
  }
  return out;
}

router.put('/:id', requireAuth, (req, res) => {
  const vr = db.prepare('SELECT * FROM visit_requests WHERE id = ?').get(req.params.id);
  if (!vr) return res.status(404).json({ error: 'ไม่พบคำขอ' });
  if (vr.requester_id !== req.session.userId) return res.status(403).json({ error: 'ไม่มีสิทธิ์แก้ไขคำขอนี้' });
  if (vr.completed_at) return res.status(400).json({ error: COMPLETED_LOCK_MSG });
  const isPostVisitUpdate = POST_VISIT_EDITABLE_STATUSES.includes(vr.status);
  if (!EDITABLE_STATUSES.includes(vr.status) && !isPostVisitUpdate) {
    return res.status(400).json({ error: 'ไม่สามารถแก้ไขคำขอที่ดำเนินการแล้วได้' });
  }

  const badField = findInvalidScalarField(req.body);
  if (badField) return res.status(400).json({ error: `ข้อมูลในช่อง ${badField} ไม่ถูกต้องหรือยาวเกินไป` });
  {
    // ตรวจวัน/เวลาจากค่าหลังรวมกับของเดิม (กันแก้แค่เวลาเริ่มจนเลยเวลาสิ้นสุด)
    const merged = { visit_date: vr.visit_date, time_from: vr.time_from, time_to: vr.time_to };
    ['visit_date', 'time_from', 'time_to'].forEach((k) => { if (req.body[k] !== undefined) merged[k] = req.body[k]; });
    const bad = visitInputError(merged) || customerError(req.body.customer_id);
    if (bad) return res.status(400).json({ error: bad });
  }

  // แก้ไขหลังอนุมัติ: ถ้ามีการเปลี่ยนแปลงจริง จะส่งกลับไปให้ผู้อนุมัติอนุมัติอีกครั้ง -> ต้องมีสายอนุมัติที่ใช้งานได้ก่อน ไม่งั้นไม่บันทึก
  if (isPostVisitUpdate) {
    const noApprover = approvalEngine.checkCanSubmit('visit', req.session.userId);
    if (noApprover) return res.status(400).json({ error: noApprover });
  }
  const beforeSnap = isPostVisitUpdate ? snapshotForDiff(req.params.id) : null;

  const updates = [];
  const values = [];
  for (const f of VISIT_SCALAR_FIELDS) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      values.push(req.body[f]);
    }
  }
  let changes = [];
  // บันทึกฟิลด์หลัก + custom fields + ฟิลด์เสริม ใน transaction เดียว: ถ้าส่วนไหนไม่ถูกต้องจะย้อนกลับทั้งหมด ไม่บันทึกค้างไว้ครึ่งเดียว
  try {
    db.transaction(() => {
      if (updates.length) {
        // หมายเหตุ: ไม่แตะคอลัมน์ status เลย ดังนั้นคำขอที่ "อนุมัติแล้ว" จะยังคงเป็น approved อยู่เหมือนเดิมหลังอัปเดต
        // (ไม่ต้องส่งขออนุมัติซ้ำ - อนุมัติแค่ครั้งเดียวตามที่ต้องการ)
        db.prepare(`UPDATE visit_requests SET ${updates.join(', ')} WHERE id = ?`).run(...values, req.params.id);
      }
      if (req.body.custom_fields) {
        const customErr = saveCustomFieldValues(req.params.id, req.body.custom_fields);
        if (customErr) throw new ValidationError(customErr);
      }
      const extrasErr = saveVisitExtras(req.params.id, req.body);
      if (extrasErr) throw new ValidationError(extrasErr);
      if (isPostVisitUpdate) {
        changes = diffSnapshots(beforeSnap, snapshotForDiff(req.params.id));
        if (changes.length) {
          // มีการเปลี่ยนแปลงจริง -> กลับไปรออนุมัติใหม่ตั้งแต่ State แรก (ใช้ Template ล่าสุด) และจดสิ่งที่เปลี่ยนไว้ให้ผู้อนุมัติเห็น
          db.prepare(`UPDATE visit_requests SET status = 'pending', approver_id = NULL, approved_at = NULL, approval_note = '' WHERE id = ?`).run(req.params.id);
          approvalEngine.createWorkflow('visit', vr.id, req.session.userId);
          db.prepare('DELETE FROM visit_customer_signatures WHERE visit_request_id = ?').run(req.params.id); // ข้อมูลเปลี่ยนหลังลูกค้าเซ็น -> ลายเซ็นเดิมใช้ไม่ได้ ต้องเซ็นใหม่
        }
      }
    })();
  } catch (err) {
    if (err instanceof ValidationError || err instanceof approvalEngine.ApprovalError) return res.status(400).json({ error: err.message });
    throw err;
  }
  if (isPostVisitUpdate) {
    if (changes.length) {
      const summary = changes.join('\n').slice(0, 3000);
      db.prepare(`INSERT INTO approval_history (visit_request_id, action_by, action, note, channel) VALUES (?, ?, 'แก้ไขหลังอนุมัติ — ส่งขออนุมัติอีกครั้ง', ?, 'web')`).run(req.params.id, req.session.userId, summary);
      logAction(req.session.userId, 'update_after_approval', `แก้ไขคำขอที่อนุมัติแล้ว #${vr.code} และส่งขออนุมัติอีกครั้ง (${changes.length} รายการ)`);
      const requester = db.prepare('SELECT full_name, department FROM users WHERE id = ?').get(req.session.userId);
      notifyRequestSubmitted(vr.id, requester, false, changes);
      return res.json({ ok: true, reapproval: true, changes });
    }
    db.prepare(`INSERT INTO approval_history (visit_request_id, action_by, action, channel) VALUES (?, ?, 'อัปเดตข้อมูลหลังปฏิบัติงาน (ไม่มีการเปลี่ยนแปลง)', 'web')`).run(req.params.id, req.session.userId);
    logAction(req.session.userId, 'update_after_visit', `อัปเดตข้อมูลหลังปฏิบัติงาน #${vr.code} (ไม่มีการเปลี่ยนแปลง)`);
  } else {
    logAction(req.session.userId, 'edit_request', `แก้ไขคำขอ #${vr.code}`);
  }
  res.json({ ok: true, reapproval: false });
});

// วันนี้ตามเวลาไทย (YYYY-MM-DD) — ใช้เทียบกับวันที่ไป Visit
function todayBangkok() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

// COMPLETE: ผู้ขอแจ้งว่า "Visit Completed" หลังไปพบลูกค้าแล้ว -> คำขอย้ายไปขั้น "Visit Completed"
// ทำได้เฉพาะคำขอที่อนุมัติแล้ว และถึงวันที่ไป Visit แล้ว (ไม่เปลี่ยนสถานะอนุมัติ ไม่ต้องขออนุมัติใหม่)
router.post('/:id/complete', requireAuth, (req, res) => {
  const vr = db.prepare('SELECT * FROM visit_requests WHERE id = ?').get(req.params.id);
  if (!vr) return res.status(404).json({ error: 'ไม่พบคำขอ' });
  if (vr.requester_id !== req.session.userId) return res.status(403).json({ error: 'ไม่มีสิทธิ์ปรับสถานะคำขอนี้' });
  if (vr.status !== 'approved') return res.status(400).json({ error: 'แจ้งเสร็จสิ้นได้เฉพาะคำขอที่อนุมัติแล้ว' });
  if (vr.completed_at) return res.status(400).json({ error: 'คำขอนี้แจ้งเสร็จสิ้นไปแล้ว' });
  if (vr.visit_date > todayBangkok()) return res.status(400).json({ error: 'ยังไม่ถึงวันที่ไป Visit จึงยังแจ้งเสร็จสิ้นไม่ได้' });
  const note = String(req.body.note || '').trim().slice(0, 1000);
  db.prepare(`UPDATE visit_requests SET completed_at = CURRENT_TIMESTAMP, completion_note = ? WHERE id = ?`).run(note || null, vr.id);
  db.prepare(`INSERT INTO approval_history (visit_request_id, action_by, action, note, channel) VALUES (?, ?, 'แจ้ง Visit Completed', ?, 'web')`).run(vr.id, req.session.userId, note || null);
  logAction(req.session.userId, 'complete_visit', `แจ้ง Visit Completed #${vr.code}`);
  res.json({ ok: true });
});

// REOPEN: ปิดถาวร — Visit Completed แล้วเป็นสถานะสุดท้าย ย้อนกลับ/แก้ไขข้อมูลไม่ได้อีก
// (คง route ไว้เพื่อให้หน้าเว็บเก่าที่ยังแคชอยู่ได้ข้อความที่ชัดเจน แทนที่จะเจอ 404)
router.post('/:id/reopen', requireAuth, (req, res) => {
  res.status(400).json({ error: COMPLETED_LOCK_MSG });
});

// ===== ลายเซ็นลูกค้า (ลูกค้าเซ็นบนหน้าจอเครื่องพนักงานตอนเข้า Visit) =====
// เงื่อนไข: เจ้าของคำขอเท่านั้น, คำขอต้อง "อนุมัติแล้ว" และยังไม่กด Visit Completed (หลังแจ้งเสร็จสิ้น ลายเซ็นถูกล็อก — ต้องกดย้อนกลับก่อนถึงจะเปลี่ยนได้)
function loadSignableVisit(req, res) {
  const vr = db.prepare('SELECT * FROM visit_requests WHERE id = ?').get(req.params.id);
  if (!vr) { res.status(404).json({ error: 'ไม่พบคำขอ' }); return null; }
  if (vr.requester_id !== req.session.userId) { res.status(403).json({ error: 'ไม่มีสิทธิ์จัดการลายเซ็นของคำขอนี้' }); return null; }
  if (vr.status !== 'approved') { res.status(400).json({ error: 'ให้ลูกค้าเซ็นได้เฉพาะคำขอที่อนุมัติแล้ว' }); return null; }
  if (vr.completed_at) { res.status(400).json({ error: 'คำขอนี้แจ้ง Visit Completed แล้ว ลายเซ็นถูกล็อก ไม่สามารถเปลี่ยนได้อีก' }); return null; }
  return vr;
}

router.post('/:id/customer-signature', requireAuth, (req, res) => {
  const vr = loadSignableVisit(req, res);
  if (!vr) return;
  const { data_url } = req.body || {};
  const name = String((req.body || {}).signer_name || '').replace(/\s+/g, ' ').trim();
  const title = String((req.body || {}).signer_title || '').replace(/\s+/g, ' ').trim();
  if (!name) return res.status(400).json({ error: 'กรุณาระบุชื่อ-นามสกุลผู้เซ็น' });
  if (name.length > 100 || title.length > 100) return res.status(400).json({ error: 'ชื่อหรือตำแหน่งยาวเกินไป (สูงสุด 100 ตัวอักษร)' });
  const parsed = signatureUtil.parseDataUrl(data_url);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  db.transaction(() => {
    db.prepare(`
      INSERT INTO visit_customer_signatures (visit_request_id, data_url, signer_name, signer_title, signed_at, recorded_by)
      VALUES (?, ?, ?, ?, datetime('now'), ?)
      ON CONFLICT(visit_request_id) DO UPDATE SET data_url = excluded.data_url, signer_name = excluded.signer_name,
        signer_title = excluded.signer_title, signed_at = excluded.signed_at, recorded_by = excluded.recorded_by
    `).run(vr.id, data_url, name, title, req.session.userId);
    db.prepare(`INSERT INTO approval_history (visit_request_id, action_by, action, note, channel) VALUES (?, ?, 'ลูกค้าเซ็นรับทราบ', ?, 'web')`)
      .run(vr.id, req.session.userId, title ? `${name} (${title})` : name);
  })();
  logAction(req.session.userId, 'customer_signature', `ลูกค้าเซ็นรับทราบ #${vr.code} (${name})`);
  res.json({ ok: true });
});

router.delete('/:id/customer-signature', requireAuth, (req, res) => {
  const vr = loadSignableVisit(req, res);
  if (!vr) return;
  const info = db.prepare('DELETE FROM visit_customer_signatures WHERE visit_request_id = ?').run(vr.id);
  if (!info.changes) return res.status(404).json({ error: 'ยังไม่มีลายเซ็นลูกค้า' });
  db.prepare(`INSERT INTO approval_history (visit_request_id, action_by, action, channel) VALUES (?, ?, 'ลบลายเซ็นลูกค้า', 'web')`).run(vr.id, req.session.userId);
  logAction(req.session.userId, 'delete_customer_signature', `ลบลายเซ็นลูกค้า #${vr.code}`);
  res.json({ ok: true });
});

// CANCEL (ยกเลิกคำขอโดยเจ้าของ - รวมถึงฉบับร่าง/คำขอที่รอแก้ไข)
router.post('/:id/cancel', requireAuth, (req, res) => {
  const vr = db.prepare('SELECT * FROM visit_requests WHERE id = ?').get(req.params.id);
  if (!vr) return res.status(404).json({ error: 'ไม่พบคำขอ' });
  if (vr.requester_id !== req.session.userId) return res.status(403).json({ error: 'ไม่มีสิทธิ์ยกเลิกคำขอนี้' });
  if (!CANCELLABLE_STATUSES.includes(vr.status)) return res.status(400).json({ error: 'ไม่สามารถยกเลิกคำขอที่ดำเนินการแล้วได้' });

  db.prepare(`UPDATE visit_requests SET status = 'cancelled' WHERE id = ?`).run(req.params.id);
  approvalEngine.closeWorkflow('visit', req.params.id);
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
  db.prepare('DELETE FROM visit_customer_signatures WHERE visit_request_id = ?').run(id);
  // แจ้งเตือนของ Visit ไม่มี prefix ส่วนของลา/OT ขึ้นต้น leave_/ot_ — ไม่ลบแจ้งเตือนของใบลา/OT ที่บังเอิญมี id เดียวกัน
  db.prepare(`DELETE FROM notifications WHERE related_id = ? AND type NOT LIKE 'leave\\_%' ESCAPE '\\' AND type NOT LIKE 'ot\\_%' ESCAPE '\\'`).run(id);
  db.prepare(`DELETE FROM request_workflows WHERE module = 'visit' AND request_id = ?`).run(id); // ลบ workflow snapshot ด้วย (CASCADE ลบ states/approvers ตามไปเอง)
  db.prepare('DELETE FROM visit_requests WHERE id = ?').run(id);
}

// ลบคำขอ Visit "ทั้งหมด" ในระบบทิ้งถาวร - สำหรับเคลียร์ข้อมูลทดสอบก่อนใช้งานจริง (เฉพาะ Admin)
// หมายเหตุ: ต้อง define ไว้ "ก่อน" router.delete('/:id') ด้านล่าง เพราะ Express จับเส้นทางตามลำดับที่ประกาศ
// ถ้า '/:id' อยู่ก่อน จะจับ '/bulk/all' เป็น id='bulk' แทนที่จะไปเส้นทางนี้
router.delete('/bulk/all', requireAuth, requireRole('Admin'), (req, res) => {
  if (!require('../utils/testDataCleanup').isEnabled()) return res.status(403).json({ error: 'ฟังก์ชันล้างข้อมูลทดสอบถูกปิดอยู่ (เปิดได้ที่หน้าตั้งค่าการลบข้อมูลอัตโนมัติ)' });
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

// Admin รีเซ็ตสายอนุมัติของคำขอที่ยังรออยู่ ให้ใช้รายชื่อผู้อนุมัติ "ล่าสุด" ตาม Template (เช่น เพิ่มผู้อนุมัติใน Template หลังจากคำขอถูกส่งไปแล้ว)
// ทำได้เฉพาะใบที่ยังไม่มีใครตัดสินใจ — ถ้ามีคนอนุมัติไปแล้วบางส่วน ให้ใช้ "ส่งกลับแก้ไข" แล้วให้ผู้ขอส่งใหม่
router.post('/:id/resync-workflow', requireAuth, requireRole('Admin'), (req, res) => {
  const vr = db.prepare('SELECT * FROM visit_requests WHERE id = ?').get(req.params.id);
  if (!vr) return res.status(404).json({ error: 'ไม่พบคำขอ' });
  if (vr.status !== 'pending') return res.status(400).json({ error: 'รีเซ็ตสายอนุมัติได้เฉพาะคำขอที่รออนุมัติอยู่' });
  try {
    db.transaction(() => {
      approvalEngine.resyncWorkflow('visit', vr.id, vr.requester_id);
      db.prepare(`INSERT INTO approval_history (visit_request_id, action_by, action, channel) VALUES (?, ?, 'รีเซ็ตสายอนุมัติตามรายชื่อผู้อนุมัติล่าสุด', 'web')`).run(vr.id, req.session.userId);
      logAction(req.session.userId, 'resync_workflow', `รีเซ็ตสายอนุมัติคำขอ Visit #${vr.code}`);
    })();
  } catch (err) {
    if (err instanceof approvalEngine.ApprovalError) return res.status(400).json({ error: err.message });
    throw err;
  }
  const requester = db.prepare('SELECT full_name, department FROM users WHERE id = ?').get(vr.requester_id);
  notifyRequestSubmitted(vr.id, requester, true); // แจ้งผู้อนุมัติชุดใหม่ (ไม่แจ้ง Admin ซ้ำ)
  res.json({ ok: true, waiting_for: approvalEngine.currentApproverNames('visit', vr.id) });
});

// อนุญาตทั้ง Approver/Admin โดยตำแหน่ง และคนที่ Admin ตั้งเป็นผู้อนุมัติผ่าน Template (ไม่ว่า role จะเป็นอะไร)
// การตรวจว่าเป็นผู้อนุมัติของ "คำขอนี้ใน state ปัจจุบัน" จริงหรือไม่ ทำอีกชั้นใน approvalEngine.decide() อยู่แล้ว
function requireApproverOrAdmin(req, res, next) {
  if (!['Approver', 'Admin'].includes(req.session.role) && !approvalEngine.hasEverBeenApprover(req.session.userId)) {
    return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้' });
  }
  next();
}

// ส่งกลับให้ผู้ขอแก้ไข (revision) แทนที่จะ reject จบเลย - ผู้ขอแก้ไขแล้ว resubmit (ผ่าน /:id/submit) วนกลับไปเริ่มที่ State แรกใหม่
router.post('/:id/request-revision', requireAuth, requireApproverOrAdmin, (req, res) => {
  const note = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 1000) : '';
  if (!note) return res.status(400).json({ error: 'กรุณาระบุเหตุผล/สิ่งที่ต้องแก้ไข' });
  decide(req, res, 'revision', 'ส่งกลับแก้ไข', note);
});

// APPROVE
router.post('/:id/approve', requireAuth, requireApproverOrAdmin, (req, res) => {
  decide(req, res, 'approve', 'อนุมัติ', typeof req.body.note === 'string' ? req.body.note.slice(0, 1000) : '');
});

// REJECT
router.post('/:id/reject', requireAuth, requireApproverOrAdmin, (req, res) => {
  decide(req, res, 'reject', 'ไม่อนุมัติ', typeof req.body.note === 'string' ? req.body.note.slice(0, 1000) : '');
});

function decide(req, res, action, actionLabel, note) {
  const vr = db.prepare('SELECT * FROM visit_requests WHERE id = ?').get(req.params.id);
  if (!vr) return res.status(404).json({ error: 'ไม่พบคำขอ' });
  if (vr.status !== 'pending') return res.status(400).json({ error: 'คำขอนี้ถูกดำเนินการไปแล้ว' });

  const wfBefore = approvalEngine.getWorkflow('visit', vr.id);
  const stateName = wfBefore && wfBefore.states[wfBefore.currentStateIndex] ? wfBefore.states[wfBefore.currentStateIndex].name : '';
  let result;
  try {
    // workflow + ประวัติ + สถานะคำขอ + แจ้งเตือนในระบบ อยู่ใน transaction เดียว: สำเร็จครบหรือย้อนกลับทั้งหมด
    result = db.transaction(() => {
      const r = approvalEngine.decide('visit', vr.id, req.session.userId, action, note, vr.requester_id);
      db.prepare(`INSERT INTO approval_history (visit_request_id, action_by, action, note, channel) VALUES (?, ?, ?, ?, 'web')`)
        .run(req.params.id, req.session.userId, `${actionLabel}${stateName ? ` (${stateName})` : ''}${vr.requester_id === req.session.userId ? ' · โดยผู้ขอเอง' : ''}`, note || '');
      logAction(req.session.userId, `visit_${action}`, `${actionLabel}คำขอ #${vr.code}`);

      if (r.finalStatus) {
        // workflow จบแล้ว (approved / rejected / revision) - sync กลับไปที่ visit_requests.status
        db.prepare(`
          UPDATE visit_requests SET status = ?, approver_id = ?, approved_at = datetime('now'), approval_note = ? WHERE id = ?
        `).run(r.finalStatus, req.session.userId, note || '', req.params.id);

        const message = r.finalStatus === 'approved'
          ? `คำขอออกนอกสถานที่ของคุณ #${vr.code} ได้รับการอนุมัติแล้ว`
          : r.finalStatus === 'revision'
            ? `คำขอออกนอกสถานที่ของคุณ #${vr.code} ถูกส่งกลับให้แก้ไข`
            : `คำขอออกนอกสถานที่ของคุณ #${vr.code} ไม่ได้รับการอนุมัติ`;
        db.prepare(`INSERT INTO notifications (user_id, type, message, related_id) VALUES (?, ?, ?, ?)`)
          .run(vr.requester_id, r.finalStatus === 'revision' ? 'revision' : r.finalStatus, message, vr.id);
        if (r.finalStatus === 'approved') {
          // ผู้ขอเลือกระดับลูกค้าใหม่ในฟอร์ม -> อัปเดตระดับของลูกค้ารายนั้นเมื่ออนุมัติแล้ว
          const lv = applyVisitLevelToCustomer(vr, req.session.userId);
          if (lv) {
            db.prepare(`INSERT INTO approval_history (visit_request_id, action_by, action, note, channel) VALUES (?, ?, ?, ?, 'web')`)
              .run(req.params.id, req.session.userId, 'อัปเดตระดับลูกค้า', `${lv.from || '(ไม่ระบุ)'} → ${lv.to}`);
          }
        }
      }
      return r;
    })();
  } catch (err) {
    if (err instanceof approvalEngine.ApprovalError) return res.status(400).json({ error: err.message });
    throw err;
  }

  // อีเมล/แจ้งผู้อนุมัติคนถัดไป ทำหลัง commit แล้วเท่านั้น
  if (result.finalStatus) {
    if (result.finalStatus === 'revision') {
      sendRevisionResultEmail(vr, req.session.userId, note);
    } else {
      sendDecisionResultEmail({ ...vr, status: result.finalStatus }, req.session.userId, result.finalStatus, note);
    }
  } else if (result.advanced) {
    // ผ่าน state นี้แล้ว ไปรอ state ถัดไป - แจ้งเตือนผู้อนุมัติ state ถัดไปว่าถึงคิวแล้ว
    const requester = db.prepare('SELECT full_name, department FROM users WHERE id = ?').get(vr.requester_id);
    notifyRequestSubmitted(vr.id, requester, true);
  }
  // result.finalStatus === null && !advanced -> ยังรอคนอื่นใน state เดียวกัน (โหมด ALL) ไม่ต้องแจ้งอะไรเพิ่ม

  res.json({ ok: true });
}

// ส่งอีเมลแจ้งผลอนุมัติ/ไม่อนุมัติกลับไปยังผู้ขอ
function sendDecisionResultEmail(vr, approverId, status, note) {
  const requester = db.prepare('SELECT full_name, email, email_notify FROM users WHERE id = ?').get(vr.requester_id);
  const approver = db.prepare('SELECT full_name FROM users WHERE id = ?').get(approverId);
  if (!requester || !requester.email || !requester.email_notify) return;
  sendDecisionEmail({
    to: requester.email, requesterName: requester.full_name, vr, status,
    approverName: approver ? approver.full_name : '-', note, showDocCode: getShowDocCode()
  }).catch(err => console.error('sendDecisionEmail error:', err.message));
}

// ส่งอีเมลแจ้งผู้ขอ: ถูกส่งกลับให้แก้ไข (revision)
function sendRevisionResultEmail(vr, approverId, note) {
  const requester = db.prepare('SELECT full_name, email, email_notify FROM users WHERE id = ?').get(vr.requester_id);
  const approver = db.prepare('SELECT full_name FROM users WHERE id = ?').get(approverId);
  if (!requester || !requester.email || !requester.email_notify) return;
  sendRevisionEmail({
    to: requester.email, requesterName: requester.full_name, vr, approverName: approver ? approver.full_name : '-', note,
    showDocCode: getShowDocCode()
  }).catch(err => console.error('sendRevisionEmail error:', err.message));
}

router.notifySubmitted = notifyRequestSubmitted;
module.exports = router;
