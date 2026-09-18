// routes/leave.js - ระบบลา (Leave Management)
const express = require('express');
const db = require('../db/database');
const { requireAuth, requireRole } = require('./middleware');
const { sendMail } = require('../utils/mailer');
const { toThaiDate } = require('../utils/dateFormat');
const { logAction } = require('../utils/systemLog');
const { approverIdsForDepartments } = require('../utils/userDepartments');

const router = express.Router();

const LEAVE_TYPES = ['ลากิจ', 'ลาป่วย', 'ลาพักร้อน'];
const LEAVE_MODES = ['full_day', 'half_day_morning', 'half_day_afternoon', 'hours'];
const EDITABLE_STATUSES = ['draft', 'pending'];

function isValidLeaveType(t) { return LEAVE_TYPES.includes(t); }
function isValidLeaveMode(m) { return LEAVE_MODES.includes(m); }

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
    if (!['Approver', 'Admin'].includes(req.session.role)) {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้' });
    }
    let rows;
    if (req.session.role === 'Admin') {
      rows = db.prepare(`
        SELECT lr.*, u.full_name AS requester_name, u.department AS requester_department
        FROM leave_requests lr JOIN users u ON u.id = lr.requester_id
        WHERE lr.status = ? ORDER BY lr.created_at DESC
      `).all(status || 'pending');
    } else {
      const myDepts = db.prepare('SELECT department FROM user_departments WHERE user_id = ?').all(req.session.userId).map(r => r.department);
      if (!myDepts.length) return res.json({ requests: [] });
      const placeholders = myDepts.map(() => '?').join(',');
      rows = db.prepare(`
        SELECT lr.*, u.full_name AS requester_name, u.department AS requester_department
        FROM leave_requests lr JOIN users u ON u.id = lr.requester_id
        WHERE lr.status = ? AND u.department IN (${placeholders})
        ORDER BY lr.created_at DESC
      `).all(status || 'pending', ...myDepts);
    }
    return res.json({ requests: rows });
  }
  res.status(400).json({ error: 'scope ไม่ถูกต้อง' });
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
  if (lr.requester_id !== req.session.userId && !['Approver', 'Admin'].includes(req.session.role)) {
    return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ดูคำขอนี้' });
  }
  const history = db.prepare(`
    SELECT h.*, u.full_name AS actor_name FROM leave_history h
    LEFT JOIN users u ON u.id = h.action_by
    WHERE h.leave_request_id = ? ORDER BY h.created_at ASC
  `).all(req.params.id);
  res.json({ request: lr, history });
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
  }

  const dur = (leave_mode && date_from) ? computeDuration(req.body) : { duration_days: 0, duration_hours: 0, date_to: date_from || '', time_from: req.body.time_from || '', time_to: req.body.time_to || '' };
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
  db.prepare(`UPDATE leave_requests SET status = 'pending' WHERE id = ?`).run(req.params.id);
  db.prepare(`INSERT INTO leave_history (leave_request_id, action_by, action) VALUES (?, ?, 'ส่งคำขอ')`).run(req.params.id, req.session.userId);
  logAction(req.session.userId, 'submit_leave_request', `ส่งคำขอลา #${lr.code}`);
  notifyLeaveSubmitted(lr.id);
  res.json({ ok: true });
});

router.post('/:id/cancel', requireAuth, (req, res) => {
  const lr = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(req.params.id);
  if (!lr) return res.status(404).json({ error: 'ไม่พบคำขอลา' });
  if (lr.requester_id !== req.session.userId) return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ยกเลิกคำขอนี้' });
  if (!['draft', 'pending'].includes(lr.status)) return res.status(400).json({ error: 'ไม่สามารถยกเลิกคำขอนี้ได้แล้ว' });
  db.prepare(`UPDATE leave_requests SET status = 'cancelled' WHERE id = ?`).run(req.params.id);
  db.prepare(`INSERT INTO leave_history (leave_request_id, action_by, action) VALUES (?, ?, 'ยกเลิก')`).run(req.params.id, req.session.userId);
  logAction(req.session.userId, 'cancel_leave_request', `ยกเลิกคำขอลา #${lr.code}`);
  res.json({ ok: true });
});

function requireApproverOrAdmin(req, res, next) {
  if (!['Approver', 'Admin'].includes(req.session.role)) return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้' });
  next();
}

router.post('/:id/approve', requireAuth, requireApproverOrAdmin, (req, res) => {
  decide(req, res, 'approved', 'อนุมัติ');
});
router.post('/:id/reject', requireAuth, requireApproverOrAdmin, (req, res) => {
  decide(req, res, 'rejected', 'ไม่อนุมัติ');
});

