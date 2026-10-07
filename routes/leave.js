// routes/leave.js - ระบบลา (Leave Management)
const express = require('express');
const db = require('../db/database');
const { requireAuth, requireRole } = require('./middleware');
const { sendMail } = require('../utils/mailer');
const { toThaiDate } = require('../utils/dateFormat');
const { logAction } = require('../utils/systemLog');
const { approverIdsForDepartments } = require('../utils/userDepartments');
const { canEditProfile } = require('../utils/profilePermissions');
const approvalEngine = require('../utils/approvalEngine');
const { canViewAll } = require('../utils/viewScope');

const router = express.Router();

const LEAVE_TYPES = ['ลากิจ', 'ลาป่วย', 'ลาพักร้อน'];
const LEAVE_MODES = ['full_day', 'half_day_morning', 'half_day_afternoon', 'hours'];
// ไม่รวม 'pending' เพราะคำขอที่กำลังอยู่ระหว่างอนุมัติ (อาจผ่านบาง State ไปแล้วในกรณี multi-stage)
// ห้ามแก้ไขข้อมูลตรงๆ โดยไม่ reset workflow — ถ้าจะแก้ ผู้ขอต้องรอถูก "ส่งกลับแก้ไข" (revision) ก่อน
// ซึ่งตอน resubmit จะ reset workflow กลับไป State แรกให้เองอยู่แล้ว
const EDITABLE_STATUSES = ['draft', 'revision'];

function isValidLeaveType(t) { return LEAVE_TYPES.includes(t); }

// ตรวจโควต้าวันลาตอนส่งคำขอ (นับคำขอที่รออนุมัติอยู่แล้วเป็นวันที่ถูกจองไว้ด้วย กันยื่นหลายใบรวดเดียวเกินสิทธิ์)
// ปรับ true/false ตามนโยบาย: ลาป่วยตั้งเป็น false เพราะกฎหมายให้ลาป่วยได้เกินสิทธิ์ที่ได้ค่าจ้าง (ส่วนเกินเป็นลาไม่รับค่าจ้าง)
const QUOTA_RULES = {
  'ลาพักร้อน': { total: 'vacation_total', used: 'vacation_used', enforce: true },
  'ลากิจ':     { total: 'personal_total', used: 'personal_used', enforce: true },
  'ลาป่วย':    { total: 'sick_total',     used: 'sick_used',     enforce: false }
};
const fmtDays = (n) => (Math.round(n * 100) / 100).toString();
function quotaError(userId, leaveType, days, excludeRequestId) {
  const rule = QUOTA_RULES[leaveType];
  if (!rule || !rule.enforce || !(days > 0)) return null;
  const bal = ensureBalance(userId);
  const reserved = db.prepare(`SELECT COALESCE(SUM(duration_days), 0) AS d FROM leave_requests WHERE requester_id = ? AND leave_type = ? AND status = 'pending' AND id != ?`)
    .get(userId, leaveType, excludeRequestId || 0).d;
  const remaining = bal[rule.total] - bal[rule.used] - reserved;
  if (days > remaining + 1e-9) {
    return `สิทธิ์${leaveType}คงเหลือ ${fmtDays(Math.max(0, remaining))} วัน` +
      `${reserved > 0 ? ` (รวมที่รออนุมัติอยู่ ${fmtDays(reserved)} วันแล้ว)` : ''} ไม่พอสำหรับการลา ${fmtDays(days)} วัน กรุณาติดต่อผู้ดูแลระบบหากต้องการปรับสิทธิ์`;
  }
  return null;
}
function isValidLeaveMode(m) { return LEAVE_MODES.includes(m); }

