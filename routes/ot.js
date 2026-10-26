// routes/ot.js - ระบบขอทำงานล่วงเวลา (OT Management)
const express = require('express');
const db = require('../db/database');
const { requireAuth, requireRole } = require('./middleware');
const { sendMail, escapeHtml } = require('../utils/mailer');
const { toThaiDate } = require('../utils/dateFormat');
const { logAction } = require('../utils/systemLog');
const approvalEngine = require('../utils/approvalEngine');
const { canViewAll } = require('../utils/viewScope');

const checks = require('../utils/inputChecks');
const router = express.Router();

// เช็คว่าผู้ใช้นี้มี Template อนุมัติของโมดูล "ot" ที่เปิดใช้งานอยู่ (is_active=1) และเลือกเขาไว้เป็น Requester จริงหรือไม่
// เงื่อนไข: ต้องมี Template ที่ active + มีเขาอยู่ใน Requester + Template นั้นต้องมีอย่างน้อย 1 State ที่มีผู้อนุมัติจริง (ไม่งั้นถือว่ายังตั้งค่าไม่ครบ ไม่นับว่ามีสิทธิ์)
function isEligibleOTRequester(userId) {
  const tpl = db.prepare(`
    SELECT t.id FROM approval_templates t
    JOIN template_requesters tr ON tr.template_id = t.id
    WHERE t.module = 'ot' AND t.is_active = 1 AND tr.user_id = ?
    LIMIT 1
  `).get(userId);
  if (!tpl) return false;
  const stateCount = db.prepare(`
    SELECT COUNT(*) AS c FROM template_states ts
    WHERE ts.template_id = ? AND EXISTS (SELECT 1 FROM template_state_approvers a WHERE a.state_id = ts.id)
  `).get(tpl.id).c;
  return stateCount > 0;
}
const NOT_ELIGIBLE_MSG = 'คุณยังไม่มีสิทธิ์ส่งคำขอ OT กรุณาติดต่อผู้ดูแลระบบเพื่อเพิ่มชื่อคุณในรายชื่อผู้มีสิทธิ์ (Requester) ของ Template อนุมัติก่อน';
// ไม่รวม 'pending' เพราะคำขอที่กำลังอยู่ระหว่างอนุมัติ (อาจผ่านบาง State ไปแล้วในกรณี multi-stage)
// ห้ามแก้ไขข้อมูลตรงๆ โดยไม่ reset workflow — ถ้าจะแก้ ผู้ขอต้องรอถูก "ส่งกลับแก้ไข" (revision) ก่อน
// ซึ่งตอน resubmit จะ reset workflow กลับไป State แรกให้เองอยู่แล้ว (เหมือน leave.js)
const EDITABLE_STATUSES = ['draft', 'revision'];
// ยกเลิกคำขอ (cancel) เป็นคนละกรณีกับแก้ไขข้อมูล - อนุญาตให้ยกเลิกได้แม้อยู่ระหว่างอนุมัติ (pending)
const CANCELLABLE_STATUSES = ['draft', 'pending', 'revision'];

const OT_TYPES = ['Project', 'Service', 'Visit', 'Site Survey', 'Internal'];
const MAX_REF_LEN = 50; // Project No. / Job No.

function toMinutes(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h > 23 || mi > 59 ? null : h * 60 + mi;
}

// คำนวณชั่วโมง OT จากเวลาเริ่ม-สิ้นสุดที่ server เสมอ (ไม่เชื่อค่าที่ client ส่งมา) — คืน 0 ถ้าเวลาไม่ครบหรือสิ้นสุดไม่มากกว่าเริ่ม
function hoursBetween(timeFrom, timeTo) {
  const from = toMinutes(timeFrom), to = toMinutes(timeTo);
  if (from === null || to === null || to <= from) return 0;
  return Math.round(((to - from) / 60) * 100) / 100;
}

