// routes/ot.js - ระบบขอทำงานล่วงเวลา (OT Management)
const express = require('express');
const db = require('../db/database');
const { requireAuth, requireRole } = require('./middleware');
const { sendMail } = require('../utils/mailer');
const { toThaiDate } = require('../utils/dateFormat');
const { logAction } = require('../utils/systemLog');
const approvalEngine = require('../utils/approvalEngine');

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

function hoursBetween(timeFrom, timeTo) {
  const [fh, fm] = (timeFrom || '0:0').split(':').map(Number);
  const [th, tm] = (timeTo || '0:0').split(':').map(Number);
  let mins = (th * 60 + tm) - (fh * 60 + fm);
  if (mins < 0) mins += 24 * 60; // เผื่อกรณี OT ข้ามเที่ยงคืน
  return Math.round((mins / 60) * 100) / 100;
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
    if (req.session.role === 'Admin') {
      rows = db.prepare(`
        SELECT o.*, u.full_name AS requester_name, u.department AS requester_department
        FROM ot_requests o JOIN users u ON u.id = o.requester_id
        WHERE o.status = ? ORDER BY o.created_at DESC
      `).all(wantedStatus);
    } else {
      // ใช้ workflow engine หาว่าคำขอไหนเกี่ยวข้องกับตัวเอง แทนการอิงแผนกตรงๆ เพราะตอนนี้บาง request อาจวิ่งอยู่ใน Template ที่ Admin ตั้งไว้
      const ids = approvalEngine.listRequestIdsForApprover('ot', req.session.userId, { onlyCurrentPending: wantedStatus === 'pending' });
      if (!ids.length) return res.json({ requests: [] });
      const placeholders = ids.map(() => '?').join(',');
      rows = db.prepare(`
        SELECT o.*, u.full_name AS requester_name, u.department AS requester_department
        FROM ot_requests o JOIN users u ON u.id = o.requester_id
        WHERE o.status = ? AND o.id IN (${placeholders})
        ORDER BY o.created_at DESC
      `).all(wantedStatus, ...ids);
    }
    return res.json({ requests: rows });
  }
  res.status(400).json({ error: 'scope ไม่ถูกต้อง' });
});

router.get('/:id', requireAuth, (req, res) => {
  const ot = db.prepare(`
    SELECT o.*, u.full_name AS requester_name, u.position AS requester_position, u.department AS requester_department,
           a.full_name AS approver_name
    FROM ot_requests o
    JOIN users u ON u.id = o.requester_id
    LEFT JOIN users a ON a.id = o.approver_id
    WHERE o.id = ?
  `).get(req.params.id);
  if (!ot) return res.status(404).json({ error: 'ไม่พบคำขอ OT' });
  const isRequester = ot.requester_id === req.session.userId;
  const isAdmin = req.session.role === 'Admin';
  const isParticipant = approvalEngine.isWorkflowParticipant('ot', ot.id, req.session.userId);
  if (!isRequester && !isAdmin && !isParticipant) {
    return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ดูคำขอนี้' });
  }
  const history = db.prepare(`
    SELECT h.*, u.full_name AS actor_name FROM ot_history h
    LEFT JOIN users u ON u.id = h.action_by
    WHERE h.ot_request_id = ? ORDER BY h.created_at ASC
  `).all(req.params.id);
  const workflow = approvalEngine.getWorkflow('ot', ot.id);
  res.json({ request: ot, history, workflow });
});

router.post('/', requireAuth, (req, res) => {
  const { ot_date, time_from, time_to, location, work_detail, reason, notes, save_as } = req.body;
  const isDraft = save_as === 'draft';

  if (!isDraft) {
    if (!ot_date) return res.status(400).json({ error: 'กรุณาระบุวันที่ทำ OT' });
    if (!time_from || !time_to) return res.status(400).json({ error: 'กรุณาระบุเวลาเริ่มต้นและสิ้นสุด' });
    if (!work_detail || !work_detail.trim()) return res.status(400).json({ error: 'กรุณาระบุรายละเอียดงานที่ทำ' });
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
    INSERT INTO ot_requests (code, requester_id, ot_date, time_from, time_to, hours, location, work_detail, reason, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (let attempt = 0; attempt < 5; attempt++) {
    code = generateCode();
    try {
      info = insertStmt.run(code, req.session.userId, ot_date || '', time_from || '', time_to || '', hours,
        location || '', work_detail || '', reason || '', notes || '', status);
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
  const hours = (time_from && time_to) ? hoursBetween(time_from, time_to) : 0;
  db.prepare(`
    UPDATE ot_requests SET ot_date = ?, time_from = ?, time_to = ?, hours = ?, location = ?, work_detail = ?, reason = ?, notes = ?
    WHERE id = ?
  `).run(ot_date || '', time_from || '', time_to || '', hours, location || '', work_detail || '', reason || '', notes || '', req.params.id);
  res.json({ ok: true });
});

router.post('/:id/submit', requireAuth, (req, res) => {
  const ot = db.prepare('SELECT * FROM ot_requests WHERE id = ?').get(req.params.id);
  if (!ot) return res.status(404).json({ error: 'ไม่พบคำขอ OT' });
  if (ot.requester_id !== req.session.userId) return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ส่งคำขอนี้' });
  if (ot.status !== 'draft') return res.status(400).json({ error: 'คำขอนี้ถูกส่งไปแล้ว' });
  if (!ot.work_detail || !ot.ot_date) return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบก่อนส่งคำขอ' });
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
  db.prepare(`INSERT INTO ot_history (ot_request_id, action_by, action) VALUES (?, ?, 'ยกเลิก')`).run(req.params.id, req.session.userId);
  logAction(req.session.userId, 'cancel_ot_request', `ยกเลิกคำขอ OT #${ot.code}`);
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
        .run(req.params.id, req.session.userId, `${actionLabel}${stateName ? ` (${stateName})` : ''}`, note || '');
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
        html: `<p>${msg}</p><p>รายละเอียดงาน: ${ot.work_detail || '-'}</p><p><a href="${process.env.APP_BASE_URL || 'http://localhost:3000'}/approve-ot?id=${otId}">เปิดดูคำขอ</a></p>`
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
    sendMail({ to: requester.email, subject: `[TRISAK] คำขอ OT #${ot.code} ถูก${label}`, html: `<p>${msg}</p>` })
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

module.exports = router;
