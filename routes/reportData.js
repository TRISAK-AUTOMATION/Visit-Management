// routes/reportData.js - รายงาน Visit / OT / Leave / Employee Summary (ตาราง + สรุป + รายละเอียด + Export Excel/PDF)
// อ่านข้อมูลอย่างเดียว ไม่แก้ไขคำขอ/สถานะใดๆ
// สิทธิ์ (ตรวจที่ Backend ทุกครั้ง ไม่เชื่อค่าจาก Frontend):
//  - Approver / Admin  : เห็นข้อมูลทุกคน ใช้ตัวกรองแผนก/พนักงานได้
//  - พนักงานทั่วไป      : เห็น/ส่งออกได้เฉพาะของตัวเอง (ระบบบังคับ requester_id = ตัวเอง)
//  - Employee Summary   : เฉพาะ Approver / Admin
const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('./middleware');
const { getDepartments } = require('../utils/departments');
const { logAction } = require('../utils/systemLog');
const Q = require('../utils/reportQueries');
const { companyLabel } = require('../utils/companies');
const approvalEngine = require('../utils/approvalEngine');
const { canViewAll } = require('../utils/viewScope');
const X = require('../utils/reportExport');
const baseReport = require('./report');

const router = express.Router();
router.use(requireAuth);

const MAX_XLSX_ROWS = 20000;
const MAX_PDF_ROWS = 2000;
const TYPES = ['visit', 'ot', 'leave'];

const scopeOf = (req) => ({ mgr: ['Approver', 'Admin'].includes(req.session.role), userId: req.session.userId });
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const fail = (res, err, msg) => { console.error('[report]', err.message); return res.status(500).json({ error: msg }); };

function pageParams(q) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const size = Math.min(100, Math.max(5, parseInt(q.page_size, 10) || 20));
  return { page, size, offset: (page - 1) * size };
}

// ---------- ตัวเลือก dropdown ----------
// GET /api/report/options
router.get('/options', (req, res) => {
  try {
    const sc = scopeOf(req);
    const employees = sc.mgr
      ? db.prepare(`SELECT id, full_name, department FROM users WHERE is_active = 1 ORDER BY full_name`).all()
      : db.prepare(`SELECT id, full_name, department FROM users WHERE id = ?`).all(sc.userId);
    const customers = sc.mgr
      ? db.prepare(`SELECT id, name FROM customers WHERE name <> '' ORDER BY name LIMIT 5000`).all()
      : db.prepare(`SELECT DISTINCT c.id, c.name FROM visit_requests vr JOIN customers c ON c.id = vr.customer_id
                    WHERE vr.requester_id = ? AND c.name <> '' ORDER BY c.name`).all(sc.userId);
    const statuses = {};
    TYPES.forEach((t) => { statuses[t] = Q.STATUS_FILTERS[t].map((v) => ({ v, label: Q.STATUS_LABEL[t][v] })); });
    const columns = {};
    Object.keys(Q.COLUMNS).forEach((t) => {
      columns[t] = { list: Q.COLUMNS[t].map((c) => ({ key: c.key, label: c.label })), defaults: Q.DEFAULT_COLUMNS[t] };
    });
    res.json({
      can_view_all: sc.mgr,
      me: { id: sc.userId },
      departments: sc.mgr ? getDepartments() : [],
      // ชื่อพนักงานทั้งหมด ใช้เป็นตัวเลือก "ผู้ร่วมเดินทาง" (เห็นชื่อเพื่อนร่วมงานอยู่แล้วในฟอร์ม Visit) ไม่มีข้อมูลอื่นแนบ
      people: db.prepare(`SELECT id, full_name FROM users WHERE is_active = 1 ORDER BY full_name`).all(),
      employees, customers, statuses, leave_types: Q.LEAVE_TYPES, columns
    });
  } catch (err) { fail(res, err, 'ไม่สามารถโหลดตัวเลือกตัวกรองได้'); }
});

