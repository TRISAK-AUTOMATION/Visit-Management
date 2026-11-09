// utils/paperForms.js - ข้อมูลของ "ใบ OT / ใบลา แบบกระดาษ" ที่ใช้ร่วมกันระหว่าง PDF (routes/otPdf.js, routes/leavePdf.js)
// และหน้าต่างรายละเอียดคำขอในเว็บ (GET /api/ot-requests/:id, /api/leave-requests/:id -> paper)
// ให้ชื่อ/ลายเซ็นในช่องลงนามและข้อความในใบตรงกันเสมอ
const db = require('../db/database');
const { toThaiDate } = require('./dateFormat');
const signature = require('./signature');
const { companyName } = require('./companies');

// เวลา UTC จากฐานข้อมูล -> วันที่ไทย dd/mm/yyyy
function bangkokDate(utcStr) {
  if (!utcStr) return '';
  const d = new Date(String(utcStr).replace(' ', 'T') + 'Z');
  if (isNaN(d)) return toThaiDate(utcStr);
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(d);
  const g = (t) => p.find(x => x.type === t).value;
  return `${g('day')}/${g('month')}/${g('year')}`;
}

// เวลา UTC -> "dd/mm/yyyy HH:MM" เวลาไทย (ใช้ในข้อความ "อนุมัติผ่านระบบ ..." แทนลายเซ็น)
function bangkokDateTime(utcStr) {
  if (!utcStr) return '';
  const d = new Date(String(utcStr).replace(' ', 'T') + 'Z');
  if (isNaN(d)) return '';
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const g = (t) => p.find(x => x.type === t).value;
  return `${g('day')}/${g('month')}/${g('year')} ${g('hour')}:${g('minute')}`;
}

// เวลาที่ผู้ขอกด "ส่งคำขอ" ครั้งล่าสุด (ฉบับร่างที่ยังไม่ส่ง = null) — ใช้เป็นเวลาในช่อง "ผู้ยื่นคำร้อง" เมื่อไม่มีลายเซ็น
const HISTORY = { ot: ['ot_history', 'ot_request_id'], leave: ['leave_history', 'leave_request_id'], visit: ['approval_history', 'visit_request_id'] };
function submittedAt(module, req) {
  if (!req || req.status === 'draft') return null;
  const h = HISTORY[module];
  try {
    const row = h && db.prepare(`SELECT created_at FROM ${h[0]} WHERE ${h[1]} = ? AND action LIKE 'ส่งคำขอ%' ORDER BY id DESC LIMIT 1`).get(req.id);
    return (row && row.created_at) || req.created_at || null;
  } catch { return req.created_at || null; }
}
// ช่องผู้ยื่นคำร้อง: stamp ใช้เมื่อไม่มีภาพลายเซ็น
const requesterStamp = (module, req) => {
  const at = submittedAt(module, req);
  return at ? { name: req.requester_name || '', at: bangkokDateTime(at), label: 'ยื่นผ่านระบบ' } : null;
};

// แบ่งขั้นตอนอนุมัติลงช่องลงนาม: ตั้ง slot ไว้ใน Template -> ขั้นที่เป็น firstSlot ('checker' ของ OT / 'head' ของใบลา)
// ลงช่องแรก ที่เหลือลงช่องผู้อนุมัติ / ไม่ได้ตั้ง slot -> ขั้นสุดท้าย = ผู้อนุมัติ, ขั้นก่อนหน้า = ช่องแรก
// คืน { checker, approver } แต่ละช่อง = { names: ผู้ที่อนุมัติแล้ว, signerId: คนแรกที่อนุมัติและมีลายเซ็น, waiting: ผู้ที่ยังไม่ได้อนุมัติ }
function signerSlots(wf, firstSlot = 'checker') {
  const states = (wf && wf.states) || [];
  // ขั้นที่ไม่ได้ตั้ง slot (ว่าง) ใช้กติกาตามตำแหน่งเสมอ แม้ขั้นอื่นจะตั้งไว้แล้ว
  // (เดิมขั้นที่ slot ว่างถูกนับเป็นผู้อนุมัติทั้งหมด ทำให้ชื่อผู้ตรวจสอบไปโผล่ช่องผู้อนุมัติ)
  const slotOf = (s, i) => s.slot || (i === states.length - 1 ? 'approver' : firstSlot);
  const cs = states.filter((s, i) => slotOf(s, i) === firstSlot);
  const as = states.filter((s, i) => slotOf(s, i) !== firstSlot);
  const open = wf && wf.status === 'pending';
  const info = (list) => {
    const approved = list.flatMap(s => s.approvers.filter(a => a.decision === 'approve'));
    const signer = approved.find(a => signature.getBuffer(a.user_id));
    const waiting = open ? list.filter(s => s.status !== 'approved').flatMap(s => s.approvers.filter(a => !a.decision).map(a => a.full_name)) : [];
    // ไม่มีใครในช่องนี้ตั้งลายเซ็นไว้ -> ใช้ชื่อคนแรกที่อนุมัติ + วันเวลาที่อนุมัติ แทนลายเซ็น
    const first = [...approved].sort((a, b) => String(a.decided_at || '').localeCompare(String(b.decided_at || '')))[0];
    const stamp = !signer && first ? { name: first.full_name, at: bangkokDateTime(first.decided_at), label: 'อนุมัติผ่านระบบ' } : null;
    return { names: approved.map(a => a.full_name).join(', '), signerId: signer ? signer.user_id : null, stamp, waiting: [...new Set(waiting)].join(', ') };
  };
  return { checker: info(cs), approver: info(as) };
}

