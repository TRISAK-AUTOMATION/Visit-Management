// routes/ot.js - ระบบขอทำงานล่วงเวลา (OT Management)
const express = require('express');
const db = require('../db/database');
const { requireAuth, requireRole } = require('./middleware');
const { sendMail } = require('../utils/mailer');
const { toThaiDate } = require('../utils/dateFormat');
const { logAction } = require('../utils/systemLog');
const { approverIdsForDepartments } = require('../utils/userDepartments');

const router = express.Router();

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
    if (!['Approver', 'Admin'].includes(req.session.role)) {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้' });
    }
    let rows;
    if (req.session.role === 'Admin') {
      rows = db.prepare(`
        SELECT o.*, u.full_name AS requester_name, u.department AS requester_department
        FROM ot_requests o JOIN users u ON u.id = o.requester_id
        WHERE o.status = ? ORDER BY o.created_at DESC
      `).all(status || 'pending');
    } else {
      const myDepts = db.prepare('SELECT department FROM user_departments WHERE user_id = ?').all(req.session.userId).map(r => r.department);
      if (!myDepts.length) return res.json({ requests: [] });
      const placeholders = myDepts.map(() => '?').join(',');
      rows = db.prepare(`
        SELECT o.*, u.full_name AS requester_name, u.department AS requester_department
        FROM ot_requests o JOIN users u ON u.id = o.requester_id
        WHERE o.status = ? AND u.department IN (${placeholders})
        ORDER BY o.created_at DESC
      `).all(status || 'pending', ...myDepts);
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
  if (ot.requester_id !== req.session.userId && !['Approver', 'Admin'].includes(req.session.role)) {
    return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ดูคำขอนี้' });
  }
  const history = db.prepare(`
    SELECT h.*, u.full_name AS actor_name FROM ot_history h
    LEFT JOIN users u ON u.id = h.action_by
    WHERE h.ot_request_id = ? ORDER BY h.created_at ASC
  `).all(req.params.id);
  res.json({ request: ot, history });
});

router.post('/', requireAuth, (req, res) => {
  const { ot_date, time_from, time_to, location, work_detail, reason, notes, save_as } = req.body;
  const isDraft = save_as === 'draft';

  if (!isDraft) {
    if (!ot_date) return res.status(400).json({ error: 'กรุณาระบุวันที่ทำ OT' });
    if (!time_from || !time_to) return res.status(400).json({ error: 'กรุณาระบุเวลาเริ่มต้นและสิ้นสุด' });
    if (!work_detail || !work_detail.trim()) return res.status(400).json({ error: 'กรุณาระบุรายละเอียดงานที่ทำ' });
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
  notifyOTSubmitted(otId);
  res.status(201).json({ id: otId, code, status });
});

router.put('/:id', requireAuth, (req, res) => {
  const ot = db.prepare('SELECT * FROM ot_requests WHERE id = ?').get(req.params.id);
  if (!ot) return res.status(404).json({ error: 'ไม่พบคำขอ OT' });
  if (ot.requester_id !== req.session.userId) return res.status(403).json({ error: 'คุณไม่มีสิทธิ์แก้ไขคำขอนี้' });
  if (!['draft', 'pending'].includes(ot.status)) return res.status(400).json({ error: 'ไม่สามารถแก้ไขคำขอนี้ได้แล้ว' });

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
  db.prepare(`UPDATE ot_requests SET status = 'pending' WHERE id = ?`).run(req.params.id);
  db.prepare(`INSERT INTO ot_history (ot_request_id, action_by, action) VALUES (?, ?, 'ส่งคำขอ')`).run(req.params.id, req.session.userId);
  logAction(req.session.userId, 'submit_ot_request', `ส่งคำขอ OT #${ot.code}`);
  notifyOTSubmitted(ot.id);
  res.json({ ok: true });
});

router.post('/:id/cancel', requireAuth, (req, res) => {
  const ot = db.prepare('SELECT * FROM ot_requests WHERE id = ?').get(req.params.id);
  if (!ot) return res.status(404).json({ error: 'ไม่พบคำขอ OT' });
  if (ot.requester_id !== req.session.userId) return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ยกเลิกคำขอนี้' });
  if (!['draft', 'pending'].includes(ot.status)) return res.status(400).json({ error: 'ไม่สามารถยกเลิกคำขอนี้ได้แล้ว' });
  db.prepare(`UPDATE ot_requests SET status = 'cancelled' WHERE id = ?`).run(req.params.id);
  db.prepare(`INSERT INTO ot_history (ot_request_id, action_by, action) VALUES (?, ?, 'ยกเลิก')`).run(req.params.id, req.session.userId);
  logAction(req.session.userId, 'cancel_ot_request', `ยกเลิกคำขอ OT #${ot.code}`);
  res.json({ ok: true });
});

function requireApproverOrAdmin(req, res, next) {
  if (!['Approver', 'Admin'].includes(req.session.role)) return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้' });
  next();
}

router.post('/:id/approve', requireAuth, requireApproverOrAdmin, (req, res) => decide(req, res, 'approved', 'อนุมัติ'));
router.post('/:id/reject', requireAuth, requireApproverOrAdmin, (req, res) => decide(req, res, 'rejected', 'ไม่อนุมัติ'));

function decide(req, res, newStatus, actionLabel) {
  const ot = db.prepare('SELECT * FROM ot_requests WHERE id = ?').get(req.params.id);
  if (!ot) return res.status(404).json({ error: 'ไม่พบคำขอ OT' });
  if (ot.status !== 'pending') return res.status(400).json({ error: 'คำขอนี้ถูกดำเนินการไปแล้ว' });

  const { note } = req.body;
  db.prepare(`UPDATE ot_requests SET status = ?, approver_id = ?, approved_at = datetime('now'), approval_note = ? WHERE id = ?`)
    .run(newStatus, req.session.userId, note || '', req.params.id);
  db.prepare(`INSERT INTO ot_history (ot_request_id, action_by, action, note) VALUES (?, ?, ?, ?)`)
    .run(req.params.id, req.session.userId, actionLabel, note || '');
  logAction(req.session.userId, `ot_${newStatus}`, `${actionLabel}คำขอ OT #${ot.code}`);

  notifyOTDecision(ot.id, newStatus, req.session.userId, note);
  res.json({ ok: true });
}

function notifyOTSubmitted(otId) {
  const ot = db.prepare('SELECT * FROM ot_requests WHERE id = ?').get(otId);
  const requester = db.prepare('SELECT full_name, department, email FROM users WHERE id = ?').get(ot.requester_id);
  const approverIds = approverIdsForDepartments([requester.department]);
  const admins = db.prepare(`SELECT id FROM users WHERE is_active = 1 AND role = 'Admin'`).all().map(r => r.id);
  const ids = Array.from(new Set([...approverIds, ...admins]));
  if (!ids.length) return;
  const approvers = db.prepare(`SELECT id, full_name, email, email_notify FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  const msg = `มีคำขอ OT ใหม่จาก ${requester.full_name} วันที่ ${toThaiDate(ot.ot_date)} (${ot.hours} ชม.)`;
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
  const label = status === 'approved' ? 'อนุมัติ' : 'ไม่อนุมัติ';
  const msg = `คำขอ OT #${ot.code} ของคุณถูก${label}โดย ${approver ? approver.full_name : '-'}${note ? ' · ' + note : ''}`;
  db.prepare(`INSERT INTO notifications (user_id, type, message, related_id) VALUES (?, ?, ?, ?)`)
    .run(ot.requester_id, status === 'approved' ? 'ot_approved' : 'ot_rejected', msg, otId);
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