// ตรวจข้อมูลคำขอ OT — คืนข้อความ error ภาษาไทย หรือ null ถ้าผ่าน (ใช้ร่วมกันทั้งสร้าง/แก้ไข/ส่ง/ส่งใหม่)
// isDraft = true: ฉบับร่างไม่บังคับกรอกครบ แต่ค่าที่กรอกมาแล้วต้องถูกต้อง
function validateOT(f, isDraft) {
  const otType = String(f.ot_type || '').trim();
  if (otType && !OT_TYPES.includes(otType)) return 'OT Type ไม่ถูกต้อง';
  if (f.day_type && !['workday', 'holiday'].includes(f.day_type)) return 'ประเภทวัน (วันทำงาน/วันหยุด) ไม่ถูกต้อง';
  for (const [key, label] of [['project_no', 'Project No.'], ['job_no', 'Job No.']]) {
    if (String(f[key] || '').trim().length > MAX_REF_LEN) return `${label} ยาวเกินไป (ไม่เกิน ${MAX_REF_LEN} ตัวอักษร)`;
  }
  if (f.customer_id !== undefined && f.customer_id !== null && f.customer_id !== '') {
    const cid = Number(f.customer_id);
    if (!Number.isInteger(cid) || !db.prepare('SELECT 1 FROM customers WHERE id = ?').get(cid)) return 'ไม่พบข้อมูลลูกค้าที่เลือก กรุณาเลือกลูกค้าใหม่จากรายการ';
  }
  if (f.ot_date) { const e = checks.dateError(f.ot_date, 'วันที่ทำ OT'); if (e) return e; }
  for (const [k, max, label] of [['location', 200, 'สถานที่'], ['work_detail', 2000, 'รายละเอียดงาน'], ['reason', 1000, 'เหตุผล'], ['notes', 1000, 'หมายเหตุ']]) {
    const e = checks.tooLong(f[k], max, label); if (e) return e;
  }
  const from = toMinutes(f.time_from), to = toMinutes(f.time_to);
  if ((f.time_from && from === null) || (f.time_to && to === null)) return 'รูปแบบเวลาไม่ถูกต้อง';

  if (!isDraft) {
    if (!f.ot_date) return 'กรุณาระบุวันที่ทำ OT';
    if (!otType) return 'กรุณาเลือก OT Type';
    if (!f.location || !String(f.location).trim()) return 'กรุณาระบุสถานที่ปฏิบัติงาน';
    if (!f.time_from || !f.time_to) return 'กรุณาระบุเวลาเริ่มต้นและสิ้นสุด';
    if (!f.work_detail || !String(f.work_detail).trim()) return 'กรุณาระบุรายละเอียดงานที่ทำ';
  }
  if (from !== null && to !== null && from >= to) return 'เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น กรุณาตรวจสอบเวลาอีกครั้ง';
  return null;
}
// ค่าเริ่มต้นของประเภทวันตามปฏิทิน: เสาร์-อาทิตย์ = วันหยุด (ไม่รวมนักขัตฤกษ์) — ผู้ขอเปลี่ยนเองได้
function defaultDayType(isoDate) {
  const d = new Date(`${String(isoDate || '').slice(0, 10)}T00:00:00Z`);
  if (isNaN(d)) return null;
  const wd = d.getUTCDay();
  return wd === 0 || wd === 6 ? 'holiday' : 'workday';
}
const FILL_HINT = ' — กรุณากดแก้ไขคำขอเพื่อกรอกข้อมูลให้ครบก่อนส่ง';

// แปลงค่าจากฟอร์มเป็นค่าที่เก็บลงฐานข้อมูล (ตัดช่องว่าง, ช่องว่างเปล่า = NULL)
function otFields(b) {
  const blank = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());
  return {
    ot_type: blank(b.ot_type),
    day_type: blank(b.day_type) || defaultDayType(b.ot_date),
    customer_id: blank(b.customer_id) === null ? null : Number(b.customer_id),
    project_no: blank(b.project_no),
    job_no: blank(b.job_no)
  };
}

function generateCode() {
  const year = new Date().getFullYear();
  const prefix = `OT-${year}-`;
  const row = db.prepare(`
    SELECT MAX(CAST(SUBSTR(code, LENGTH(?) + 1) AS INTEGER)) AS maxSeq
    FROM ot_requests WHERE code LIKE ?
  `).get(prefix, `${prefix}%`);
  const nextSeq = (row.maxSeq || 0) + 1;
  return `${prefix}${nextSeq.toString().padStart(5, '0')}`;
}