// เช็คว่าผู้ใช้นี้มี Template อนุมัติของโมดูล "leave" ที่เปิดใช้งานอยู่ (is_active=1) และเลือกเขาไว้เป็น Requester จริงหรือไม่
// เขียนแยกไว้ในไฟล์นี้เอง (ไม่เรียกผ่าน approvalEngine.js) กันปัญหาไฟล์คนละเวอร์ชันกันแล้วฟังก์ชันหาย ทำให้ server พังตอน restart
// เงื่อนไข: ต้องมี Template ที่ active + มีเขาอยู่ใน Requester + Template นั้นต้องมีอย่างน้อย 1 State ที่มีผู้อนุมัติจริง (ไม่งั้นถือว่ายังตั้งค่าไม่ครบ ไม่นับว่ามีสิทธิ์)
function isEligibleLeaveRequester(userId) {
  const tpl = db.prepare(`
    SELECT t.id FROM approval_templates t
    JOIN template_requesters tr ON tr.template_id = t.id
    WHERE t.module = 'leave' AND t.is_active = 1 AND tr.user_id = ?
    LIMIT 1
  `).get(userId);
  if (!tpl) return false;
  const stateCount = db.prepare(`
    SELECT COUNT(*) AS c FROM template_states ts
    WHERE ts.template_id = ? AND EXISTS (SELECT 1 FROM template_state_approvers a WHERE a.state_id = ts.id)
  `).get(tpl.id).c;
  return stateCount > 0;
}
const NOT_ELIGIBLE_MSG = 'คุณยังไม่มีสิทธิ์ส่งคำขอลา กรุณาติดต่อผู้ดูแลระบบเพื่อเพิ่มชื่อคุณในรายชื่อผู้มีสิทธิ์ (Requester) ของ Template อนุมัติก่อน';

// นับจำนวนวันปฏิทินระหว่าง date_from - date_to (รวมทั้งสองวัน) แบบง่าย ไม่ตัดวันหยุด/เสาร์-อาทิตย์
function countCalendarDays(dateFrom, dateTo) {
  const a = new Date(dateFrom), b = new Date(dateTo);
  const diff = Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 0 ? diff : 1;
}

function hoursBetween(timeFrom, timeTo) {
  const [fh, fm] = (timeFrom || '0:0').split(':').map(Number);
  const [th, tm] = (timeTo || '0:0').split(':').map(Number);
  const mins = (th * 60 + tm) - (fh * 60 + fm);
  return mins > 0 ? Math.round((mins / 60) * 100) / 100 : 0;
}

function generateCode() {
  const year = new Date().getFullYear();
  const prefix = `LV-${year}-`;
  const row = db.prepare(`
    SELECT MAX(CAST(SUBSTR(code, LENGTH(?) + 1) AS INTEGER)) AS maxSeq
    FROM leave_requests WHERE code LIKE ?
  `).get(prefix, `${prefix}%`);
  const nextSeq = (row.maxSeq || 0) + 1;
  return `${prefix}${nextSeq.toString().padStart(5, '0')}`;
}

function ensureBalance(userId) {
  const existing = db.prepare('SELECT * FROM leave_balances WHERE user_id = ?').get(userId);
  if (existing) return existing;
  db.prepare('INSERT INTO leave_balances (user_id) VALUES (?)').run(userId);
  return db.prepare('SELECT * FROM leave_balances WHERE user_id = ?').get(userId);
}

// คำนวณ duration_days / duration_hours จากโหมดที่เลือก
function computeDuration(body) {
  const { leave_mode, date_from, date_to, time_from, time_to } = body;
  if (leave_mode === 'full_day') {
    return { duration_days: countCalendarDays(date_from, date_to || date_from), duration_hours: 0, date_to: date_to || date_from, time_from: '', time_to: '' };
  }
  if (leave_mode === 'half_day_morning' || leave_mode === 'half_day_afternoon') {
    return { duration_days: 0.5, duration_hours: 0, date_to: date_from, time_from: '', time_to: '' };
  }
  // hours (รวมกรณีลาเป็นนาที เช่น 30 นาที = 0.5 ชม. ให้กรอกเป็นทศนิยมในช่วงเวลา)
  return { duration_days: 0, duration_hours: hoursBetween(time_from, time_to), date_to: date_from, time_from, time_to };
}

// รายการคำขอลา: scope=mine (ของฉัน) | scope=pending (รออนุมัติ - Approver/Admin)
router.get('/', requireAuth, (req, res) => {
  const { scope = 'mine', status } = req.query;
  if (scope === 'mine') {
    const rows = db.prepare(`
      SELECT lr.*, u.full_name AS requester_name, u.department AS requester_department
      FROM leave_requests lr JOIN users u ON u.id = lr.requester_id
      WHERE lr.requester_id = ? ORDER BY lr.created_at DESC
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
      SELECT lr.*, u.full_name AS requester_name, u.department AS requester_department
      FROM leave_requests lr JOIN users u ON u.id = lr.requester_id
      WHERE lr.status = ? ORDER BY lr.created_at DESC
    `).all(wantedStatus);
    return res.json({ requests: rows });
  }
  res.status(400).json({ error: 'scope ไม่ถูกต้อง' });
});