function decide(req, res, newStatus, actionLabel) {
  const lr = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(req.params.id);
  if (!lr) return res.status(404).json({ error: 'ไม่พบคำขอลา' });
  if (lr.status !== 'pending') return res.status(400).json({ error: 'คำขอนี้ถูกดำเนินการไปแล้ว' });

  const { note } = req.body;
  db.prepare(`UPDATE leave_requests SET status = ?, approver_id = ?, approved_at = datetime('now'), approval_note = ? WHERE id = ?`)
    .run(newStatus, req.session.userId, note || '', req.params.id);
  db.prepare(`INSERT INTO leave_history (leave_request_id, action_by, action, note) VALUES (?, ?, ?, ?)`)
    .run(req.params.id, req.session.userId, actionLabel, note || '');
  logAction(req.session.userId, `leave_${newStatus}`, `${actionLabel}คำขอลา #${lr.code}`);

  // อัปเดตยอดวันลาที่ใช้ไป เมื่ออนุมัติแล้ว (นับเป็นวัน - กรณีลาเป็นชั่วโมง/นาทียังไม่หักโควตาวันเต็ม)
  if (newStatus === 'approved' && lr.duration_days > 0) {
    ensureBalance(lr.requester_id);
    const col = lr.leave_type === 'ลาพักร้อน' ? 'vacation_used' : lr.leave_type === 'ลากิจ' ? 'personal_used' : lr.leave_type === 'ลาป่วย' ? 'sick_used' : null;
    if (col) {
      db.prepare(`UPDATE leave_balances SET ${col} = ${col} + ?, updated_at = datetime('now') WHERE user_id = ?`)
        .run(lr.duration_days, lr.requester_id);
    }
  }

  notifyLeaveDecision(lr.id, newStatus, req.session.userId, note);
  res.json({ ok: true });
}

function notifyLeaveSubmitted(lrId) {
  const lr = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(lrId);
  const requester = db.prepare('SELECT full_name, department, email FROM users WHERE id = ?').get(lr.requester_id);
  const approverIds = approverIdsForDepartments([requester.department]);
  const admins = db.prepare(`SELECT id FROM users WHERE is_active = 1 AND role = 'Admin'`).all().map(r => r.id);
  const ids = Array.from(new Set([...approverIds, ...admins]));
  if (!ids.length) return;
  const approvers = db.prepare(`SELECT id, full_name, email, email_notify FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  const msg = `มีคำขอลาใหม่จาก ${requester.full_name} (${lr.leave_type}) วันที่ ${toThaiDate(lr.date_from)}${lr.date_to !== lr.date_from ? ' ถึง ' + toThaiDate(lr.date_to) : ''}`;
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
  const label = status === 'approved' ? 'อนุมัติ' : 'ไม่อนุมัติ';
  const msg = `คำขอลา #${lr.code} (${lr.leave_type}) ของคุณถูก${label}โดย ${approver ? approver.full_name : '-'}${note ? ' · ' + note : ''}`;
  db.prepare(`INSERT INTO notifications (user_id, type, message, related_id) VALUES (?, ?, ?, ?)`)
    .run(lr.requester_id, status === 'approved' ? 'leave_approved' : 'leave_rejected', msg, lrId);
  if (requester && requester.email && requester.email_notify) {
    sendMail({
      to: requester.email,
      subject: `[TRISAK] คำขอลา #${lr.code} ถูก${label}`,
      html: `<p>${msg}</p>`
    }).catch(err => console.error('[leave] send mail error:', err.message));
  }
}

// ===== สรุปวันลา (สำหรับหน้า Profile/Dashboard ของตัวเอง) =====
router.get('/summary/me', requireAuth, (req, res) => {
  const bal = ensureBalance(req.session.userId);
  const approvedThisYear = db.prepare(`
    SELECT leave_type, COUNT(*) AS cnt, SUM(duration_days) AS days, SUM(duration_hours) AS hours
    FROM leave_requests
    WHERE requester_id = ? AND status = 'approved' AND strftime('%Y', date_from) = strftime('%Y', 'now')
    GROUP BY leave_type
  `).all(req.session.userId);
  const byType = { 'ลากิจ': { cnt: 0, days: 0, hours: 0 }, 'ลาป่วย': { cnt: 0, days: 0, hours: 0 }, 'ลาพักร้อน': { cnt: 0, days: 0, hours: 0 } };
  approvedThisYear.forEach(r => { byType[r.leave_type] = { cnt: r.cnt, days: r.days || 0, hours: r.hours || 0 }; });
  const totalDays = approvedThisYear.reduce((s, r) => s + (r.days || 0), 0);
  const totalHours = approvedThisYear.reduce((s, r) => s + (r.hours || 0), 0);
  res.json({
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
  });
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