router.get('/', requireAuth, (req, res) => {
  const { scope = 'mine', status } = req.query;
  if (scope === 'mine') {
    const rows = db.prepare(`
      SELECT o.*, u.full_name AS requester_name, u.department AS requester_department
      FROM ot_requests o JOIN users u ON u.id = o.requester_id
      WHERE o.requester_id = ? ORDER BY o.created_at DESC
    `).all(req.session.userId);
    return res.json({ requests: rows });
  }
  if (scope === 'pending') {
    if (!['Approver', 'Admin'].includes(req.session.role) && !approvalEngine.hasEverBeenApprover(req.session.userId)) {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้' });
    }
    const wantedStatus = status || 'pending';
    let rows;
    // ผู้มีสิทธิ์อนุมัติ (ผ่านด่านด้านบนแล้ว) เห็นคำขอของทุกคนตามสถานะ เพื่อให้ตรงกับตัวเลขบน Dashboard
    // ฉบับร่างของคนอื่นยังเป็นส่วนตัว (เฉพาะ Admin ที่เห็นได้เหมือนเดิม)
    if (wantedStatus === 'draft' && req.session.role !== 'Admin') return res.json({ requests: [] });
    rows = db.prepare(`
      SELECT o.*, u.full_name AS requester_name, u.department AS requester_department
      FROM ot_requests o JOIN users u ON u.id = o.requester_id
      WHERE o.status = ? ORDER BY o.created_at DESC
    `).all(wantedStatus);
    for (const r of rows) {
      if (r.status !== 'pending') continue;
      r.can_act = approvalEngine.canActOn('ot', r.id, req.session.userId);
      r.waiting_for = approvalEngine.currentApproverNames('ot', r.id).join(', ');
      r.can_resync = req.session.role === 'Admin' && approvalEngine.canResync('ot', r.id);
    }
    return res.json({ requests: rows });
  }
  res.status(400).json({ error: 'scope ไม่ถูกต้อง' });
});

// ข้อมูลสำหรับหน้าปฏิทิน: เฉพาะ OT ที่ "รออนุมัติ" หรือ "อนุมัติแล้ว" — ผู้มีสิทธิ์อนุมัติ/Admin เห็นของทุกคน, คนอื่นเห็นของตัวเอง
// ต้องวางก่อน '/:id' ไม่งั้น "calendar" จะถูกตีเป็น id
router.get('/calendar/events', requireAuth, (req, res) => {
  const base = `
    SELECT o.id, o.code, o.requester_id, o.ot_date, o.time_from, o.time_to, o.hours, o.location, o.work_detail,
           o.reason, o.notes, o.ot_type, o.day_type, o.status,
           u.full_name AS requester_name, u.department AS requester_department,
           a.full_name AS approver_name
    FROM ot_requests o JOIN users u ON u.id = o.requester_id
    LEFT JOIN users a ON a.id = o.approver_id
    WHERE o.status IN ('pending', 'approved')`;
  const rows = db.prepare(`${base} ORDER BY o.ot_date ASC, o.time_from ASC`).all();
  const full = canViewAll(req.session);
  for (const r of rows) {
    if (!full && r.requester_id !== req.session.userId) { r.notes = null; r.reason = null; }
    if (r.status === 'pending') r.waiting_for = approvalEngine.currentApproverNames('ot', r.id).join(', ');
  }
  res.json({ requests: rows });
});