// ---------- ภาพรวมหน้า Reports (ตัวเลขบนการ์ด) ----------
// GET /api/report/hub?from=&to=
router.get('/hub', (req, res) => {
  try {
    const sc = scopeOf(req);
    const out = { can_view_all: sc.mgr };
    let pending = 0;
    for (const t of TYPES) {
      const p = Q.parseFilters(t, { from: req.query.from, to: req.query.to });
      if (p.error) return bad(res, p.error);
      const s = Q.summarize(t, Q.buildWhere(t, p.filters, sc));
      out[t] = s; pending += s.pending;
    }
    out.pending = pending;
    out.employees = sc.mgr ? db.prepare(`SELECT COUNT(*) c FROM users WHERE is_active = 1`).get().c : 1;
    res.json(out);
  } catch (err) { fail(res, err, 'ไม่สามารถโหลดภาพรวมรายงานได้'); }
});

// ---------- Employee Summary ----------
function summaryRows(req, sc, f, { ignoreFilters } = {}) {
  const H = baseReport.helpers;
  const q = ignoreFilters ? {} : f;
  const range = H.parseRange(ignoreFilters ? {} : { from: f.from, to: f.to });
  const employees = H.selectEmployees({ department: q.department, user_id: q.user_id });
  const ids = employees.map((e) => e.id);
  const per = H.aggregatePerUser(ids, range);
  const kpi = H.kpiCounters(ids);
  let rows = employees.map((e) => {
    const a = per.get(e.id), k = kpi.get(e.id);
    return { id: e.id, username: e.username, full_name: e.full_name, department: e.department || '', position: e.position || '',
      visits: a.visits, ot_hours: a.ot_hours, leave_days: a.leave_days, late: k.late, absent: k.absent, pending: a.pending };
  });
  if (q.q) {
    const k = q.q.toLowerCase();
    rows = rows.filter((r) => [r.full_name, r.department, r.position, r.username].some((v) => (v || '').toLowerCase().includes(k)));
  }
  return rows;
}
const SUMMARY_SORTS = ['full_name', 'department', 'position', 'username', 'visits', 'ot_hours', 'leave_days', 'late', 'absent', 'pending'];
function sortSummary(rows, sort, dir) {
  const key = SUMMARY_SORTS.includes(sort) ? sort : 'full_name';
  const mul = dir === 'desc' ? -1 : 1;
  return rows.slice().sort((a, b) => {
    const x = a[key], y = b[key];
    const c = typeof x === 'number' ? x - y : String(x || '').localeCompare(String(y || ''), 'th');
    return (c || a.id - b.id) * mul;
  });
}
const summaryTotals = (rows) => ({
  employees: rows.length,
  visits: rows.reduce((s, r) => s + r.visits, 0),
  ot_hours: Math.round(rows.reduce((s, r) => s + r.ot_hours, 0) * 10) / 10,
  leave_days: Math.round(rows.reduce((s, r) => s + r.leave_days, 0) * 10) / 10,
  pending: rows.reduce((s, r) => s + r.pending, 0)
});

// GET /api/report/list/summary  (เฉพาะ Approver/Admin)
router.get('/list/summary', (req, res) => {
  try {
    const sc = scopeOf(req);
    if (!sc.mgr) return bad(res, 'คุณไม่มีสิทธิ์เข้าถึงรายงานนี้', 403);
    const p = Q.parseFilters('summary', req.query);
    if (p.error) return bad(res, p.error);
    const all = sortSummary(summaryRows(req, sc, p.filters), req.query.sort, req.query.dir);
    const { page, size, offset } = pageParams(req.query);
    res.json({ summary: summaryTotals(all), total: all.length, page, page_size: size, rows: all.slice(offset, offset + size),
      note: 'มาสาย/ขาดงาน เป็นยอดสะสมที่หัวหน้ากรอกเองในหน้า KPI (ระบบยังไม่มีข้อมูลเวลาเข้างานรายวัน จึงไม่เปลี่ยนตามช่วงเวลา)' });
  } catch (err) { fail(res, err, 'ไม่สามารถโหลดรายงานได้'); }
});