// ใบ OT: ข้อมูลหัวเอกสาร + ช่องลงนาม สำหรับแสดงในเว็บ (ลายเซ็นเป็น data URL)
function otPaperData(ot, wf, cfg) {
  const slots = signerSlots(wf);
  const sig = (id) => (cfg.show_signature && id ? signature.getDataUrl(id) : null);
  return {
    company: companyName(ot.company) || cfg.company,
    title: cfg.title,
    date: bangkokDate(ot.created_at),
    signers: [
      { role: 'ผู้ยื่นคำร้อง', name: ot.requester_name || '', sig: sig(ot.requester_id), stamp: requesterStamp('ot', ot), waiting: '' },
      { role: 'ผู้ตรวจสอบ', name: slots.checker.names, sig: sig(slots.checker.signerId), stamp: slots.checker.stamp, waiting: slots.checker.waiting },
      { role: 'ผู้อนุมัติ', name: slots.approver.names || (ot.status === 'approved' ? ot.approver_name || '' : ''), sig: sig(slots.approver.signerId), stamp: slots.approver.stamp, waiting: slots.approver.waiting }
    ]
  };
}

// ---------- ใบลา ----------
const LEAVE_COMPANY = 'บริษัท ตรีศักดิ์ ออโตเมชั่น จำกัด';
// เวลาทำงานที่พิมพ์ลงช่อง "ลา(ชั่วโมง)" ของใบลาเต็มวัน/ครึ่งวัน — แก้ตรงนี้ถ้าเวลาทำงานบริษัทไม่ตรง
// (เต็มวัน 08.30-17.30 / ครึ่งวันเช้า-บ่าย แบ่งตามพักเที่ยง 12.00-13.00)
const WORK_TIME = {
  full_day: ['08.30', '17.30'],
  half_day_morning: ['08.30', '12.00'],
  half_day_afternoon: ['13.00', '17.30']
};
const num = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

// ข้อความในช่อง ลา(วัน) / ลา(ชั่วโมง) ของใบลา
function leaveLines(lr) {
  const isHours = lr.leave_mode === 'hours';
  const modeTh = { half_day_morning: ' (ครึ่งวันเช้า)', half_day_afternoon: ' (ครึ่งวันบ่าย)' }[lr.leave_mode] || '';
  const range = lr.date_from === lr.date_to ? toThaiDate(lr.date_from) : `${toThaiDate(lr.date_from)} - ${toThaiDate(lr.date_to)}`;
  const t = (v) => String(v || '').replace(':', '.');
  const slot = WORK_TIME[lr.leave_mode];
  return {
    dayText: isHours ? '' : range + modeTh,
    dayTotal: isHours ? '' : num(lr.duration_days),
    // ลาเป็นชั่วโมง: วันที่ + เวลาที่ผู้ขอกรอก / เต็มวัน-ครึ่งวัน: ช่วงเวลาทำงาน (ระบบไม่ได้เก็บเวลาไว้ จึงใช้ WORK_TIME)
    hourText: isHours ? `${toThaiDate(lr.date_from)}  ${t(lr.time_from)} - ${t(lr.time_to)} น.` : (slot ? `${slot[0]} - ${slot[1]} น.` : ''),
    hourTotal: isHours ? num(lr.duration_hours) : ''
  };
}

// ใบลา: ข้อมูลทั้งใบสำหรับแสดงในเว็บ
function leavePaperData(lr, wf, cfg) {
  const slots = signerSlots(wf, 'head');
  const sig = (id) => (cfg.show_signature && id ? signature.getDataUrl(id) : null);
  return {
    company: cfg.company || LEAVE_COMPANY,
    title: cfg.title,
    date: bangkokDate(lr.created_at),
    ...leaveLines(lr),
    signers: [
      { role: 'ผู้ยื่นคำร้อง', name: lr.requester_name || '', sig: sig(lr.requester_id), stamp: requesterStamp('leave', lr), waiting: '' },
      { role: 'หัวหน้า', name: slots.checker.names, sig: sig(slots.checker.signerId), stamp: slots.checker.stamp, waiting: slots.checker.waiting },
      { role: 'ผู้อนุมัติ', name: slots.approver.names || (lr.status === 'approved' ? lr.approver_name || '' : ''), sig: sig(slots.approver.signerId), stamp: slots.approver.stamp, waiting: slots.approver.waiting }
    ]
  };
}

// ช่องลงนามของรายชื่อผู้อนุมัติ (ใช้ใน PDF Visit): ไม่มีใครตั้งลายเซ็น -> ชื่อคนแรกที่อนุมัติ + วันเวลา
function approverStamp(approved) {
  if (!approved || !approved.length || approved.some(a => signature.getBuffer(a.user_id))) return null;
  const first = [...approved].sort((a, b) => String(a.decided_at || '').localeCompare(String(b.decided_at || '')))[0];
  return { name: first.full_name, at: bangkokDateTime(first.decided_at), label: 'อนุมัติผ่านระบบ' };
}

module.exports = { approverStamp, bangkokDate, bangkokDateTime, requesterStamp, signerSlots, otPaperData, leaveLines, leavePaperData, LEAVE_COMPANY };