// ข้อมูลการลาสำหรับหน้าปฏิทิน: แสดงเฉพาะคำขอที่ยัง "รออนุมัติ" หรือ "อนุมัติแล้ว" (ไม่รวมฉบับร่าง/ส่งกลับแก้ไข/ไม่อนุมัติ/ยกเลิก)
// สิทธิ์การมองเห็น: Admin เห็นทุกคน | คนอื่นเห็นของตัวเอง + คำขอที่ตัวเองอยู่ในสายอนุมัติ (ใช้ workflow engine เหมือนหน้าอนุมัติ)
// ต้องวางก่อน '/:id' ไม่งั้น "calendar" จะถูกตีเป็น id
router.get('/calendar/events', requireAuth, (req, res) => {
  const { userId, role } = req.session;
  const baseSql = `
    SELECT lr.id, lr.code, lr.requester_id, lr.leave_type, lr.leave_mode, lr.date_from, lr.date_to,
           lr.time_from, lr.time_to, lr.duration_days, lr.duration_hours, lr.reason, lr.status,
           u.full_name AS requester_name, u.department AS requester_department
    FROM leave_requests lr JOIN users u ON u.id = lr.requester_id
    WHERE lr.status IN ('pending', 'approved')`;
  let rows;
  if (role === 'Admin') {
    rows = db.prepare(`${baseSql} ORDER BY lr.date_from ASC`).all();
  } else if (canViewAll(req.session)) {
    // ผู้มีสิทธิ์อนุมัติเห็นของทุกคน (ตรงกับ Dashboard และหน้าอนุมัติ)
    rows = db.prepare(`${baseSql} ORDER BY lr.date_from ASC`).all();
  } else {
    rows = db.prepare(`${baseSql} AND lr.requester_id = ? ORDER BY lr.date_from ASC`).all(userId);
  }
  res.json({ requests: rows });
});

router.get('/:id', requireAuth, (req, res) => {
  const lr = db.prepare(`
    SELECT lr.*, u.full_name AS requester_name, u.department AS requester_department, a.full_name AS approver_name
    FROM leave_requests lr
    JOIN users u ON u.id = lr.requester_id
    LEFT JOIN users a ON a.id = lr.approver_id
    WHERE lr.id = ?
  `).get(req.params.id);
  if (!lr) return res.status(404).json({ error: 'ไม่พบคำขอลา' });
  const isRequester = lr.requester_id === req.session.userId;
  const isAdmin = req.session.role === 'Admin';
  const isParticipant = approvalEngine.isWorkflowParticipant('leave', lr.id, req.session.userId);
  const isViewer = canViewAll(req.session) && lr.status !== 'draft'; // ผู้มีสิทธิ์อนุมัติดูได้ทุกคำขอ (ยกเว้นฉบับร่างของคนอื่น)
  if (!isRequester && !isAdmin && !isParticipant && !isViewer) {
    return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ดูคำขอนี้' });
  }
  const history = db.prepare(`
    SELECT h.*, u.full_name AS actor_name FROM leave_history h
    LEFT JOIN users u ON u.id = h.action_by
    WHERE h.leave_request_id = ? ORDER BY h.created_at ASC
  `).all(req.params.id);
  const workflow = approvalEngine.getWorkflow('leave', lr.id);
  res.json({ request: lr, history, workflow });
});