// ---------- รายการ Visit / OT / Leave ----------
// GET /api/report/list/:type?from&to&department&user_id&customer_id&accompanied&status&leave_type&q&sort&dir&page&page_size
router.get('/list/:type', (req, res) => {
  const type = req.params.type;
  if (!TYPES.includes(type)) return bad(res, 'ไม่พบประเภทรายงาน', 404);
  try {
    const sc = scopeOf(req);
    const p = Q.parseFilters(type, req.query);
    if (p.error) return bad(res, p.error);
    const w = Q.buildWhere(type, p.filters, sc);
    const { page, size, offset } = pageParams(req.query);
    const summary = Q.summarize(type, w);
    const rows = Q.listRows(type, w, { sort: req.query.sort, dir: req.query.dir, limit: size, offset });
    res.json({ summary, total: summary.total, page, page_size: size, rows });
  } catch (err) { fail(res, err, 'ไม่สามารถโหลดรายงานได้'); }
});

// ---------- รายละเอียดรายการ (ใช้ Record ID จริง) ----------
const HIST = {
  visit: { table: 'approval_history', fk: 'visit_request_id' },
  ot: { table: 'ot_history', fk: 'ot_request_id' },
  leave: { table: 'leave_history', fk: 'leave_request_id' }
};
const MODE_LABEL = { full_day: 'เต็มวัน', half_day_morning: 'ครึ่งวัน (เช้า)', half_day_afternoon: 'ครึ่งวัน (บ่าย)', hours: 'รายชั่วโมง' };

// ข้อมูลฟอร์ม Visit ครบทุกหัวข้อ (อ่านอย่างเดียว) — สิทธิ์ตรวจแล้วที่ตัว route
const jparse = (v, fb) => { try { const x = typeof v === 'string' ? JSON.parse(v) : v; return x === null || x === undefined ? fb : x; } catch (e) { return fb; } };
function visitFull(r) {
  let contacts = jparse(r.contacts_json, []);
  if (!Array.isArray(contacts) || !contacts.length) contacts = r.contact_person ? [{ name: r.contact_person, telephone: r.contact_phone || '' }] : [];
  const pick = (keys) => Object.fromEntries(keys.map((k) => [k, r[k] === null || r[k] === undefined ? '' : r[k]]));
  return {
    info: pick(['request_date', 'visit_date', 'time_from', 'time_to', 'company', 'customer_name', 'job_type', 'sales_person', 'purpose', 'location', 'product',
      'transport', 'license_plate', 'mileage_out', 'mileage_in', 'actual_time_out', 'actual_time_back', 'ot_hours', 'meeting_start', 'meeting_end', 'participants', 'notes', 'employee', 'dept',
      'customer_type', 'customer_tax_id', 'tax_invoice_date', 'customer_code', 'customer_address']),
    contacts,
    objective: jparse(r.objective_json, {}) || {},
    during: jparse(r.during_visit_json, {}) || {},
    opportunity: jparse(r.opportunity_json, {}) || {},
    plan: jparse(r.action_plan_json, {}) || {},
    level: jparse(r.customer_level_json, {}) || {},
    next: jparse(r.next_visit_json, {}) || {}
  };
}