// GET /api/ot-requests/my-status-counts -> จำนวนคำขอของฉันแยกตามขั้นตอน (ตัวเลขที่เมนูข้างซ้าย) — ต้องอยู่ก่อน '/:id'
router.get('/my-status-counts', requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT status AS st, COUNT(*) AS c FROM ot_requests WHERE requester_id = ? GROUP BY status`).all(req.session.userId);
  const counts = { draft: 0, pending: 0, revision: 0, approved: 0, rejected: 0 };
  rows.forEach(r => { if (r.st in counts) counts[r.st] = r.c; });
  res.json({ counts });
});

router.get('/:id', requireAuth, (req, res) => {
  const ot = db.prepare(`
    SELECT o.*, u.full_name AS requester_name, u.position AS requester_position, u.department AS requester_department,
           a.full_name AS approver_name,
           c.code AS customer_code, c.name AS customer_name, c.company AS customer_company
    FROM ot_requests o
    JOIN users u ON u.id = o.requester_id
    LEFT JOIN users a ON a.id = o.approver_id
    LEFT JOIN customers c ON c.id = o.customer_id
    WHERE o.id = ?
  `).get(req.params.id);
  if (!ot) return res.status(404).json({ error: 'ไม่พบคำขอ OT' });
  const isRequester = ot.requester_id === req.session.userId;
  const isAdmin = req.session.role === 'Admin';
  const isParticipant = approvalEngine.isWorkflowParticipant('ot', ot.id, req.session.userId);
  const isViewer = canViewAll(req.session) && ot.status !== 'draft'; // ผู้มีสิทธิ์อนุมัติดูได้ทุกคำขอ (ยกเว้นฉบับร่างของคนอื่น)
  if (!isRequester && !isAdmin && !isParticipant && !isViewer) {
    return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ดูคำขอนี้' });
  }
  const history = db.prepare(`
    SELECT h.*, u.full_name AS actor_name FROM ot_history h
    LEFT JOIN users u ON u.id = h.action_by
    WHERE h.ot_request_id = ? ORDER BY h.created_at ASC
  `).all(req.params.id);
  const workflow = approvalEngine.getWorkflow('ot', ot.id);
  res.json({
    request: ot, history, workflow,
    can_act: ot.status === 'pending' && approvalEngine.canActOn('ot', ot.id, req.session.userId),
    can_resync: isAdmin && ot.status === 'pending' && approvalEngine.canResync('ot', ot.id)
  });
});

router.post('/', requireAuth, (req, res) => {
  const { ot_date, time_from, time_to, location, work_detail, reason, notes, save_as } = req.body;
  const isDraft = save_as === 'draft';

  const invalid = validateOT(req.body, isDraft);
  if (invalid) return res.status(400).json({ error: invalid });
  const x = otFields(req.body);

  if (!isDraft) {
    const ov = checks.otOverlapError(db, req.session.userId, req.body);
    if (ov) return res.status(400).json({ error: ov });
    // ยังไม่มี Template อนุมัติไหนเซ็ตชื่อผู้ใช้นี้ไว้เป็น Requester เลย -> บล็อกตอนส่งคำขอ (ฟอร์มกรอก/บันทึกร่างได้ปกติ แต่ส่งจริงไม่ได้)
    if (!isEligibleOTRequester(req.session.userId)) {
      return res.status(403).json({ error: NOT_ELIGIBLE_MSG });
    }
    {
      const noApprover = approvalEngine.checkCanSubmit('ot', req.session.userId);
      if (noApprover) return res.status(400).json({ error: noApprover });
    }
  }

  const hours = (time_from && time_to) ? hoursBetween(time_from, time_to) : 0;
  const status = isDraft ? 'draft' : 'pending';

  let code, info;
  const insertStmt = db.prepare(`
    INSERT INTO ot_requests (code, requester_id, ot_date, time_from, time_to, hours, location, work_detail, reason, notes, status,
                             ot_type, customer_id, project_no, job_no, day_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (let attempt = 0; attempt < 5; attempt++) {
    code = generateCode();
    try {
      info = insertStmt.run(code, req.session.userId, ot_date || '', time_from || '', time_to || '', hours,
        location || '', work_detail || '', reason || '', notes || '', status,
        x.ot_type, x.customer_id, x.project_no, x.job_no, x.day_type);
      break;
    } catch (err) {
      const isDup = err.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed: ot_requests\.code/.test(err.message);
      if (isDup && attempt < 4) continue;
      throw err;
    }
  }

  const otId = info.lastInsertRowid;
  if (isDraft) {
    db.prepare(`INSERT INTO ot_history (ot_request_id, action_by, action) VALUES (?, ?, 'บันทึกฉบับร่าง')`).run(otId, req.session.userId);
    logAction(req.session.userId, 'create_ot_draft', `บันทึกฉบับร่างคำขอ OT #${code}`);
    return res.status(201).json({ id: otId, code, status });
  }

  db.prepare(`INSERT INTO ot_history (ot_request_id, action_by, action) VALUES (?, ?, 'ส่งคำขอ')`).run(otId, req.session.userId);
  logAction(req.session.userId, 'submit_ot_request', `ส่งคำขอ OT #${code}`);
  approvalEngine.createWorkflow('ot', otId, req.session.userId);
  notifyOTSubmitted(otId);
  res.status(201).json({ id: otId, code, status });
});