// สร้างคำขอลา (save_as: 'draft' หรือส่งเลย)
router.post('/', requireAuth, (req, res) => {
  const { leave_type, leave_mode, date_from, reason, attachment, save_as } = req.body;
  const isDraft = save_as === 'draft';

  if (!isDraft) {
    if (!isValidLeaveType(leave_type)) return res.status(400).json({ error: 'กรุณาเลือกประเภทการลาให้ถูกต้อง' });
    if (!isValidLeaveMode(leave_mode)) return res.status(400).json({ error: 'กรุณาเลือกรูปแบบการลาให้ถูกต้อง' });
    if (!date_from) return res.status(400).json({ error: 'กรุณาระบุวันที่ลา' });
    if (!reason || !reason.trim()) return res.status(400).json({ error: 'กรุณาระบุเหตุผลการลา' });
    if (leave_mode === 'hours' && (!req.body.time_from || !req.body.time_to)) {
      return res.status(400).json({ error: 'กรุณาระบุเวลาเริ่มต้นและสิ้นสุด' });
    }
    // ยังไม่มี Template อนุมัติไหนเซ็ตชื่อผู้ใช้นี้ไว้เป็น Requester เลย -> บล็อกตอนส่งคำขอ (ฟอร์มกรอก/บันทึกร่างได้ปกติ แต่ส่งจริงไม่ได้)
    if (!isEligibleLeaveRequester(req.session.userId)) {
      return res.status(403).json({ error: NOT_ELIGIBLE_MSG });
    }
    {
      const noApprover = approvalEngine.checkCanSubmit('leave', req.session.userId);
      if (noApprover) return res.status(400).json({ error: noApprover });
    }
  }

  const dur = (leave_mode && date_from) ? computeDuration(req.body) : { duration_days: 0, duration_hours: 0, date_to: date_from || '', time_from: req.body.time_from || '', time_to: req.body.time_to || '' };
  if (!isDraft) {
    const qErr = quotaError(req.session.userId, leave_type, dur.duration_days);
    if (qErr) return res.status(400).json({ error: qErr });
  }
  const status = isDraft ? 'draft' : 'pending';

  let code, info;
  const insertStmt = db.prepare(`
    INSERT INTO leave_requests (code, requester_id, leave_type, leave_mode, date_from, date_to, time_from, time_to, duration_days, duration_hours, reason, attachment, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (let attempt = 0; attempt < 5; attempt++) {
    code = generateCode();
    try {
      info = insertStmt.run(code, req.session.userId, leave_type || '', leave_mode || '', date_from || '', dur.date_to || date_from || '',
        dur.time_from || '', dur.time_to || '', dur.duration_days, dur.duration_hours, reason || '', attachment || null, status);
      break;
    } catch (err) {
      const isDup = err.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed: leave_requests\.code/.test(err.message);
      if (isDup && attempt < 4) continue;
      throw err;
    }
  }

  const lrId = info.lastInsertRowid;
  if (isDraft) {
    db.prepare(`INSERT INTO leave_history (leave_request_id, action_by, action) VALUES (?, ?, 'บันทึกฉบับร่าง')`).run(lrId, req.session.userId);
    logAction(req.session.userId, 'create_leave_draft', `บันทึกฉบับร่างคำขอลา #${code}`);
    return res.status(201).json({ id: lrId, code, status });
  }

  db.prepare(`INSERT INTO leave_history (leave_request_id, action_by, action) VALUES (?, ?, 'ส่งคำขอ')`).run(lrId, req.session.userId);
  logAction(req.session.userId, 'submit_leave_request', `ส่งคำขอลา #${code}`);
  approvalEngine.createWorkflow('leave', lrId, req.session.userId);
  notifyLeaveSubmitted(lrId);
  res.status(201).json({ id: lrId, code, status });
});

router.put('/:id', requireAuth, (req, res) => {
  const lr = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(req.params.id);
  if (!lr) return res.status(404).json({ error: 'ไม่พบคำขอลา' });
  if (lr.requester_id !== req.session.userId) return res.status(403).json({ error: 'คุณไม่มีสิทธิ์แก้ไขคำขอนี้' });
  if (!EDITABLE_STATUSES.includes(lr.status)) return res.status(400).json({ error: 'ไม่สามารถแก้ไขคำขอนี้ได้แล้ว' });

  const { leave_type, leave_mode, date_from, reason, attachment } = req.body;
  const dur = computeDuration(req.body);
  db.prepare(`
    UPDATE leave_requests SET leave_type = ?, leave_mode = ?, date_from = ?, date_to = ?, time_from = ?, time_to = ?,
      duration_days = ?, duration_hours = ?, reason = ?, attachment = ?
    WHERE id = ?
  `).run(leave_type || '', leave_mode || '', date_from || '', dur.date_to, dur.time_from, dur.time_to,
    dur.duration_days, dur.duration_hours, reason || '', attachment || null, req.params.id);
  res.json({ ok: true });
});

