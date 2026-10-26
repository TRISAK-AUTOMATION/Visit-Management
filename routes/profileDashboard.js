// routes/profileDashboard.js — ข้อมูลหน้า Profile Dashboard ของ "ตัวเอง" เท่านั้น
// ตัวตนมาจาก session เสมอ (ไม่รับ userId จาก client) จึงดูของคนอื่นผ่าน endpoint นี้ไม่ได้
const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('./middleware');
const { getDepartmentsForUser } = require('../utils/userDepartments');
const approvalEngine = require('../utils/approvalEngine');
const leaveRouter = require('./leave');

const router = express.Router();

// วันนี้/ปีนี้ ตามเวลาไทย (SQLite เก็บ created_at เป็น UTC)
function bangkokParts() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).reduce((o, x) => { o[x.type] = x.value; return o; }, {});
  return { today: `${p.year}-${p.month}-${p.day}`, year: p.year };
}

const KPI_CATS = [
  ['attendance_score', 'การมาทำงาน'], ['performance_score', 'ผลงาน'], ['responsibility_score', 'ความรับผิดชอบ'],
  ['teamwork_score', 'การทำงานเป็นทีม'], ['discipline_score', 'ระเบียบวินัย']
];

router.get('/', requireAuth, (req, res) => {
  const uid = req.session.userId;
  const u = db.prepare('SELECT id, username, full_name, email, phone, position, department, role, avatar_url, is_active, start_date FROM users WHERE id = ?').get(uid);
  if (!u) return res.status(401).json({ error: 'ไม่พบผู้ใช้' });
  const { today, year } = bangkokParts();
  const departments = getDepartmentsForUser(uid);

  const yr = `strftime('%Y', datetime(created_at, '+7 hours')) = ?`;
  const N = (sql, ...p) => db.prepare(sql).get(...p).c;
  const canVisit = u.role !== 'Employee' || departments.includes('Engineer') || (u.department === 'Engineer');

  // ===== สรุป 4 การ์ด (ของฉันเท่านั้น) =====
  const total = {
    visit: N(`SELECT COUNT(*) c FROM visit_requests WHERE requester_id = ? AND status NOT IN ('draft','cancelled') AND ${yr}`, uid, year),
    leave: N(`SELECT COUNT(*) c FROM leave_requests WHERE requester_id = ? AND status NOT IN ('draft','cancelled') AND ${yr}`, uid, year),
    ot: N(`SELECT COUNT(*) c FROM ot_requests WHERE requester_id = ? AND status NOT IN ('draft','cancelled') AND ${yr}`, uid, year)
  };
  const pending = {
    visit: N(`SELECT COUNT(*) c FROM visit_requests WHERE requester_id = ? AND status = 'pending'`, uid),
    leave: N(`SELECT COUNT(*) c FROM leave_requests WHERE requester_id = ? AND status = 'pending'`, uid),
    ot: N(`SELECT COUNT(*) c FROM ot_requests WHERE requester_id = ? AND status = 'pending'`, uid)
  };
  // กำลังดำเนินการ/ยังมีผลอยู่: Visit อนุมัติแล้วยังไม่แจ้งเสร็จสิ้น, ลา/OT อนุมัติแล้วและวันที่ยังไม่ผ่าน
  const active = {
    visit: N(`SELECT COUNT(*) c FROM visit_requests WHERE requester_id = ? AND status = 'approved' AND completed_at IS NULL`, uid),
    leave: N(`SELECT COUNT(*) c FROM leave_requests WHERE requester_id = ? AND status = 'approved' AND date_to >= ?`, uid, today),
    ot: N(`SELECT COUNT(*) c FROM ot_requests WHERE requester_id = ? AND status = 'approved' AND ot_date >= ?`, uid, today)
  };
  const todayCnt = {
    visit: N(`SELECT COUNT(*) c FROM visit_requests WHERE requester_id = ? AND status = 'approved' AND visit_date = ?`, uid, today),
    leave: N(`SELECT COUNT(*) c FROM leave_requests WHERE requester_id = ? AND status = 'approved' AND date_from <= ? AND date_to >= ?`, uid, today, today),
    ot: N(`SELECT COUNT(*) c FROM ot_requests WHERE requester_id = ? AND status = 'approved' AND ot_date = ?`, uid, today)
  };
  const waitingBy = { visit: 0, leave: 0, ot: 0 };
  try {
    ['visit', 'leave', 'ot'].forEach(m => { waitingBy[m] = approvalEngine.listRequestIdsForApprover(m, uid, { onlyCurrentPending: true }).length; });
  } catch (e) { /* ไม่มีสิทธิ์อนุมัติ = 0 */ }
  const waitingMe = waitingBy.visit + waitingBy.leave + waitingBy.ot;

  // ===== วันลา: ใช้ logic เดียวกับหน้า Leave (buildLeaveSummary) + จำนวนวันที่รออนุมัติแยกต่างหาก =====
  const sum = leaveRouter.buildLeaveSummary(uid);
  const pend = db.prepare(`SELECT leave_type, COALESCE(SUM(duration_days),0) d, COUNT(*) n FROM leave_requests WHERE requester_id = ? AND status = 'pending' GROUP BY leave_type`).all(uid);
  const pendMap = {}; pend.forEach(r => { pendMap[r.leave_type] = r; });
  const leave = [
    ['ลาพักร้อน', 'vacation', true], ['ลากิจ', 'personal', true], ['ลาป่วย', 'sick', false]
  ].map(([type, k, enforced]) => ({
    type, enforced,
    total: sum[`${k}_total`], used: sum[`${k}_used`], remaining: sum[`${k}_remaining`],
    pending_days: pendMap[type] ? pendMap[type].d : 0, pending_count: pendMap[type] ? pendMap[type].n : 0
  }));

  // ===== KPI (อ่านอย่างเดียว ไม่สร้างแถวใหม่) =====
  const k = db.prepare('SELECT * FROM employee_kpi WHERE user_id = ?').get(uid);
  let kpi = null;
  if (k) {
    const cats = KPI_CATS.map(([key, label]) => ({ key, label, score: k[key] || 0 }));
    const all0 = cats.every(c => c.score === 0);
    kpi = all0 ? null : {
      overall: Math.round(cats.reduce((s, c) => s + c.score, 0) / cats.length),
      categories: cats, work_status: k.work_status, updated_at: k.updated_at
    };
  }

  // ===== คำขอล่าสุด 5 รายการ (ไม่รวมฉบับร่าง/ยกเลิก) =====
  const rows = [
    ...db.prepare(`SELECT vr.id, vr.code, c.name AS title, vr.visit_date AS d, vr.status, vr.created_at, vr.completed_at FROM visit_requests vr LEFT JOIN customers c ON c.id = vr.customer_id WHERE vr.requester_id = ? AND vr.status NOT IN ('draft','cancelled') ORDER BY vr.created_at DESC LIMIT 5`).all(uid)
      .map(r => ({ kind: 'visit', ...r, status: r.status === 'approved' && r.completed_at ? 'completed' : r.status })),
    ...db.prepare(`SELECT id, code, leave_type AS title, date_from AS d, date_to AS d2, status, created_at FROM leave_requests WHERE requester_id = ? AND status NOT IN ('draft','cancelled') ORDER BY created_at DESC LIMIT 5`).all(uid).map(r => ({ kind: 'leave', ...r })),
    ...db.prepare(`SELECT id, code, COALESCE(NULLIF(work_detail,''), 'OT') AS title, ot_date AS d, status, created_at FROM ot_requests WHERE requester_id = ? AND status NOT IN ('draft','cancelled') ORDER BY created_at DESC LIMIT 5`).all(uid).map(r => ({ kind: 'ot', ...r }))
  ].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 5);

  res.json({
    user: { ...u, departments, can_visit: canVisit },
    today, year,
    counts: { total, pending, active, today: todayCnt, waiting_me: waitingMe, waiting_by: waitingBy },
    leave,
    leave_totals: {
      days: sum.total_days_used, hours: sum.total_hours_used,
      counts: { vacation: sum.by_type['ลาพักร้อน'].cnt, personal: sum.by_type['ลากิจ'].cnt, sick: sum.by_type['ลาป่วย'].cnt }
    },
    kpi, recent: rows
  });
});

module.exports = router;
