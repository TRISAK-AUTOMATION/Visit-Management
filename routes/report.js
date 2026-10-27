// routes/report.js - Management Report (ภาพรวมการทำงานของพนักงาน) สำหรับ Approver / Admin เท่านั้น
// ดึงข้อมูลจริงจากตารางเดิม (visit_requests / leave_requests / ot_requests / users / employee_kpi) ไม่สร้างข้อมูลซ้ำ
//
// นิยามตัวเลข (ใช้ตรงกันทั้งหน้าภาพรวมและหน้ารายบุคคล):
//  - Visit        = จำนวนคำขอ Visit ที่ "อนุมัติแล้ว" และ visit_date อยู่ในช่วงที่เลือก
//  - Leave (วัน)  = การลาที่ "อนุมัติแล้ว" ที่ช่วงวันลาทับช่วงที่เลือก: duration_days + duration_hours/8 (ลารายชั่วโมง 8 ชม. = 1 วัน)
//  - OT (ชม.)     = ผลรวม hours ของ OT ที่ "อนุมัติแล้ว" และ ot_date อยู่ในช่วงที่เลือก
//  - Pending      = คำขอสถานะ "รออนุมัติ" (Visit/ลา/OT) ที่วันที่ของคำขออยู่ในช่วงที่เลือก
//  - Late/Absent  = ยอดสะสมที่หัวหน้ากรอกเองในหน้า KPI (ระบบยังไม่มีข้อมูลเวลาเข้างานรายวัน จึงกรองตามช่วงเวลาไม่ได้)
const express = require('express');
const db = require('../db/database');
const { requireAuth, requireRole } = require('./middleware');
const { getDepartments } = require('../utils/departments');

const router = express.Router();
// ทุกคนที่ login เข้าได้ แต่แยกสิทธิ์รายเส้นทาง:
//  - /overview  : เฉพาะ Approver/Admin (ภาพรวมทุกคน)
//  - /employee/:id : Approver/Admin ดูได้ทุกคน, พนักงานทั่วไปดูได้เฉพาะของตัวเอง
router.use(requireAuth);

const HOURS_PER_DAY = 8;
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

function parseRange(q) {
  const from = isDate(q.from) ? q.from : '0000-01-01';
  const to = isDate(q.to) ? q.to : '9999-12-31';
  return { from, to, hasFrom: isDate(q.from), hasTo: isDate(q.to) };
}

// รายชื่อพนักงานที่อยู่ในตัวกรอง (แผนก / พนักงานรายคน) - เฉพาะบัญชีที่ยังใช้งานอยู่
function selectEmployees(q) {
  const where = ['u.is_active = 1'];
  const params = [];
  if (q.department) {
    where.push(`(u.department = ? OR EXISTS (SELECT 1 FROM user_departments ud WHERE ud.user_id = u.id AND ud.department = ?))`);
    params.push(q.department, q.department);
  }
  if (q.user_id && /^\d+$/.test(String(q.user_id))) {
    where.push('u.id = ?');
    params.push(Number(q.user_id));
  }
  return db.prepare(`
    SELECT u.id, u.username, u.full_name, u.position, u.department, u.role, u.avatar_url, u.is_active
    FROM users u WHERE ${where.join(' AND ')} ORDER BY u.full_name
  `).all(...params);
}

const inList = (ids) => ids.map(() => '?').join(',');

// รวมตัวเลขต่อพนักงาน (Map userId -> {...})
function aggregatePerUser(ids, { from, to }) {
  const out = new Map(ids.map(id => [id, { visits: 0, leave_days: 0, leave_count: 0, ot_hours: 0, pending: 0 }]));
  if (!ids.length) return out;
  const ph = inList(ids);

  db.prepare(`SELECT requester_id AS id, COUNT(*) c FROM visit_requests
              WHERE status='approved' AND visit_date BETWEEN ? AND ? AND requester_id IN (${ph}) GROUP BY requester_id`)
    .all(from, to, ...ids).forEach(r => { out.get(r.id).visits = r.c; });

  db.prepare(`SELECT requester_id AS id, COUNT(*) c, SUM(duration_days + duration_hours / ${HOURS_PER_DAY}.0) d FROM leave_requests
              WHERE status='approved' AND date_to >= ? AND date_from <= ? AND requester_id IN (${ph}) GROUP BY requester_id`)
    .all(from, to, ...ids).forEach(r => { const o = out.get(r.id); o.leave_count = r.c; o.leave_days = round1(r.d); });

  db.prepare(`SELECT requester_id AS id, SUM(hours) h FROM ot_requests
              WHERE status='approved' AND ot_date BETWEEN ? AND ? AND requester_id IN (${ph}) GROUP BY requester_id`)
    .all(from, to, ...ids).forEach(r => { out.get(r.id).ot_hours = round1(r.h); });

  [
    ['visit_requests', 'visit_date', 'visit_date BETWEEN ? AND ?'],
    ['leave_requests', 'date_from', 'date_to >= ? AND date_from <= ?'],
    ['ot_requests', 'ot_date', 'ot_date BETWEEN ? AND ?']
  ].forEach(([table, , dateWhere]) => {
    db.prepare(`SELECT requester_id AS id, COUNT(*) c FROM ${table}
                WHERE status='pending' AND ${dateWhere} AND requester_id IN (${ph}) GROUP BY requester_id`)
      .all(from, to, ...ids).forEach(r => { out.get(r.id).pending += r.c; });
  });
  return out;
}