router.post('/:id/submit', requireAuth, (req, res) => {
  const lr = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(req.params.id);
  if (!lr) return res.status(404).json({ error: 'ไม่พบคำขอลา' });
  if (lr.requester_id !== req.session.userId) return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ส่งคำขอนี้' });
  if (!['draft'].includes(lr.status)) return res.status(400).json({ error: 'คำขอนี้ถูกส่งไปแล้ว' });
  if (!isValidLeaveType(lr.leave_type) || !lr.reason) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบก่อนส่งคำขอ' });
  }
  if (!isEligibleLeaveRequester(req.session.userId)) {
    return res.status(403).json({ error: NOT_ELIGIBLE_MSG });
  }
  {
    const noApprover = approvalEngine.checkCanSubmit('leave', req.session.userId);
    if (noApprover) return res.status(400).json({ error: noApprover });
  }
  {
    const qErr = quotaError(lr.requester_id, lr.leave_type, lr.duration_days, lr.id);
    if (qErr) return res.status(400).json({ error: qErr });
  }
  db.prepare(`UPDATE leave_requests SET status = 'pending' WHERE id = ?`).run(req.params.id);
  db.prepare(`INSERT INTO leave_history (leave_request_id, action_by, action) VALUES (?, ?, 'ส่งคำขอ')`).run(req.params.id, req.session.userId);
  logAction(req.session.userId, 'submit_leave_request', `ส่งคำขอลา #${lr.code}`);
  approvalEngine.createWorkflow('leave', lr.id, req.session.userId);
  notifyLeaveSubmitted(lr.id);
  res.json({ ok: true });
});

// ส่งใหม่หลังถูกส่งกลับให้แก้ไข (revision) - แก้ไขข้อมูลผ่าน PUT /:id ก่อนแล้วค่อยเรียกอันนี้ เพื่อรีเซ็ต workflow กลับไปเริ่มที่ State แรก
router.post('/:id/resubmit', requireAuth, (req, res) => {
  const lr = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(req.params.id);
  if (!lr) return res.status(404).json({ error: 'ไม่พบคำขอลา' });
  if (lr.requester_id !== req.session.userId) return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ส่งคำขอนี้' });
  if (lr.status !== 'revision') return res.status(400).json({ error: 'คำขอนี้ไม่ได้อยู่ในสถานะรอแก้ไข' });
  if (!isEligibleLeaveRequester(req.session.userId)) {
    return res.status(403).json({ error: NOT_ELIGIBLE_MSG });
  }
  {
    const noApprover = approvalEngine.checkCanSubmit('leave', req.session.userId);
    if (noApprover) return res.status(400).json({ error: noApprover });
  }
  {
    const qErr = quotaError(lr.requester_id, lr.leave_type, lr.duration_days, lr.id);
    if (qErr) return res.status(400).json({ error: qErr });
  }
  db.prepare(`UPDATE leave_requests SET status = 'pending', approver_id = NULL, approved_at = NULL, approval_note = '' WHERE id = ?`).run(req.params.id);
  db.prepare(`INSERT INTO leave_history (leave_request_id, action_by, action) VALUES (?, ?, 'ส่งคำขอใหม่หลังแก้ไข')`).run(req.params.id, req.session.userId);
  logAction(req.session.userId, 'resubmit_leave_request', `ส่งคำขอลาใหม่หลังแก้ไข #${lr.code}`);
  approvalEngine.createWorkflow('leave', lr.id, req.session.userId); // เริ่ม workflow ใหม่จาก State แรกเสมอ (ดึง Template ล่าสุด ณ ตอนนี้)
  notifyLeaveSubmitted(lr.id);
  res.json({ ok: true });
});

