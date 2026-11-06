// utils/inputChecks.js — ตัวตรวจข้อมูลที่ใช้ร่วมกันของใบลา/OT: วันที่จริง, ช่วงวันที่สมเหตุผล, เวลา, ความยาว, ช่วงเวลาซ้ำซ้อน
const DAY = 86400000;
const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim()); if (!m) return null; const h = +m[1], mi = +m[2]; return h > 23 || mi > 59 ? null : h * 60 + mi; };

function dateNum(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t / DAY : null;
}
const todayNum = () => Math.floor(Date.now() / DAY);

// วันที่ต้องมีจริงในปฏิทิน และอยู่ในช่วง 1 ปีย้อนหลัง ถึง 2 ปีข้างหน้า (กันกรอกผิดเช่น 2099 / 2020)
function dateError(s, label) {
  const n = dateNum(s);
  if (n === null) return `${label} ไม่ถูกต้อง (ต้องเป็นวันที่ที่มีจริง รูปแบบ ปปปป-ดด-วว)`;
  const t = todayNum();
  if (n < t - 366 || n > t + 731) return `${label} อยู่นอกช่วงที่ระบบรับได้ (ย้อนหลังไม่เกิน 1 ปี และล่วงหน้าไม่เกิน 2 ปี)`;
  return null;
}

function tooLong(v, max, label) {
  return v !== undefined && v !== null && String(v).length > max ? `${label}ยาวเกินไป (ไม่เกิน ${max} ตัวอักษร)` : null;
}

// ช่องที่ต้องเป็นข้อความ/ตัวเลข/ว่างเท่านั้น — ถ้าส่ง object/array/boolean มา คืนชื่อช่องแรกที่ผิด (กัน error 500 จาก .trim() / SQLite bind)
function nonScalarField(b, keys) {
  for (const k of keys) {
    const v = b[k];
    if (v === undefined || v === null || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) continue;
    return k;
  }
  return null;
}

const LEAVE_TEXT_FIELDS = ['leave_type', 'leave_mode', 'date_from', 'date_to', 'time_from', 'time_to', 'reason'];

// ตรวจค่าที่ "กรอกมา" ของใบลา (ใช้ได้ทั้งฉบับร่างและตอนส่ง) — คืนข้อความ error หรือ null
function leaveInputError(b) {
  { const k = nonScalarField(b, LEAVE_TEXT_FIELDS); if (k) return `ข้อมูลในช่อง ${k} ไม่ถูกต้อง`; }
  if (b.date_from) { const e = dateError(b.date_from, 'วันที่เริ่มลา'); if (e) return e; }
  const multi = b.leave_mode === 'full_day' && b.date_to && b.date_to !== b.date_from;
  if (b.date_to && multi) {
    const e = dateError(b.date_to, 'วันที่สิ้นสุดการลา'); if (e) return e;
    if (b.date_from && dateNum(b.date_to) < dateNum(b.date_from)) return 'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มลา';
    if (b.date_from && dateNum(b.date_to) - dateNum(b.date_from) > 365) return 'ลาติดต่อกันได้ไม่เกิน 366 วันต่อใบ';
  }
  if (b.leave_mode === 'hours' && (b.time_from || b.time_to)) {
    const f = toMin(b.time_from), t = toMin(b.time_to);
    if (f === null || t === null) return 'รูปแบบเวลาไม่ถูกต้อง';
    if (t <= f) return 'เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น';
  }
  return tooLong(b.reason, 1000, 'เหตุผลการลา');
}

// ช่วงนาทีของวันที่ลา/ทำ OT — เต็มวัน=0-1440, ครึ่งเช้า=0-720, ครึ่งบ่าย=720-1440, รายชั่วโมง=เวลาที่ระบุ
function leaveSpan(r) {
  if (r.leave_mode === 'half_day_morning') return [0, 720];
  if (r.leave_mode === 'half_day_afternoon') return [720, 1440];
  if (r.leave_mode === 'hours') { const f = toMin(r.time_from), t = toMin(r.time_to); if (f !== null && t !== null) return [f, t]; }
  return [0, 1440];
}

function leaveOverlapError(db, userId, row, excludeId) {
  const from = row.date_from, to = row.date_to || row.date_from;
  if (dateNum(from) === null) return null;
  const others = db.prepare(`SELECT id, code, leave_mode, date_from, date_to, time_from, time_to, status FROM leave_requests
    WHERE requester_id = ? AND status IN ('pending','approved') AND id != ? AND date_from <= ? AND COALESCE(NULLIF(date_to,''), date_from) >= ?`)
    .all(userId, excludeId || 0, to, from);
  const mineMulti = to !== from;
  for (const o of others) {
    const oMulti = (o.date_to || o.date_from) !== o.date_from;
    let clash = true;
    if (!mineMulti && !oMulti) { const a = leaveSpan(row), c = leaveSpan(o); clash = a[0] < c[1] && c[0] < a[1]; }
    if (clash) return `ช่วงเวลาที่ลาทับกับคำขอลา #${o.code} (${o.date_from}${o.date_to && o.date_to !== o.date_from ? ' ถึง ' + o.date_to : ''}) ที่${o.status === 'approved' ? 'อนุมัติแล้ว' : 'รออนุมัติอยู่'}`;
  }
  return null;
}

function otOverlapError(db, userId, row, excludeId) {
  const f = toMin(row.time_from), t = toMin(row.time_to);
  if (!row.ot_date || f === null || t === null) return null;
  const others = db.prepare(`SELECT id, code, time_from, time_to, status FROM ot_requests
    WHERE requester_id = ? AND ot_date = ? AND status IN ('pending','approved') AND id != ?`).all(userId, row.ot_date, excludeId || 0);
  for (const o of others) {
    const of = toMin(o.time_from), ot = toMin(o.time_to);
    if (of !== null && ot !== null && f < ot && of < t) return `เวลา OT ทับกับคำขอ #${o.code} (${o.time_from}-${o.time_to}) ที่${o.status === 'approved' ? 'อนุมัติแล้ว' : 'รออนุมัติอยู่'}`;
  }
  return null;
}

// ตรวจวันที่/เวลาของคำขอ Visit (ตรวจเฉพาะช่องที่มีค่า) — คืนข้อความ error หรือ null
// ไม่จำกัดช่วงปีเหมือนใบลา เพราะแก้ข้อมูลหลังปฏิบัติงานของ Visit เก่าได้
function visitInputError(b) {
  if (b.visit_date && dateNum(b.visit_date) === null) return 'วันที่ Visit ไม่ถูกต้อง (ต้องเป็นวันที่ที่มีจริง รูปแบบ ปปปป-ดด-วว)';
  const f = b.time_from ? toMin(b.time_from) : null, t = b.time_to ? toMin(b.time_to) : null;
  if ((b.time_from && f === null) || (b.time_to && t === null)) return 'รูปแบบเวลาไม่ถูกต้อง';
  if (f !== null && t !== null && t <= f) return 'เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น';
  return null;
}

module.exports = { dateNum, dateError, tooLong, nonScalarField, leaveInputError, leaveOverlapError, otOverlapError, visitInputError };