// GET /api/report/detail/:type/:id
router.get('/detail/:type/:id', (req, res) => {
  const type = req.params.type;
  if (!TYPES.includes(type) || !Q.isId(req.params.id)) return bad(res, 'ไม่พบรายการ', 404);
  try {
    const sc = scopeOf(req);
    const id = Number(req.params.id);
    let row, fields;
    if (type === 'visit') {
      row = db.prepare(`SELECT vr.*, c.name AS customer_name, c.code AS customer_code, c.address AS customer_address, u.full_name AS employee, u.department AS dept, u.position AS pos, a.full_name AS approver_name
                        FROM visit_requests vr JOIN users u ON u.id = vr.requester_id LEFT JOIN customers c ON c.id = vr.customer_id
                        LEFT JOIN users a ON a.id = vr.approver_id WHERE vr.id = ?`).get(id);
    } else if (type === 'ot') {
      row = db.prepare(`SELECT o.*, c.name AS customer_name, u.full_name AS employee, u.department AS dept, u.position AS pos, a.full_name AS approver_name
                        FROM ot_requests o JOIN users u ON u.id = o.requester_id LEFT JOIN customers c ON c.id = o.customer_id
                        LEFT JOIN users a ON a.id = o.approver_id WHERE o.id = ?`).get(id);
    } else {
      row = db.prepare(`SELECT lr.*, u.full_name AS employee, u.department AS dept, u.position AS pos, a.full_name AS approver_name
                        FROM leave_requests lr JOIN users u ON u.id = lr.requester_id LEFT JOIN users a ON a.id = lr.approver_id WHERE lr.id = ?`).get(id);
    }
    if (!row || row.status === 'draft') return bad(res, 'ไม่พบรายการ', 404);
    // Visit: ผู้อยู่ในสายอนุมัติ/ผู้มีสิทธิ์อนุมัติ ดูได้เหมือนหน้า Approve Requests (ตรงกับสิทธิ์ของ GET /api/visit-requests/:id)
    const canSee = sc.mgr || row.requester_id === sc.userId
      || (type === 'visit' && (canViewAll(req.session) || approvalEngine.isWorkflowParticipant('visit', row.id, sc.userId)));
    if (!canSee) return bad(res, 'คุณไม่มีสิทธิ์ดูรายการนี้', 403);

    const stage = type === 'visit' && row.status === 'approved' && row.completed_at ? 'completed' : row.status;
    const sl = Q.STATUS_LABEL[type][stage] || stage;
    const hoursFmt = (h) => (h === null || h === undefined ? '' : String(Math.round(h * 10) / 10));
    if (type === 'visit') {
      const d = Q.decorate('visit', { ...row, customer: row.customer_name || row.company || '', status: stage });
      fields = [
        ['Employee', row.employee], ['Department', row.dept], ['Visit Date', row.visit_date],
        ['Customer / Company', row.customer_name || row.company], ['Accompanied By', row.participants],
        ['Purpose', d.purpose], ['Location', row.location], ['Job Type', row.job_type],
        ['Contact Person', row.contact_person], ['Time Out', row.time_from], ['Time In', row.time_to],
        ['Transport', row.transport], ['Notes', row.notes],
        ['Completed At', row.completed_at], ['Completion Note', row.completion_note],
        ['Approver', row.approver_name], ['Approved At', row.approved_at], ['Approval Note', row.approval_note]
      ];
    } else if (type === 'ot') {
      fields = [
        ['Employee', row.employee], ['Department', row.dept], ['Company', companyLabel(row.company)], ['OT Date', row.ot_date],
        ['Start Time', row.time_from], ['End Time', row.time_to], ['OT Hours', hoursFmt(row.hours)],
        ['Day Type', Q.DAY_TYPE_LABEL[row.day_type] || ''], ['OT Type', row.ot_type], ['Customer', row.customer_name],
        ['Job No.', row.job_no], ['Project No.', row.project_no], ['Location', row.location],
        ['Work Detail', row.work_detail], ['Reason', row.reason], ['Notes', row.notes],
        ['Approver', row.approver_name], ['Approved At', row.approved_at], ['Approval Note', row.approval_note]
      ];
    } else {
      const days = Math.round((row.duration_days + (row.duration_hours || 0) / Q.HOURS_PER_DAY) * 100) / 100;
      fields = [
        ['Employee', row.employee], ['Department', row.dept], ['Leave Type', row.leave_type],
        ['Mode', MODE_LABEL[row.leave_mode] || row.leave_mode], ['Start Date', row.date_from], ['End Date', row.date_to],
        ['Time', row.time_from || row.time_to ? `${row.time_from || ''} - ${row.time_to || ''}` : ''],
        ['Leave Days', String(days)], ['Reason', row.reason],
        ['Approver', row.approver_name], ['Approved At', row.approved_at], ['Approval Note', row.approval_note]
      ];
    }
    const h = HIST[type];
    const history = db.prepare(`SELECT h.action, h.note, h.created_at, u.full_name AS actor FROM ${h.table} h
                                LEFT JOIN users u ON u.id = h.action_by WHERE h.${h.fk} = ? ORDER BY h.created_at ASC, h.id ASC`).all(id);
    res.json({
      type, id: row.id, code: row.code, status: stage, status_label: sl, employee_id: row.requester_id,
      fields: fields.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([label, value]) => ({ label, value: String(value) })),
      history,
      visit: type === 'visit' ? visitFull(row) : undefined,
      workflow: type === 'visit' ? approvalEngine.getWorkflow('visit', id) : undefined,
      // ช่องที่ Admin สร้างเองใน Form Builder (เช่น เวลาเข้าพบลูกค้า) — ต้องแสดงตามที่ผู้ใช้กรอก
      custom_fields: type === 'visit'
        ? db.prepare(`SELECT cf.field_key, cf.label, cf.field_type, v.value FROM visit_custom_values v
                      JOIN custom_form_fields cf ON cf.id = v.field_id WHERE v.visit_request_id = ? ORDER BY cf.sort_order ASC, cf.id ASC`).all(id)
        : undefined,
      customer_signature: type === 'visit'
        ? (db.prepare('SELECT data_url, signer_name, signer_title, signed_at FROM visit_customer_signatures WHERE visit_request_id = ?').get(id) || null)
        : undefined
    });
  } catch (err) { fail(res, err, 'ไม่สามารถโหลดรายละเอียดได้'); }
});