router.post('/:id/cancel', requireAuth, (req, res) => {
  const lr = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(req.params.id);
  if (!lr) return res.status(404).json({ error: 'ไม่พบคำขอลา' });
  if (lr.requester_id !== req.session.userId) return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ยกเลิกคำขอนี้' });
  if (!['draft', 'pending', 'revision'].includes(lr.status)) return res.status(400).json({ error: 'ไม่สามารถยกเลิกคำขอนี้ได้แล้ว' });
  db.prepare(`UPDATE leave_requests SET status = 'cancelled' WHERE id = ?`).run(req.params.id);
  db.prepare(`INSERT INTO leave_history (leave_request_id, action_by, action) VALUES (?, ?, 'ยกเลิก')`).run(req.params.id, req.session.userId);
  logAction(req.session.userId, 'cancel_leave_request', `ยกเลิกคำขอลา #${lr.code}`);
  res.json({ ok: true });
});

function requireApproverOrAdmin(req, res, next) {
  // อนุญาตทั้งหัวหน้า/Admin โดยตำแหน่ง และคนที่ Admin ตั้งเป็นผู้อนุมัติผ่าน Template (ไม่ว่า role จะเป็นอะไร)
  // การตรวจว่าเป็นผู้อนุมัติของ "คำขอนี้ใน state ปัจจุบัน" จริงหรือไม่ ทำอีกชั้นใน approvalEngine.decide() อยู่แล้ว
  if (!['Approver', 'Admin'].includes(req.session.role) && !approvalEngine.hasEverBeenApprover(req.session.userId)) {
    return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้' });
  }
  next();
}

router.post('/:id/approve', requireAuth, requireApproverOrAdmin, (req, res) => {
  decide(req, res, 'approve', 'อนุมัติ');
});
router.post('/:id/reject', requireAuth, requireApproverOrAdmin, (req, res) => {
  decide(req, res, 'reject', 'ไม่อนุมัติ');
});
// ส่งกลับให้ผู้ขอแก้ไข (revision) แทนที่จะ reject จบเลย - ผู้ขอแก้ไขแล้ว resubmit วนกลับไปเริ่มที่ State แรกใหม่
router.post('/:id/revision', requireAuth, requireApproverOrAdmin, (req, res) => {
  decide(req, res, 'revision', 'ส่งกลับแก้ไข');
});

function decide(req, res, action, actionLabel) {
  const lr = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(req.params.id);
  if (!lr) return res.status(404).json({ error: 'ไม่พบคำขอลา' });
  if (lr.status !== 'pending') return res.status(400).json({ error: 'คำขอนี้ถูกดำเนินการไปแล้ว' });

  const { note } = req.body;
  const wfBefore = approvalEngine.getWorkflow('leave', lr.id);
  const stateName = wfBefore && wfBefore.states[wfBefore.currentStateIndex] ? wfBefore.states[wfBefore.currentStateIndex].name : '';
  let result;
  try {
    // ทุกขั้นตอนที่เขียนฐานข้อมูล (workflow + ประวัติ + สถานะใบลา + หักวันลา) อยู่ใน transaction เดียว: สำเร็จครบหรือย้อนกลับทั้งหมด
    result = db.transaction(() => {
      const r = approvalEngine.decide('leave', lr.id, req.session.userId, action, note, lr.requester_id);
      db.prepare(`INSERT INTO leave_history (leave_request_id, action_by, action, note) VALUES (?, ?, ?, ?)`)
        .run(req.params.id, req.session.userId, `${actionLabel}${stateName ? ` (${stateName})` : ''}`, note || '');
      logAction(req.session.userId, `leave_${action}`, `${actionLabel}คำขอลา #${lr.code}`);

      if (r.finalStatus) {
        // workflow จบแล้ว (approved / rejected / revision) - sync กลับไปที่ leave_requests.status
        db.prepare(`UPDATE leave_requests SET status = ?, approver_id = ?, approved_at = datetime('now'), approval_note = ? WHERE id = ?`)
          .run(r.finalStatus, req.session.userId, note || '', req.params.id);

        if (r.finalStatus === 'approved' && lr.duration_days > 0) {
          ensureBalance(lr.requester_id);
          const col = lr.leave_type === 'ลาพักร้อน' ? 'vacation_used' : lr.leave_type === 'ลากิจ' ? 'personal_used' : lr.leave_type === 'ลาป่วย' ? 'sick_used' : null;
          if (col) {
            db.prepare(`UPDATE leave_balances SET ${col} = ${col} + ?, updated_at = datetime('now') WHERE user_id = ?`)
              .run(lr.duration_days, lr.requester_id);
          }
        }
      }
      return r;
    })();
  } catch (err) {
    if (err instanceof approvalEngine.ApprovalError) return res.status(400).json({ error: err.message });
    throw err;
  }

  // แจ้งเตือน/อีเมลทำหลัง commit แล้วเท่านั้น (ถ้าส่งอีเมลพลาดก็ไม่กระทบข้อมูลที่บันทึกไปแล้ว)
  if (result.finalStatus) {
    notifyLeaveDecision(lr.id, result.finalStatus, req.session.userId, note);
  } else if (result.advanced) {
    // ผ่าน state นี้แล้ว ไปรอ state ถัดไป - แจ้งเตือนผู้อนุมัติ state ถัดไปว่าถึงคิวแล้ว
    notifyLeaveSubmitted(lr.id, true);
  }
  // result.finalStatus === null && !advanced -> ยังรอคนอื่นใน state เดียวกัน (โหมด ALL) ไม่ต้องแจ้งอะไรเพิ่ม

  res.json({ ok: true });
}