router.put('/:id', requireAuth, (req, res) => {
  const ot = db.prepare('SELECT * FROM ot_requests WHERE id = ?').get(req.params.id);
  if (!ot) return res.status(404).json({ error: 'ไม่พบคำขอ OT' });
  if (ot.requester_id !== req.session.userId) return res.status(403).json({ error: 'คุณไม่มีสิทธิ์แก้ไขคำขอนี้' });
  if (!EDITABLE_STATUSES.includes(ot.status)) return res.status(400).json({ error: 'ไม่สามารถแก้ไขคำขอนี้ได้แล้ว' });

  const { ot_date, time_from, time_to, location, work_detail, reason, notes } = req.body;
  // บันทึกฉบับร่างไม่บังคับกรอกครบ; แก้ไขเพื่อส่ง (รวมกรณีส่งกลับแก้ไข) ต้องครบเหมือนตอนสร้าง
  const invalid = validateOT(req.body, req.body.save_as === 'draft');
  if (invalid) return res.status(400).json({ error: invalid });
  if (req.body.save_as !== 'draft') { const ov = checks.otOverlapError(db, req.session.userId, req.body, req.params.id); if (ov) return res.status(400).json({ error: ov }); }
  const x = otFields(req.body);
  const hours = hoursBetween(time_from, time_to);
  db.prepare(`
    UPDATE ot_requests SET ot_date = ?, time_from = ?, time_to = ?, hours = ?, location = ?, work_detail = ?, reason = ?, notes = ?,
                           ot_type = ?, customer_id = ?, project_no = ?, job_no = ?, day_type = ?
    WHERE id = ?
  `).run(ot_date || '', time_from || '', time_to || '', hours, location || '', work_detail || '', reason || '', notes || '',
    x.ot_type, x.customer_id, x.project_no, x.job_no, x.day_type, req.params.id);
  res.json({ ok: true });
});

router.post('/:id/submit', requireAuth, (req, res) => {
  const ot = db.prepare('SELECT * FROM ot_requests WHERE id = ?').get(req.params.id);
  if (!ot) return res.status(404).json({ error: 'ไม่พบคำขอ OT' });
  if (ot.requester_id !== req.session.userId) return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ส่งคำขอนี้' });
  if (ot.status !== 'draft') return res.status(400).json({ error: 'คำขอนี้ถูกส่งไปแล้ว' });
  {
    // ฉบับร่างเก่าที่สร้างก่อนมี field ใหม่ (OT Type ฯลฯ) ต้องกรอกให้ครบก่อนจึงส่งได้
    const invalid = validateOT(ot, false);
    if (invalid) return res.status(400).json({ error: invalid + FILL_HINT });
    const ov = checks.otOverlapError(db, ot.requester_id, ot, ot.id);
    if (ov) return res.status(400).json({ error: ov });
  }
  if (!isEligibleOTRequester(req.session.userId)) {
    return res.status(403).json({ error: NOT_ELIGIBLE_MSG });
  }
  {
    const noApprover = approvalEngine.checkCanSubmit('ot', req.session.userId);
    if (noApprover) return res.status(400).json({ error: noApprover });
  }
  db.prepare(`UPDATE ot_requests SET status = 'pending' WHERE id = ?`).run(req.params.id);
  db.prepare(`INSERT INTO ot_history (ot_request_id, action_by, action) VALUES (?, ?, 'ส่งคำขอ')`).run(req.params.id, req.session.userId);
  logAction(req.session.userId, 'submit_ot_request', `ส่งคำขอ OT #${ot.code}`);
  approvalEngine.createWorkflow('ot', ot.id, req.session.userId);
  notifyOTSubmitted(ot.id);
  res.json({ ok: true });
});