function kpiCounters(ids) {
  const map = new Map(ids.map(id => [id, { late: 0, absent: 0 }]));
  if (!ids.length) return map;
  db.prepare(`SELECT user_id, late_count, absent_count FROM employee_kpi WHERE user_id IN (${inList(ids)})`)
    .all(...ids).forEach(r => { map.set(r.user_id, { late: r.late_count || 0, absent: r.absent_count || 0 }); });
  return map;
}

// รายการเดือน YYYY-MM ในช่วงที่เลือก (ไม่ระบุช่วง = 12 เดือนล่าสุด, จำกัดสูงสุด 24 เดือน)
function monthList(range) {
  const now = new Date();
  let start, end;
  if (range.hasFrom) { const [y, m] = range.from.split('-').map(Number); start = new Date(y, m - 1, 1); }
  else start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  if (range.hasTo) { const [y, m] = range.to.split('-').map(Number); end = new Date(y, m - 1, 1); }
  else end = new Date(now.getFullYear(), now.getMonth(), 1);
  if (end < start) end = start;
  const list = [];
  for (let d = new Date(start); d <= end && list.length < 24; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    list.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  // ถ้าช่วงยาวเกิน 24 เดือน ให้แสดง 24 เดือนล่าสุดของช่วง
  return list;
}

function monthlySeries(ids, range) {
  const months = monthList(range);
  const idx = new Map(months.map((m, i) => [m, i]));
  const series = months.map(m => ({ month: m, visits: 0, leave_days: 0, ot_hours: 0 }));
  if (!ids.length) return series;
  const ph = inList(ids);
  const lo = months[0] + '-01', hi = months[months.length - 1] + '-31';
  const from = range.hasFrom ? (range.from > lo ? range.from : lo) : lo;
  const to = range.hasTo ? (range.to < hi ? range.to : hi) : hi;

  db.prepare(`SELECT substr(visit_date,1,7) m, COUNT(*) c FROM visit_requests
              WHERE status='approved' AND visit_date BETWEEN ? AND ? AND requester_id IN (${ph}) GROUP BY m`)
    .all(from, to, ...ids).forEach(r => { if (idx.has(r.m)) series[idx.get(r.m)].visits = r.c; });
  db.prepare(`SELECT substr(date_from,1,7) m, SUM(duration_days + duration_hours / ${HOURS_PER_DAY}.0) d FROM leave_requests
              WHERE status='approved' AND date_from BETWEEN ? AND ? AND requester_id IN (${ph}) GROUP BY m`)
    .all(from, to, ...ids).forEach(r => { if (idx.has(r.m)) series[idx.get(r.m)].leave_days = round1(r.d); });
  db.prepare(`SELECT substr(ot_date,1,7) m, SUM(hours) h FROM ot_requests
              WHERE status='approved' AND ot_date BETWEEN ? AND ? AND requester_id IN (${ph}) GROUP BY m`)
    .all(from, to, ...ids).forEach(r => { if (idx.has(r.m)) series[idx.get(r.m)].ot_hours = round1(r.h); });
  return series;
}

// ---------- ภาพรวม ----------
// GET /api/report/overview?from=&to=&department=&user_id=
router.get('/overview', requireRole('Approver', 'Admin'), (req, res) => {
  try {
    const range = parseRange(req.query);
    const employees = selectEmployees(req.query);
    const ids = employees.map(e => e.id);
    const per = aggregatePerUser(ids, range);
    const kpi = kpiCounters(ids);

    const rows = employees.map(e => {
      const a = per.get(e.id), k = kpi.get(e.id);
      return {
        id: e.id, username: e.username, full_name: e.full_name, position: e.position, department: e.department,
        role: e.role, avatar_url: e.avatar_url, is_active: !!e.is_active,
        visits: a.visits, leave_days: a.leave_days, ot_hours: a.ot_hours, pending: a.pending,
        late: k.late, absent: k.absent,
        // Total Activity = Visit (ครั้ง) + OT (ชม.) + Leave (วัน) ตามตัวอย่างในสเปก — ใช้ดูภาพรวมกิจกรรม ไม่ใช่คะแนนผลงาน
        total_activity: round1(a.visits + a.ot_hours + a.leave_days)
      };
    });

    const sum = (f) => rows.reduce((s, r) => s + (r[f] || 0), 0);
    res.json({
      range: { from: range.hasFrom ? range.from : null, to: range.hasTo ? range.to : null },
      summary: {
        employees: rows.length,
        visits: sum('visits'),
        leave_days: round1(sum('leave_days')),
        late: sum('late'), absent: sum('absent'),
        ot_hours: round1(sum('ot_hours')),
        pending: sum('pending')
      },
      attendance_note: 'มาสาย/ขาดงาน เป็นยอดสะสมที่หัวหน้ากรอกเองในหน้า KPI (ยังไม่มีข้อมูลเวลาเข้างานรายวัน จึงไม่เปลี่ยนตามช่วงเวลา)',
      monthly: monthlySeries(ids, range),
      employees: rows,
      // ตัวเลือกสำหรับ dropdown ตัวกรอง (ไม่ขึ้นกับตัวกรองที่เลือกอยู่)
      options: {
        departments: getDepartments(),
        employees: db.prepare(`SELECT id, full_name, department FROM users WHERE is_active = 1 ORDER BY full_name`).all()
      }
    });
  } catch (err) {
    console.error('report overview error:', err);
    res.status(500).json({ error: 'ไม่สามารถโหลดรายงานได้' });
  }
});

// ---------- รายบุคคล ----------
// GET /api/report/employee/:id?from=&to=
router.get('/employee/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const isManager = req.session.role === 'Approver' || req.session.role === 'Admin';
    if (!isManager && Number(req.session.userId) !== id) {
      return res.status(403).json({ error: 'คุณดูได้เฉพาะรายงานของตัวเอง' });
    }
    const user = db.prepare(`SELECT id, username, full_name, position, department, role, avatar_url, is_active, email, phone FROM users WHERE id = ?`).get(id);
    if (!user) return res.status(404).json({ error: 'ไม่พบพนักงาน' });
    const range = parseRange(req.query);
    const { from, to } = range;

    const per = aggregatePerUser([id], range).get(id);
    const k = kpiCounters([id]).get(id);

    // รายการละเอียด (ไม่รวมฉบับร่าง/ยกเลิก — ฉบับร่างเป็นส่วนตัวของผู้ขอ)
    const visits = db.prepare(`
      SELECT vr.id, vr.code, vr.visit_date, vr.time_from, vr.time_to, vr.purpose, vr.location, vr.participants, vr.status,
             vr.approved_at, c.name AS customer_name, a.full_name AS approver_name
      FROM visit_requests vr JOIN customers c ON c.id = vr.customer_id
      LEFT JOIN users a ON a.id = vr.approver_id
      WHERE vr.requester_id = ? AND vr.status NOT IN ('draft','cancelled') AND vr.visit_date BETWEEN ? AND ?
      ORDER BY vr.visit_date DESC, vr.time_from DESC
    `).all(id, from, to);

    const leaves = db.prepare(`
      SELECT lr.id, lr.code, lr.leave_type, lr.leave_mode, lr.date_from, lr.date_to, lr.time_from, lr.time_to,
             lr.duration_days, lr.duration_hours, lr.reason, lr.status, a.full_name AS approver_name
      FROM leave_requests lr LEFT JOIN users a ON a.id = lr.approver_id
      WHERE lr.requester_id = ? AND lr.status NOT IN ('draft','cancelled') AND lr.date_to >= ? AND lr.date_from <= ?
      ORDER BY lr.date_from DESC
    `).all(id, from, to);

    const ots = db.prepare(`
      SELECT o.id, o.code, o.ot_date, o.time_from, o.time_to, o.hours, o.ot_type, o.reason, o.work_detail, o.status, a.full_name AS approver_name
      FROM ot_requests o LEFT JOIN users a ON a.id = o.approver_id
      WHERE o.requester_id = ? AND o.status NOT IN ('draft','cancelled') AND o.ot_date BETWEEN ? AND ?
      ORDER BY o.ot_date DESC, o.time_from DESC
    `).all(id, from, to);

    res.json({
      user: { ...user, is_active: !!user.is_active },
      range: { from: range.hasFrom ? range.from : null, to: range.hasTo ? range.to : null },
      summary: { visits: per.visits, leave_days: per.leave_days, ot_hours: per.ot_hours, pending: per.pending, late: k.late, absent: k.absent },
      attendance_note: 'มาสาย/ขาดงาน เป็นยอดสะสมที่หัวหน้ากรอกเองในหน้า KPI (ยังไม่มีข้อมูลเวลาเข้างานรายวัน จึงไม่เปลี่ยนตามช่วงเวลา และไม่มีวันที่ให้แสดงบนปฏิทิน)',
      monthly: monthlySeries([id], range),
      visits, leaves, ots
    });
  } catch (err) {
    console.error('report employee error:', err);
    res.status(500).json({ error: 'ไม่สามารถโหลดรายงานพนักงานได้' });
  }
});

// ให้ routes/reportData.js ใช้นิยามเดียวกัน (Employee Summary ต้องตรงกับหน้าภาพรวมเดิมเสมอ)
router.helpers = { selectEmployees, aggregatePerUser, kpiCounters, parseRange, round1 };

module.exports = router;