// isAdvance = true เมื่อเรียกตอน state เลื่อนไปคนถัดไป (ไม่ใช่ตอนส่งคำขอครั้งแรก) - แจ้งเฉพาะผู้อนุมัติของ state ปัจจุบัน ไม่ต้องแจ้ง Admin ซ้ำทุกรอบ
function notifyLeaveSubmitted(lrId, isAdvance = false) {
  const lr = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(lrId);
  const requester = db.prepare('SELECT full_name, department, email FROM users WHERE id = ?').get(lr.requester_id);
  const currentApproverIds = approvalEngine.getCurrentApproverIds('leave', lrId);
  const admins = isAdvance ? [] : db.prepare(`SELECT id FROM users WHERE is_active = 1 AND role = 'Admin'`).all().map(r => r.id);
  const ids = Array.from(new Set([...currentApproverIds, ...admins]));
  if (!ids.length) return;
  const approvers = db.prepare(`SELECT id, full_name, email, email_notify FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  const msg = isAdvance
    ? `คำขอลาของ ${requester.full_name} (${lr.leave_type}) วันที่ ${toThaiDate(lr.date_from)}${lr.date_to !== lr.date_from ? ' ถึง ' + toThaiDate(lr.date_to) : ''} ถึงคิวที่ต้องให้คุณอนุมัติแล้ว`
    : `มีคำขอลาใหม่จาก ${requester.full_name} (${lr.leave_type}) วันที่ ${toThaiDate(lr.date_from)}${lr.date_to !== lr.date_from ? ' ถึง ' + toThaiDate(lr.date_to) : ''}`;
  const notifStmt = db.prepare(`INSERT INTO notifications (user_id, type, message, related_id) VALUES (?, 'leave_new_request', ?, ?)`);
  for (const a of approvers) {
    notifStmt.run(a.id, msg, lrId);
    if (a.email && a.email_notify) {
      sendMail({
        to: a.email,
        subject: `[TRISAK] คำขอลาใหม่ #${lr.code}`,
        html: `<p>${msg}</p><p>เหตุผล: ${lr.reason || '-'}</p><p><a href="${process.env.APP_BASE_URL || 'http://localhost:3000'}/approve-leave?id=${lrId}">เปิดดูคำขอ</a></p>`
      }).catch(err => console.error('[leave] send mail error:', err.message));
    }
  }
}

function notifyLeaveDecision(lrId, status, approverId, note) {
  const lr = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(lrId);
  const requester = db.prepare('SELECT full_name, email, email_notify FROM users WHERE id = ?').get(lr.requester_id);
  const approver = db.prepare('SELECT full_name FROM users WHERE id = ?').get(approverId);
  const label = status === 'approved' ? 'อนุมัติ' : status === 'revision' ? 'ส่งกลับให้แก้ไข' : 'ไม่อนุมัติ';
  const msg = `คำขอลา #${lr.code} (${lr.leave_type}) ของคุณถูก${label}โดย ${approver ? approver.full_name : '-'}${note ? ' · ' + note : ''}`;
  const notifType = status === 'approved' ? 'leave_approved' : status === 'revision' ? 'leave_revision' : 'leave_rejected';
  db.prepare(`INSERT INTO notifications (user_id, type, message, related_id) VALUES (?, ?, ?, ?)`)
    .run(lr.requester_id, notifType, msg, lrId);
  if (requester && requester.email && requester.email_notify) {
    sendMail({
      to: requester.email,
      subject: `[TRISAK] คำขอลา #${lr.code} ถูก${label}`,
      html: `<p>${msg}</p>`
    }).catch(err => console.error('[leave] send mail error:', err.message));
  }
}