// ส่งใหม่หลังถูกส่งกลับให้แก้ไข (revision) - แก้ไขข้อมูลผ่าน PUT /:id ก่อนแล้วค่อยเรียกอันนี้ เพื่อรีเซ็ต workflow กลับไปเริ่มที่ State แรก
router.post('/:id/resubmit', requireAuth, (req, res) => {
  const ot = db.prepare('SELECT * FROM ot_requests WHERE id = ?').get(req.params.id);
  if (!ot) return res.status(404).json({ error: 'ไม่พบคำขอ OT' });
  if (ot.requester_id !== req.session.userId) return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ส่งคำขอนี้' });
  if (ot.status !== 'revision') return res.status(400).json({ error: 'คำขอนี้ไม่ได้อยู่ในสถานะรอแก้ไข' });
  {
    const invalid = validateOT(ot, false);
    if (invalid) return res.status(400).json({ error: invalid + FILL_HINT });
    const ov = checks.otOverlapError(db, ot.requester_id, ot, ot.id);
    if (ov) return res.status(400).json({ error: ov });
  }
  if (!isEligibleOTRequester(req.session.userId)) {
    return res.status(403).json({ error: NOT_ELIGIBLE_MSG });
  }
  {
    const noApprover = approvalEngine.checkCanSubmit('ot', req.session.userId);
    if (noApprover) return res.status(400).json({ error: noApprover });
  }
  db.prepare(`UPDATE ot_requests SET status = 'pending', approver_id = NULL, approved_at = NULL, approval_note = '' WHERE id = ?`).run(req.params.id);
  db.prepare(`INSERT INTO ot_history (ot_request_id, action_by, action) VALUES (?, ?, 'ส่งคำขอใหม่หลังแก้ไข')`).run(req.params.id, req.session.userId);
  logAction(req.session.userId, 'resubmit_ot_request', `ส่งคำขอ OT ใหม่หลังแก้ไข #${ot.code}`);
  approvalEngine.createWorkflow('ot', ot.id, req.session.userId); // เริ่ม workflow ใหม่จาก State แรกเสมอ (ดึง Template ล่าสุด ณ ตอนนี้)
  notifyOTSubmitted(ot.id);
  res.json({ ok: true });
});

router.post('/:id/cancel', requireAuth, (req, res) => {
  const ot = db.prepare('SELECT * FROM ot_requests WHERE id = ?').get(req.params.id);
  if (!ot) return res.status(404).json({ error: 'ไม่พบคำขอ OT' });
  if (ot.requester_id !== req.session.userId) return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ยกเลิกคำขอนี้' });
  if (!CANCELLABLE_STATUSES.includes(ot.status)) return res.status(400).json({ error: 'ไม่สามารถยกเลิกคำขอนี้ได้แล้ว' });
  db.prepare(`UPDATE ot_requests SET status = 'cancelled' WHERE id = ?`).run(req.params.id);
  approvalEngine.closeWorkflow('ot', req.params.id);
  db.prepare(`INSERT INTO ot_history (ot_request_id, action_by, action) VALUES (?, ?, 'ยกเลิก')`).run(req.params.id, req.session.userId);
  logAction(req.session.userId, 'cancel_ot_request', `ยกเลิกคำขอ OT #${ot.code}`);
  res.json({ ok: true });
});

// Admin รีเซ็ตสายอนุมัติของ OT ที่ยังรออยู่ ให้ใช้รายชื่อผู้อนุมัติ "ล่าสุด" ตาม Template (เฉพาะใบที่ยังไม่มีใครตัดสินใจ)
router.post('/:id/resync-workflow', requireAuth, requireRole('Admin'), (req, res) => {
  const ot = db.prepare('SELECT * FROM ot_requests WHERE id = ?').get(req.params.id);
  if (!ot) return res.status(404).json({ error: 'ไม่พบคำขอ OT' });
  if (ot.status !== 'pending') return res.status(400).json({ error: 'รีเซ็ตสายอนุมัติได้เฉพาะคำขอที่รออนุมัติอยู่' });
  try {
    db.transaction(() => {
      approvalEngine.resyncWorkflow('ot', ot.id, ot.requester_id);
      db.prepare(`INSERT INTO ot_history (ot_request_id, action_by, action) VALUES (?, ?, 'รีเซ็ตสายอนุมัติตามรายชื่อผู้อนุมัติล่าสุด')`).run(ot.id, req.session.userId);
      logAction(req.session.userId, 'resync_workflow', `รีเซ็ตสายอนุมัติคำขอ OT #${ot.code}`);
    })();
  } catch (err) {
    if (err instanceof approvalEngine.ApprovalError) return res.status(400).json({ error: err.message });
    throw err;
  }
  notifyOTSubmitted(ot.id, true); // แจ้งผู้อนุมัติชุดใหม่ (ไม่แจ้ง Admin ซ้ำ)
  res.json({ ok: true, waiting_for: approvalEngine.currentApproverNames('ot', ot.id) });
});

