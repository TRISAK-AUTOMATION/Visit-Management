// routes/dashboard.js
const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('./middleware');
const { getDepartmentsForUser } = require('../utils/userDepartments');
const approvalEngine = require('../utils/approvalEngine');
const { canViewAll } = require('../utils/viewScope');

const router = express.Router();
const thDate = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (d || ''); };

router.get('/stats', requireAuth, (req, res) => {
  const nowD = new Date();
  const todayStr = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}-${String(nowD.getDate()).padStart(2, '0')}`; // วันนี้ตามเวลาเครื่อง server
  const { userId, role } = req.session;
  let scope = '';
  let params = [];

  if (role === 'Admin') {
    // Admin: ไม่มีการกรอง เห็นทุกคำขอ
  } else if (canViewAll(req.session)) {
    // ผู้มีสิทธิ์อนุมัติ (role Approver หรือถูกตั้งเป็นผู้อนุมัติในเทมเพลต) เห็นคำขอของทุกคน
    // ไม่รวมฉบับร่าง/รอแก้ไขของคนอื่น (ยังอยู่กับผู้ขอ) - ตรงกับรายการในหน้าอนุมัติ
    scope = `AND (vr.requester_id = ? OR (vr.status != 'draft' AND vr.status != 'revision'))`;
    params = [userId];
  } else {
    scope = 'AND vr.requester_id = ?';
    params = [userId];
  }

  const joinUser = 'JOIN users u ON u.id = vr.requester_id';

  const total = db.prepare(`SELECT COUNT(*) c FROM visit_requests vr ${joinUser} WHERE 1=1 ${scope}`).get(...params).c;
  const pending = db.prepare(`SELECT COUNT(*) c FROM visit_requests vr ${joinUser} WHERE vr.status='pending' ${scope}`).get(...params).c;
  const approved = db.prepare(`SELECT COUNT(*) c FROM visit_requests vr ${joinUser} WHERE vr.status='approved' ${scope}`).get(...params).c;
  const rejected = db.prepare(`SELECT COUNT(*) c FROM visit_requests vr ${joinUser} WHERE vr.status='rejected' ${scope}`).get(...params).c;

  const latest = db.prepare(`
    SELECT vr.*, c.name AS customer_name
    FROM visit_requests vr JOIN customers c ON c.id = vr.customer_id ${joinUser}
    WHERE 1=1 ${scope}
    ORDER BY vr.created_at DESC, vr.id DESC LIMIT 5
  `).all(...params);

  const upcoming = db.prepare(`
    SELECT vr.*, c.name AS customer_name
    FROM visit_requests vr JOIN customers c ON c.id = vr.customer_id ${joinUser}
    WHERE vr.status='approved' AND vr.visit_date >= date('now','localtime') ${scope}
    ORDER BY vr.visit_date ASC LIMIT 5
  `).all(...params);


  // ---------- ส่วนเพิ่มเติม: ลา / OT / งานที่รอฉันอนุมัติ (ไม่กระทบตัวเลข Visit เดิมด้านบน) ----------
  // ขอบเขต: Admin = ทั้งระบบ | คนอื่น = ของตัวเอง + คำขอที่ตัวเองอยู่ในสายอนุมัติ (workflow engine)
  const extraModule = (module, table) => {
    let where = '1=1';
    let p = [];
    if (role !== 'Admin') {
      if (canViewAll(req.session)) {
        // ผู้มีสิทธิ์อนุมัติ: เห็นของทุกคน ยกเว้นฉบับร่าง/รอแก้ไขของคนอื่น
        where = `(t.requester_id = ? OR (t.status != 'draft' AND t.status != 'revision'))`;
        p = [userId];
      } else {
        // ผู้ใช้ทั่วไป: ของตัวเองเท่านั้น
        where = `t.requester_id = ?`;
        p = [userId];
      }
    }
    const cnt = (st) => db.prepare(`SELECT COUNT(*) c FROM ${table} t WHERE ${where}${st ? ` AND t.status = '${st}'` : ''}`).get(...p).c;
    return {
      where, p,
      stats: { total: cnt(), pending: cnt('pending'), approved: cnt('approved'), rejected: cnt('rejected') }
    };
  };
  const leaveScope = extraModule('leave', 'leave_requests');
  const otScope = extraModule('ot', 'ot_requests');

  // งานที่ต้องทำ: รอฉันอนุมัติ (ขั้นตอนปัจจุบันเป็นของฉัน) + ของฉันที่ถูกส่งกลับแก้ไข + แบบร่างของฉัน
  const waitingMe = (module) => approvalEngine.listRequestIdsForApprover(module, userId, { onlyCurrentPending: true }).length;
  const mine = (table, st) => db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE requester_id = ? AND status = ?`).get(userId, st).c;
  const todo = {
    waiting: { visit: waitingMe('visit'), leave: waitingMe('leave'), ot: waitingMe('ot') },
    revision: { visit: mine('visit_requests', 'revision'), leave: mine('leave_requests', 'revision'), ot: mine('ot_requests', 'revision') },
    draft: { visit: mine('visit_requests', 'draft'), leave: mine('leave_requests', 'draft'), ot: mine('ot_requests', 'draft') }
  };

  // รายการล่าสุด / กำหนดการที่จะถึง รวมทุกประเภท (ใส่ kind ให้ฝั่งหน้าจอแยกป้าย/กรองได้)
  const leaveLatest = db.prepare(`
    SELECT t.id, t.leave_type, t.leave_mode, t.date_from, t.date_to, t.time_from, t.time_to, t.status, t.created_at, u.full_name AS requester_name
    FROM leave_requests t JOIN users u ON u.id = t.requester_id
    WHERE ${leaveScope.where} AND t.status != 'cancelled' ORDER BY t.created_at DESC, t.id DESC LIMIT 5`).all(...leaveScope.p);
  const otLatest = db.prepare(`
    SELECT t.id, t.ot_date, t.time_from, t.time_to, t.hours, t.ot_type, t.status, t.created_at, u.full_name AS requester_name
    FROM ot_requests t JOIN users u ON u.id = t.requester_id
    WHERE ${otScope.where} AND t.status != 'cancelled' ORDER BY t.created_at DESC, t.id DESC LIMIT 5`).all(...otScope.p);
  const leaveUpcoming = db.prepare(`
    SELECT t.id, t.leave_type, t.leave_mode, t.date_from, t.date_to, t.time_from, t.time_to, u.full_name AS requester_name
    FROM leave_requests t JOIN users u ON u.id = t.requester_id
    WHERE ${leaveScope.where} AND t.status = 'approved' AND t.date_to >= date('now','localtime') ORDER BY t.date_from ASC LIMIT 5`).all(...leaveScope.p);
  const otUpcoming = db.prepare(`
    SELECT t.id, t.ot_date, t.time_from, t.time_to, t.hours, t.ot_type, u.full_name AS requester_name
    FROM ot_requests t JOIN users u ON u.id = t.requester_id
    WHERE ${otScope.where} AND t.status = 'approved' AND t.ot_date >= date('now','localtime') ORDER BY t.ot_date ASC LIMIT 5`).all(...otScope.p);

  const latestAll = [
    ...latest.map(v => ({ kind: 'visit', id: v.id, date: v.visit_date, title: v.customer_name, time: `${v.time_from} - ${v.time_to}`, status: v.status, created_at: v.created_at })),
    ...leaveLatest.map(l => ({ kind: 'leave', id: l.id, date: l.date_from, title: `${l.leave_type} · ${l.requester_name}`, time: l.leave_mode === 'hours' ? `${l.time_from} - ${l.time_to}` : (l.date_to && l.date_to !== l.date_from ? `ถึง ${thDate(l.date_to)}` : 'เต็มวัน/ครึ่งวัน'), status: l.status, created_at: l.created_at })),
    ...otLatest.map(o => ({ kind: 'ot', id: o.id, date: o.ot_date, title: `${o.ot_type || 'OT'} · ${o.requester_name}`, time: `${o.time_from} - ${o.time_to}`, status: o.status, created_at: o.created_at }))
  ].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  const upcomingAll = [
    ...upcoming.map(v => ({ kind: 'visit', id: v.id, date: v.visit_date, title: v.customer_name, time: `${v.time_from} - ${v.time_to}` })),
    ...leaveUpcoming.map(l => ({ kind: 'leave', id: l.id, date: l.date_from < todayStr ? todayStr : l.date_from, title: `${l.leave_type} · ${l.requester_name}`, time: l.date_to && l.date_to !== l.date_from ? `ถึง ${thDate(l.date_to)}` : (l.leave_mode === 'hours' ? `${l.time_from} - ${l.time_to}` : 'เต็มวัน/ครึ่งวัน') })),
    ...otUpcoming.map(o => ({ kind: 'ot', id: o.id, date: o.ot_date, title: `${o.ot_type || 'OT'} · ${o.requester_name}`, time: `${o.time_from} - ${o.time_to}` }))
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  res.json({
    stats: { total, pending, approved, rejected },
    latest,
    upcoming,
    leave_stats: leaveScope.stats,
    ot_stats: otScope.stats,
    todo,
    latest_all: latestAll,
    upcoming_all: upcomingAll
  });
});

module.exports = router;