// ===== สรุปวันลา (สำหรับหน้า Profile/Dashboard ของตัวเอง) =====
function buildLeaveSummary(userId) {
  const bal = ensureBalance(userId);
  const approvedThisYear = db.prepare(`
    SELECT leave_type, COUNT(*) AS cnt, SUM(duration_days) AS days, SUM(duration_hours) AS hours
    FROM leave_requests
    WHERE requester_id = ? AND status = 'approved' AND strftime('%Y', date_from) = strftime('%Y', 'now')
    GROUP BY leave_type
  `).all(userId);
  const byType = { 'ลากิจ': { cnt: 0, days: 0, hours: 0 }, 'ลาป่วย': { cnt: 0, days: 0, hours: 0 }, 'ลาพักร้อน': { cnt: 0, days: 0, hours: 0 } };
  approvedThisYear.forEach(r => { byType[r.leave_type] = { cnt: r.cnt, days: r.days || 0, hours: r.hours || 0 }; });
  const totalDays = approvedThisYear.reduce((s, r) => s + (r.days || 0), 0);
  const totalHours = approvedThisYear.reduce((s, r) => s + (r.hours || 0), 0);
  return {
    vacation_total: bal.vacation_total,
    vacation_used: bal.vacation_used,
    vacation_remaining: Math.max(0, bal.vacation_total - bal.vacation_used),
    personal_total: bal.personal_total,
    personal_used: bal.personal_used,
    personal_remaining: Math.max(0, bal.personal_total - bal.personal_used),
    sick_total: bal.sick_total,
    sick_used: bal.sick_used,
    sick_remaining: Math.max(0, bal.sick_total - bal.sick_used),
    by_type: byType,
    total_days_used: totalDays,
    total_hours_used: totalHours
  };
}

router.get('/summary/me', requireAuth, (req, res) => {
  res.json(buildLeaveSummary(req.session.userId));
});

// ให้หัวหน้า/คนที่มีสิทธิ์แก้ไขโปรไฟล์ดูสรุปวันลาของคนอื่นได้ (ใช้ในหน้าทีมของฉัน)
router.get('/summary/:userId', requireAuth, (req, res) => {
  const targetId = req.params.userId;
  if (Number(req.session.userId) !== Number(targetId) && req.session.role !== 'Admin' && !canEditProfile(req.session.userId, targetId)) {
    return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ดูข้อมูลนี้' });
  }
  res.json(buildLeaveSummary(targetId));
});

// ===== Admin: จัดการสิทธิ์วันลารายบุคคล =====
router.get('/balances/all', requireAuth, requireRole('Admin'), (req, res) => {
  const users = db.prepare(`SELECT id, full_name, username, department FROM users ORDER BY full_name`).all();
  const rows = users.map(u => ({ ...u, balance: ensureBalance(u.id) }));
  res.json({ balances: rows });
});

router.put('/balances/:userId', requireAuth, requireRole('Admin'), (req, res) => {
  const { vacation_total, vacation_used, personal_total, personal_used, sick_total, sick_used, note } = req.body;
  ensureBalance(req.params.userId);
  db.prepare(`
    UPDATE leave_balances SET vacation_total = ?, vacation_used = ?, personal_total = ?, personal_used = ?,
      sick_total = ?, sick_used = ?, note = ?, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(
    Number(vacation_total) || 0, Number(vacation_used) || 0,
    Number(personal_total) || 0, Number(personal_used) || 0,
    Number(sick_total) || 0, Number(sick_used) || 0,
    note || '', req.params.userId
  );
  logAction(req.session.userId, 'update_leave_balance', `ปรับสิทธิ์วันลาของ user #${req.params.userId}`);
  res.json({ ok: true });
});

module.exports = router;