function requireApproverOrAdmin(req, res, next) {
  // อนุญาตทั้งหัวหน้า/Admin โดยตำแหน่ง และคนที่ Admin ตั้งเป็นผู้อนุมัติผ่าน Template (ไม่ว่า role จะเป็นอะไร)
  // การตรวจว่าเป็นผู้อนุมัติของ "คำขอนี้ใน state ปัจจุบัน" จริงหรือไม่ ทำอีกชั้นใน approvalEngine.decide() อยู่แล้ว
  if (!['Approver', 'Admin'].includes(req.session.role) && !approvalEngine.hasEverBeenApprover(req.session.userId)) {
    return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้' });
  }
  next();
}

router.post('/:id/approve', requireAuth, requireApproverOrAdmin, (req, res) => decide(req, res, 'approve', 'อนุมัติ'));
router.post('/:id/reject', requireAuth, requireApproverOrAdmin, (req, res) => decide(req, res, 'reject', 'ไม่อนุมัติ'));
// ส่งกลับให้ผู้ขอแก้ไข (revision) แทนที่จะ reject จบเลย - ผู้ขอแก้ไขแล้ว resubmit วนกลับไปเริ่มที่ State แรกใหม่
router.post('/:id/revision', requireAuth, requireApproverOrAdmin, (req, res) => decide(req, res, 'revision', 'ส่งกลับแก้ไข'));

function decide(req, res, action, actionLabel) {
  const ot = db.prepare('SELECT * FROM ot_requests WHERE id = ?').get(req.params.id);
  if (!ot) return res.status(404).json({ error: 'ไม่พบคำขอ OT' });
  if (ot.status !== 'pending') return res.status(400).json({ error: 'คำขอนี้ถูกดำเนินการไปแล้ว' });

  const { note } = req.body;
  const wfBefore = approvalEngine.getWorkflow('ot', ot.id);
  const stateName = wfBefore && wfBefore.states[wfBefore.currentStateIndex] ? wfBefore.states[wfBefore.currentStateIndex].name : '';
  let result;
  try {
    // workflow + ประวัติ + สถานะคำขอ อยู่ใน transaction เดียว: สำเร็จครบหรือย้อนกลับทั้งหมด
    result = db.transaction(() => {
      const r = approvalEngine.decide('ot', ot.id, req.session.userId, action, note, ot.requester_id);
      db.prepare(`INSERT INTO ot_history (ot_request_id, action_by, action, note) VALUES (?, ?, ?, ?)`)
        .run(req.params.id, req.session.userId, `${actionLabel}${stateName ? ` (${stateName})` : ''}${ot.requester_id === req.session.userId ? ' · โดยผู้ขอเอง' : ''}`, note || '');
      logAction(req.session.userId, `ot_${action}`, `${actionLabel}คำขอ OT #${ot.code}`);
      if (r.finalStatus) {
        // workflow จบแล้ว (approved / rejected / revision) - sync กลับไปที่ ot_requests.status
        db.prepare(`UPDATE ot_requests SET status = ?, approver_id = ?, approved_at = datetime('now'), approval_note = ? WHERE id = ?`)
          .run(r.finalStatus, req.session.userId, note || '', req.params.id);
      }
      return r;
    })();
  } catch (err) {
    if (err instanceof approvalEngine.ApprovalError) return res.status(400).json({ error: err.message });
    throw err;
  }

  // แจ้งเตือน/อีเมลทำหลัง commit แล้วเท่านั้น
  if (result.finalStatus) {
    notifyOTDecision(ot.id, result.finalStatus, req.session.userId, note);
  } else if (result.advanced) {
    // ผ่าน state นี้แล้ว ไปรอ state ถัดไป - แจ้งเตือนผู้อนุมัติ state ถัดไปว่าถึงคิวแล้ว
    notifyOTSubmitted(ot.id, true);
  }
  // result.finalStatus === null && !advanced -> ยังรอคนอื่นใน state เดียวกัน (โหมด ALL) ไม่ต้องแจ้งอะไรเพิ่ม

  res.json({ ok: true });
}

