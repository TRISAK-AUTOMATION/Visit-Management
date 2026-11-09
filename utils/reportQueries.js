// utils/reportQueries.js - ตัวสร้าง Query สำหรับรายงาน Visit / OT / Leave
// ใช้ชุดเงื่อนไขเดียวกันทั้ง "ตารางบนหน้าเว็บ", "ตัวเลขสรุป" และ "ไฟล์ Export" เพื่อไม่ให้ตัวเลขไม่ตรงกัน
// ทุกค่าจากผู้ใช้ผ่าน parameterized query เท่านั้น (ชื่อ column ที่ใช้เรียงมาจาก allowlist ในไฟล์นี้)
const db = require('../db/database');

const HOURS_PER_DAY = 8; // ตรงกับ routes/report.js (ลารายชั่วโมง 8 ชม. = 1 วัน)

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00Z').getTime());
const isId = (v) => /^\d+$/.test(String(v || ''));
const likeEsc = (s) => '%' + String(s).replace(/[\\%_]/g, (m) => '\\' + m) + '%';

const STATUS_FILTERS = {
  visit: ['pending', 'revision', 'approved', 'completed', 'rejected', 'cancelled'],
  ot: ['pending', 'revision', 'approved', 'rejected', 'cancelled'],
  leave: ['pending', 'revision', 'approved', 'rejected', 'cancelled']
};