// ---------- Export ----------
// GET /api/report/export/:type?format=xlsx|pdf&scope=filtered|individual|full&columns=a,b,c&<filters เดียวกับตาราง>
router.get('/export/:type', async (req, res) => {
  const type = req.params.type;
  if (!TYPES.includes(type) && type !== 'summary') return bad(res, 'ไม่พบประเภทรายงาน', 404);
  try {
    const sc = scopeOf(req);
    if (type === 'summary' && !sc.mgr) return bad(res, 'คุณไม่มีสิทธิ์เข้าถึงรายงานนี้', 403);
    const format = req.query.format === 'pdf' ? 'pdf' : req.query.format === 'xlsx' ? 'xlsx' : null;
    if (!format) return bad(res, 'กรุณาเลือกรูปแบบไฟล์ (Excel หรือ PDF)');
    const scope = ['filtered', 'individual', 'full'].includes(req.query.scope) ? req.query.scope : 'filtered';

    // คอลัมน์: เฉพาะ key ที่อนุญาตของรายงานนั้น เรียงตามที่ผู้ใช้เลือก
    const allowed = new Map(Q.COLUMNS[type].map((c) => [c.key, c]));
    const picked = [];
    String(req.query.columns || '').split(',').forEach((k) => { const c = allowed.get(k.trim()); if (c && !picked.includes(c)) picked.push(c); });
    if (!picked.length) return bad(res, 'กรุณาเลือกคอลัมน์อย่างน้อย 1 รายการ');

    const p = Q.parseFilters(type, req.query);
    if (p.error) return bad(res, p.error);
    let filters = p.filters;
    let ignoreFilters = false;
    let who = '';

    if (scope === 'individual') {
      if (!filters.user_id) return bad(res, 'กรุณาเลือกพนักงานก่อนส่งออกรายงานรายบุคคล');
      if (!sc.mgr && filters.user_id !== sc.userId) return bad(res, 'คุณส่งออกได้เฉพาะรายงานของตัวเอง', 403);
      filters = { from: filters.from, to: filters.to, user_id: filters.user_id };
      const u = db.prepare('SELECT full_name FROM users WHERE id = ?').get(filters.user_id);
      if (!u) return bad(res, 'ไม่พบพนักงาน', 404);
      who = u.full_name;
    } else if (scope === 'full') {
      ignoreFilters = true;
    }
    if (!sc.mgr && filters.user_id && filters.user_id !== sc.userId) return bad(res, 'คุณส่งออกได้เฉพาะรายงานของตัวเอง', 403);

    let rows, totals = [], total;
    if (type === 'summary') {
      rows = sortSummary(summaryRows(req, sc, filters, { ignoreFilters }), req.query.sort, req.query.dir);
      total = rows.length;
      const t = summaryTotals(rows);
      totals = [['Total Visits', t.visits], ['Approved OT Hours', t.ot_hours], ['Approved Leave Days', t.leave_days]];
    } else {
      const w = Q.buildWhere(type, filters, sc, { ignoreFilters });
      const s = Q.summarize(type, w);
      total = s.total;
      const cap = format === 'pdf' ? MAX_PDF_ROWS : MAX_XLSX_ROWS;
      if (total > cap) {
        return bad(res, `ข้อมูลมี ${total.toLocaleString('en-US')} รายการ เกินกว่าที่ ${format === 'pdf' ? 'PDF' : 'Excel'} รองรับ (${cap.toLocaleString('en-US')} รายการ) กรุณากรองให้แคบลง${format === 'pdf' ? ' หรือเลือก Excel' : ''}`, 413);
      }
      rows = Q.listRows(type, w, { sort: req.query.sort, dir: req.query.dir, limit: cap, offset: 0 });
      if (type === 'visit') totals = [['Total Visits', s.total], ['Employees', s.employees], ['Companies', s.companies]];
      if (type === 'ot') totals = [['Approved OT Hours', s.approved_hours], ['Pending OT Hours', s.pending_hours]];
      if (type === 'leave') totals = [['Approved Leave Days', s.approved_days], ['Pending Leave Days', s.pending_days]];
    }
    if (type === 'summary' && total > (format === 'pdf' ? MAX_PDF_ROWS : MAX_XLSX_ROWS)) return bad(res, 'ข้อมูลมากเกินไป กรุณากรองให้แคบลง', 413);

    // รายละเอียดเงื่อนไขที่ใช้จริง (แสดงในไฟล์ เพื่อให้ผู้อ่านรู้ว่าไฟล์นี้กรองอะไรไว้)
    const nameOf = (sql, id) => { const r = db.prepare(sql).get(id); return r ? r.n : ''; };
    const f = ignoreFilters ? {} : filters;
    const meta = [
      ['Period', f.from || f.to ? `${X.dmy(f.from) || '…'} - ${X.dmy(f.to) || '…'}` : 'ทั้งหมด (ไม่จำกัดช่วงเวลา)'],
      ['Scope', scope === 'filtered' ? 'ตามตัวกรองปัจจุบัน' : scope === 'individual' ? `รายบุคคล: ${who}` : (sc.mgr ? 'ทั้งหมดภายในสิทธิ์ของคุณ' : 'ข้อมูลของคุณทั้งหมด')],
      ['Department', f.department], ['Employee', scope === 'individual' ? '' : (f.user_id ? nameOf('SELECT full_name n FROM users WHERE id = ?', f.user_id) : '')],
      ['Customer', f.customer_id ? nameOf('SELECT name n FROM customers WHERE id = ?', f.customer_id) : ''],
      ['Accompanied By', f.accompanied], ['Leave Type', f.leave_type],
      ['Status', f.status ? (Q.STATUS_LABEL[type] || {})[f.status] : ''], ['Keyword', f.q],
      ['Generated By', db.prepare('SELECT full_name n FROM users WHERE id = ?').get(sc.userId)?.n || ''],
      ['Generated At', X.nowBangkok()]
    ].filter(([, v]) => v !== '' && v !== undefined && v !== null);
    if (type === 'summary') meta.push(['Note', 'Late/Absent เป็นยอดสะสมจากหน้า KPI ไม่เปลี่ยนตามช่วงเวลา']);

    const title = Q.TITLES[type];
    const payload = { title, columns: picked, rows, meta, totals };
    const buf = format === 'xlsx' ? await X.buildXlsx(payload) : await X.buildPdf(payload);

    const stamp = (f.from || f.to) ? `${f.from || 'start'}_to_${f.to || 'now'}` : `All_${X.nowBangkok().slice(0, 10)}`;
    const filename = `${title.replace(/ /g, '_')}_${stamp}.${format}`;
    res.setHeader('Content-Type', format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Report-Rows', String(rows.length));
    res.setHeader('Cache-Control', 'no-store');
    logAction(sc.userId, 'export_report', `${type} ${format} ${scope} rows=${rows.length}`); // บันทึกเฉพาะจำนวน ไม่เก็บเนื้อหารายงาน
    res.send(buf);
  } catch (err) { fail(res, err, 'ไม่สามารถสร้างไฟล์รายงานได้ กรุณาลองใหม่อีกครั้ง'); }
});

module.exports = router;