// isAdvance = true เมื่อเรียกตอน state เลื่อนไปคนถัดไป (ไม่ใช่ตอนส่งคำขอครั้งแรก) - แจ้งเฉพาะผู้อนุมัติของ state ปัจจุบัน ไม่ต้องแจ้ง Admin ซ้ำทุกรอบ
function notifyOTSubmitted(otId, isAdvance = false) {
  const ot = db.prepare('SELECT * FROM ot_requests WHERE id = ?').get(otId);
  const requester = db.prepare('SELECT full_name, department, email FROM users WHERE id = ?').get(ot.requester_id);
  const currentApproverIds = approvalEngine.getCurrentApproverIds('ot', otId);
  const admins = isAdvance ? [] : db.prepare(`SELECT id FROM users WHERE is_active = 1 AND role = 'Admin'`).all().map(r => r.id);
  const ids = Array.from(new Set([...currentApproverIds, ...admins]));
  if (!ids.length) return;
  const approvers = db.prepare(`SELECT id, full_name, email, email_notify FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  const msg = isAdvance
    ? `คำขอ OT ของ ${requester.full_name} วันที่ ${toThaiDate(ot.ot_date)} (${ot.hours} ชม.) ถึงคิวที่ต้องให้คุณอนุมัติแล้ว`
    : `มีคำขอ OT ใหม่จาก ${requester.full_name} วันที่ ${toThaiDate(ot.ot_date)} (${ot.hours} ชม.)`;
  const notifStmt = db.prepare(`INSERT INTO notifications (user_id, type, message, related_id) VALUES (?, 'ot_new_request', ?, ?)`);
  for (const a of approvers) {
    notifStmt.run(a.id, msg, otId);
    if (a.email && a.email_notify) {
      sendMail({
        to: a.email,
        subject: `[TRISAK] คำขอ OT ใหม่ #${ot.code}`,
        html: `<p>${escapeHtml(msg)}</p><p>รายละเอียดงาน: ${escapeHtml(ot.work_detail || '-')}</p><p><a href="${process.env.APP_BASE_URL || 'http://localhost:3000'}/approve-ot?id=${otId}">เปิดดูคำขอ</a></p>`
      }).catch(err => console.error('[ot] send mail error:', err.message));
    }
  }
}

function notifyOTDecision(otId, status, approverId, note) {
  const ot = db.prepare('SELECT * FROM ot_requests WHERE id = ?').get(otId);
  const requester = db.prepare('SELECT full_name, email, email_notify FROM users WHERE id = ?').get(ot.requester_id);
  const approver = db.prepare('SELECT full_name FROM users WHERE id = ?').get(approverId);
  const label = status === 'approved' ? 'อนุมัติ' : status === 'revision' ? 'ส่งกลับให้แก้ไข' : 'ไม่อนุมัติ';
  const msg = `คำขอ OT #${ot.code} ของคุณถูก${label}โดย ${approver ? approver.full_name : '-'}${note ? ' · ' + note : ''}`;
  const notifType = status === 'approved' ? 'ot_approved' : status === 'revision' ? 'ot_revision' : 'ot_rejected';
  db.prepare(`INSERT INTO notifications (user_id, type, message, related_id) VALUES (?, ?, ?, ?)`)
    .run(ot.requester_id, notifType, msg, otId);
  if (requester && requester.email && requester.email_notify) {
    sendMail({ to: requester.email, subject: `[TRISAK] คำขอ OT #${ot.code} ถูก${label}`, html: `<p>${escapeHtml(msg)}</p>` })
      .catch(err => console.error('[ot] send mail error:', err.message));
  }
}

// ===== สรุป OT รายเดือน (สำหรับ Dashboard/Report ในอนาคต) =====
router.get('/summary/me', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT strftime('%Y-%m', ot_date) AS ym, COUNT(*) AS cnt, SUM(hours) AS hours
    FROM ot_requests WHERE requester_id = ? AND status = 'approved' AND strftime('%Y', ot_date) = strftime('%Y', 'now')
    GROUP BY ym ORDER BY ym DESC
  `).all(req.session.userId);
  const totalHours = rows.reduce((s, r) => s + (r.hours || 0), 0);
  res.json({ by_month: rows, total_hours_this_year: totalHours });
});

router.notifySubmitted = notifyOTSubmitted;
module.exports = router;