const STATUS_LABEL = {
  visit: { pending: 'รออนุมัติ', revision: 'รอแก้ไข', approved: 'Approve@Visiting', completed: 'Visit Completed', rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิกแล้ว' },
  ot: { pending: 'รออนุมัติ', revision: 'รอแก้ไข', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิกแล้ว' },
  leave: { pending: 'รออนุมัติ', revision: 'รอแก้ไข', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิกแล้ว' }
};

const LEAVE_TYPES = ['ลากิจ', 'ลาป่วย', 'ลาพักร้อน'];
const DAY_TYPE_LABEL = { workday: 'วันทำงาน', holiday: 'วันหยุด' };

// คอลัมน์ของแต่ละรายงาน: key ตรงกับ field ที่ query ส่งกลับ, w = น้ำหนักความกว้างใน PDF, type = ชนิดข้อมูลใน Excel
const COLUMNS = {
  visit: [
    { key: 'code', label: 'Visit ID', w: 9, type: 'text' },
    { key: 'visit_date', label: 'Visit Date', w: 8, type: 'date' },
    { key: 'employee', label: 'Employee', w: 12, type: 'text' },
    { key: 'department', label: 'Department', w: 8, type: 'text' },
    { key: 'customer', label: 'Customer / Company', w: 16, type: 'text' },
    { key: 'participants', label: 'Accompanied By', w: 12, type: 'text' },
    { key: 'purpose', label: 'Purpose', w: 16, type: 'text' },
    { key: 'location', label: 'Location', w: 10, type: 'text' },
    { key: 'job_type', label: 'Job Type', w: 8, type: 'text' },
    { key: 'time_from', label: 'Time Out', w: 6, type: 'time' },
    { key: 'time_to', label: 'Time In', w: 6, type: 'time' },
    { key: 'status_label', label: 'Status', w: 9, type: 'text' },
    { key: 'approver', label: 'Approver', w: 10, type: 'text' }
  ],
  ot: [
    { key: 'code', label: 'OT ID', w: 9, type: 'text' },
    { key: 'request_date', label: 'Request Date', w: 8, type: 'date' },
    { key: 'ot_date', label: 'OT Date', w: 8, type: 'date' },
    { key: 'employee', label: 'Employee', w: 12, type: 'text' },
    { key: 'department', label: 'Department', w: 8, type: 'text' },
    { key: 'company', label: 'Company', w: 6, type: 'text' },
    { key: 'time_from', label: 'Start Time', w: 6, type: 'time' },
    { key: 'time_to', label: 'End Time', w: 6, type: 'time' },
    { key: 'hours', label: 'OT Hours', w: 6, type: 'number' },
    { key: 'day_type_label', label: 'Day Type', w: 7, type: 'text' },
    { key: 'ot_type', label: 'OT Type', w: 8, type: 'text' },
    { key: 'customer', label: 'Customer', w: 12, type: 'text' },
    { key: 'job_no', label: 'Job No.', w: 8, type: 'text' },
    { key: 'reason', label: 'Reason', w: 16, type: 'text' },
    { key: 'status_label', label: 'Status', w: 8, type: 'text' },
    { key: 'approver', label: 'Approver', w: 10, type: 'text' }
  ],
  leave: [
    { key: 'code', label: 'Leave ID', w: 9, type: 'text' },
    { key: 'request_date', label: 'Request Date', w: 8, type: 'date' },
    { key: 'employee', label: 'Employee', w: 12, type: 'text' },
    { key: 'department', label: 'Department', w: 8, type: 'text' },
    { key: 'leave_type', label: 'Leave Type', w: 8, type: 'text' },
    { key: 'date_from', label: 'Start Date', w: 8, type: 'date' },
    { key: 'date_to', label: 'End Date', w: 8, type: 'date' },
    { key: 'days', label: 'Leave Days', w: 6, type: 'number' },
    { key: 'reason', label: 'Reason', w: 18, type: 'text' },
    { key: 'status_label', label: 'Status', w: 8, type: 'text' },
    { key: 'approver', label: 'Approver', w: 10, type: 'text' }
  ],
  summary: [
    { key: 'username', label: 'Employee ID', w: 9, type: 'text' },
    { key: 'full_name', label: 'Employee Name', w: 16, type: 'text' },
    { key: 'department', label: 'Department', w: 10, type: 'text' },
    { key: 'position', label: 'Position', w: 12, type: 'text' },
    { key: 'visits', label: 'Approved Visits', w: 7, type: 'number' },
    { key: 'ot_hours', label: 'Approved OT Hours', w: 8, type: 'number' },
    { key: 'leave_days', label: 'Approved Leave Days', w: 8, type: 'number' },
    { key: 'late', label: 'Late Count', w: 6, type: 'number' },
    { key: 'absent', label: 'Absent Count', w: 6, type: 'number' },
    { key: 'pending', label: 'Pending', w: 6, type: 'number' }
  ]
};

const DEFAULT_COLUMNS = {
  visit: ['visit_date', 'employee', 'department', 'customer', 'participants', 'purpose', 'time_from', 'time_to', 'status_label'],
  ot: ['ot_date', 'employee', 'department', 'company', 'time_from', 'time_to', 'hours', 'reason', 'status_label'],
  leave: ['request_date', 'employee', 'department', 'leave_type', 'date_from', 'date_to', 'days', 'status_label'],
  summary: ['username', 'full_name', 'department', 'position', 'visits', 'ot_hours', 'leave_days', 'late', 'absent']
};

const TITLES = { visit: 'Visit Report', ot: 'OT Report', leave: 'Leave Report', summary: 'Employee Summary Report' };

// นิยามต่อประเภท: ตาราง, alias, และชิ้น SQL ที่ต่างกัน
const CUSTOMER_EXPR = `COALESCE(NULLIF(c.name, ''), NULLIF(vr.company, ''), '')`;
const DEFS = {
  visit: {
    from: `FROM visit_requests vr
           JOIN users u ON u.id = vr.requester_id
           LEFT JOIN customers c ON c.id = vr.customer_id
           LEFT JOIN users a ON a.id = vr.approver_id`,
    a: 'vr',
    stageExpr: `CASE WHEN vr.status = 'approved' AND vr.completed_at IS NOT NULL THEN 'completed' ELSE vr.status END`,
    select: `vr.id, vr.code, vr.visit_date, u.full_name AS employee, u.department AS department, vr.requester_id,
             ${CUSTOMER_EXPR} AS customer, vr.participants, vr.purpose, vr.objective_json, vr.location, vr.job_type,
             vr.time_from, vr.time_to, a.full_name AS approver,
             CASE WHEN vr.status = 'approved' AND vr.completed_at IS NOT NULL THEN 'completed' ELSE vr.status END AS status`,
    sorts: {
      visit_date: 'vr.visit_date', code: 'vr.code', employee: 'u.full_name', department: 'u.department',
      customer: CUSTOMER_EXPR, status: 'vr.status', time_from: 'vr.time_from', time_to: 'vr.time_to'
    },
    defaultOrder: 'vr.visit_date DESC, vr.time_from DESC',
    search: [`u.full_name`, CUSTOMER_EXPR, 'vr.code', 'vr.purpose', 'vr.participants', 'vr.location']
  },
  ot: {
    from: `FROM ot_requests o
           JOIN users u ON u.id = o.requester_id
           LEFT JOIN customers c ON c.id = o.customer_id
           LEFT JOIN users a ON a.id = o.approver_id`,
    a: 'o',
    select: `o.id, o.code, date(o.created_at, '+7 hours') AS request_date, o.ot_date, u.full_name AS employee, u.department AS department,
             o.requester_id, o.time_from, o.time_to, o.hours, o.day_type, o.ot_type, o.company, c.name AS customer, o.job_no, o.reason,
             a.full_name AS approver, o.status`,
    sorts: {
      ot_date: 'o.ot_date', request_date: 'o.created_at', code: 'o.code', employee: 'u.full_name', department: 'u.department',
      hours: 'o.hours', status: 'o.status', time_from: 'o.time_from', company: 'o.company'
    },
    defaultOrder: 'o.ot_date DESC, o.time_from DESC',
    search: ['u.full_name', 'o.code', 'o.reason', 'o.job_no', 'c.name', 'o.company']
  },
  leave: {
    from: `FROM leave_requests lr
           JOIN users u ON u.id = lr.requester_id
           LEFT JOIN users a ON a.id = lr.approver_id`,
    a: 'lr',
    select: `lr.id, lr.code, date(lr.created_at, '+7 hours') AS request_date, u.full_name AS employee, u.department AS department,
             lr.requester_id, lr.leave_type, lr.leave_mode, lr.date_from, lr.date_to,
             ROUND(lr.duration_days + lr.duration_hours / ${HOURS_PER_DAY}.0, 2) AS days,
             lr.reason, a.full_name AS approver, lr.status`,
    sorts: {
      date_from: 'lr.date_from', date_to: 'lr.date_to', request_date: 'lr.created_at', code: 'lr.code', employee: 'u.full_name',
      department: 'u.department', leave_type: 'lr.leave_type', days: '(lr.duration_days + lr.duration_hours / 8.0)', status: 'lr.status'
    },
    defaultOrder: 'lr.date_from DESC',
    search: ['u.full_name', 'lr.code', 'lr.reason', 'lr.leave_type']
  }
};

// ตรวจและทำความสะอาด filter จาก query string -> { filters } หรือ { error }
function parseFilters(type, q) {
  const f = {};
  if (q.from) { if (!isDate(q.from)) return { error: 'รูปแบบวันที่เริ่มต้นไม่ถูกต้อง' }; f.from = q.from; }
  if (q.to) { if (!isDate(q.to)) return { error: 'รูปแบบวันที่สิ้นสุดไม่ถูกต้อง' }; f.to = q.to; }
  if (f.from && f.to && f.from > f.to) return { error: 'วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด' };
  if (q.department) f.department = String(q.department).slice(0, 100);
  if (q.user_id) { if (!isId(q.user_id)) return { error: 'พนักงานที่เลือกไม่ถูกต้อง' }; f.user_id = Number(q.user_id); }
  if (q.status) {
    if (!STATUS_FILTERS[type] || !STATUS_FILTERS[type].includes(q.status)) return { error: 'สถานะที่เลือกไม่ถูกต้อง' };
    f.status = q.status;
  }
  if (type === 'visit') {
    if (q.customer_id) { if (!isId(q.customer_id)) return { error: 'บริษัทลูกค้าที่เลือกไม่ถูกต้อง' }; f.customer_id = Number(q.customer_id); }
    if (q.accompanied) f.accompanied = String(q.accompanied).trim().slice(0, 100);
  }
  if (type === 'leave' && q.leave_type) {
    if (!LEAVE_TYPES.includes(q.leave_type)) return { error: 'ประเภทการลาไม่ถูกต้อง' };
    f.leave_type = q.leave_type;
  }
  if (q.q) f.q = String(q.q).trim().slice(0, 100);
  return { filters: f };
}

// สร้าง WHERE ตามสิทธิ์: ผู้ที่ไม่ใช่ Approver/Admin เห็นเฉพาะของตัวเองเสมอ (ไม่ดูค่า user_id/department จาก client)
// opts.ignoreFilters = true ใช้กับ Export แบบ Full Report (ทั้งหมดภายในสิทธิ์)
function buildWhere(type, filters, scope, opts = {}) {
  const d = DEFS[type];
  const A = d.a;
  const where = [];
  const params = [];
  const f = opts.ignoreFilters ? {} : filters;

  if (!scope.mgr) { where.push(`${A}.requester_id = ?`); params.push(scope.userId); }
  else {
    if (f.user_id) { where.push(`${A}.requester_id = ?`); params.push(f.user_id); }
    if (f.department) {
      where.push(`(u.department = ? OR EXISTS (SELECT 1 FROM user_departments ud WHERE ud.user_id = u.id AND ud.department = ?))`);
      params.push(f.department, f.department);
    }
  }

  // ช่วงวันที่: Visit/OT ใช้วันที่ทำรายการจริง, Leave ใช้ช่วงวันลาที่ทับกับช่วงที่เลือก
  if (type === 'leave') {
    if (f.from) { where.push('lr.date_to >= ?'); params.push(f.from); }
    if (f.to) { where.push('lr.date_from <= ?'); params.push(f.to); }
  } else {
    const col = type === 'visit' ? 'vr.visit_date' : 'o.ot_date';
    if (f.from) { where.push(`${col} >= ?`); params.push(f.from); }
    if (f.to) { where.push(`${col} <= ?`); params.push(f.to); }
  }

  // ฉบับร่างเป็นส่วนตัวของผู้ขอ ไม่แสดงในรายงานเสมอ / รายการที่ยกเลิกแสดงเฉพาะเมื่อเลือกสถานะ "ยกเลิก"
  if (f.status) {
    if (type === 'visit' && f.status === 'approved') where.push(`vr.status = 'approved' AND vr.completed_at IS NULL`);
    else if (type === 'visit' && f.status === 'completed') where.push(`vr.status = 'approved' AND vr.completed_at IS NOT NULL`);
    else { where.push(`${A}.status = ?`); params.push(f.status); }
  } else {
    where.push(`${A}.status NOT IN ('draft', 'cancelled')`);
  }

  if (type === 'visit') {
    if (f.customer_id) { where.push('vr.customer_id = ?'); params.push(f.customer_id); }
    if (f.accompanied) { where.push(`vr.participants LIKE ? ESCAPE '\\'`); params.push(likeEsc(f.accompanied)); }
  }
  if (type === 'leave' && f.leave_type) { where.push('lr.leave_type = ?'); params.push(f.leave_type); }

  if (f.q) {
    where.push('(' + d.search.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(' OR ') + ')');
    d.search.forEach(() => params.push(likeEsc(f.q)));
  }
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

function orderBy(type, sort, dir) {
  const d = DEFS[type];
  const col = d.sorts[sort];
  const A = d.a;
  if (!col) return `ORDER BY ${d.defaultOrder}, ${A}.id DESC`;
  return `ORDER BY ${col} ${dir === 'asc' ? 'ASC' : 'DESC'}, ${A}.id DESC`; // id เป็นตัวตัดสินลำดับ ทำให้แบ่งหน้าแล้วไม่ซ้ำ/ไม่ขาด
}

// สรุปตัวเลขจากชุดเงื่อนไขเดียวกับตาราง
function summarize(type, w) {
  const d = DEFS[type];
  let cols;
  if (type === 'visit') {
    cols = `COUNT(*) AS total, COUNT(DISTINCT vr.requester_id) AS employees, COUNT(DISTINCT vr.customer_id) AS companies,
            COALESCE(SUM(vr.status = 'pending'), 0) AS pending,
            COALESCE(SUM(vr.status = 'approved' AND vr.completed_at IS NOT NULL), 0) AS completed`;
  } else if (type === 'ot') {
    cols = `COUNT(*) AS total, COUNT(DISTINCT o.requester_id) AS employees,
            COALESCE(SUM(o.status = 'pending'), 0) AS pending,
            COALESCE(SUM(CASE WHEN o.status = 'approved' THEN o.hours ELSE 0 END), 0) AS approved_hours,
            COALESCE(SUM(CASE WHEN o.status = 'pending' THEN o.hours ELSE 0 END), 0) AS pending_hours`;
  } else {
    cols = `COUNT(*) AS total, COUNT(DISTINCT lr.requester_id) AS employees,
            COALESCE(SUM(lr.status = 'pending'), 0) AS pending,
            COALESCE(SUM(CASE WHEN lr.status = 'approved' THEN lr.duration_days + lr.duration_hours / ${HOURS_PER_DAY}.0 ELSE 0 END), 0) AS approved_days,
            COALESCE(SUM(CASE WHEN lr.status = 'pending' THEN lr.duration_days + lr.duration_hours / ${HOURS_PER_DAY}.0 ELSE 0 END), 0) AS pending_days`;
  }
  const row = db.prepare(`SELECT ${cols} ${d.from} ${w.sql}`).get(...w.params);
  ['approved_hours', 'pending_hours', 'approved_days', 'pending_days'].forEach((k) => {
    if (row[k] !== undefined) row[k] = Math.round(row[k] * 10) / 10;
  });
  return row;
}

// ปรับแถวดิบให้พร้อมแสดง/ส่งออก (ป้ายสถานะ, วัตถุประสงค์สำรองสำหรับ Visit)
function decorate(type, r) {
  const out = { ...r };
  out.status_label = (STATUS_LABEL[type] || {})[r.status] || r.status;
  if (type === 'visit') {
    if (!out.purpose && out.objective_json) {
      try {
        const o = JSON.parse(out.objective_json);
        const items = Array.isArray(o && o.items) ? o.items : [];
        out.purpose = [...items, o && o.other ? o.other : ''].filter(Boolean).join(', ');
      } catch (e) { /* ข้อมูลเก่า ไม่มี objective */ }
    }
    delete out.objective_json;
  }
  if (type === 'ot') out.day_type_label = DAY_TYPE_LABEL[r.day_type] || '';
  return out;
}

function listRows(type, w, { sort, dir, limit, offset }) {
  const d = DEFS[type];
  const sql = `SELECT ${d.select} ${d.from} ${w.sql} ${orderBy(type, sort, dir)} LIMIT ? OFFSET ?`;
  return db.prepare(sql).all(...w.params, limit, offset).map((r) => decorate(type, r));
}

module.exports = {
  DEFS, COLUMNS, DEFAULT_COLUMNS, TITLES, STATUS_FILTERS, STATUS_LABEL, LEAVE_TYPES, DAY_TYPE_LABEL, HOURS_PER_DAY,
  isDate, isId, parseFilters, buildWhere, summarize, listRows, decorate
};
