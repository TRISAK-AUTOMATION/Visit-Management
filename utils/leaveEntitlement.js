// utils/leaveEntitlement.js - สิทธิ์วันลาอัตโนมัติตามอายุงาน + รอบสิทธิ์ (รีเซ็ตยอดใช้ไป) + คิดสัดส่วนปีแรก
//
// กติกาใน leave_entitlement_rules (leave_type, min_months, days): สิทธิ์ของประเภทลา = days ของกติกาที่ min_months สูงสุดที่ "อายุงาน >= min_months"
// ถ้าอายุงานยังไม่ถึงกติกาใดเลย = 0 วัน — ใช้กับพนักงานที่เปิด auto_entitlement และมี start_date เท่านั้น คนอื่นยังเป็นค่าที่ Admin กรอกเอง
//
// รอบสิทธิ์ (system_settings.leave_cycle):
//   calendar    = 1 ม.ค. - 31 ธ.ค. (ค่าเริ่มต้น)
//   anniversary = นับจากวันครบรอบวันเริ่มงานของแต่ละคน (ถ้าไม่มี start_date ใช้ปฏิทิน)
// เมื่อขึ้นรอบใหม่ ยอด "ใช้ไป" ทุกประเภทรีเซ็ตเป็น 0 (เก็บยอดรอบก่อนไว้ใน leave_balance_history) — ไม่ยกยอดข้ามรอบ
// คิดสัดส่วนปีแรก (system_settings.leave_prorate_first_year = '1', เฉพาะรอบปฏิทิน): ปีที่เริ่มงาน สิทธิ์ = days × (จำนวนวันที่เหลือในปี / วันทั้งปี) ปัดเป็น 0.5 วัน
const db = require('../db/database');

const TYPE_COL = { 'ลาพักร้อน': 'vacation_total', 'ลากิจ': 'personal_total', 'ลาป่วย': 'sick_total' };
const LEAVE_TYPES = Object.keys(TYPE_COL);
const CYCLES = ['calendar', 'anniversary'];

function todayBangkok() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date()); // YYYY-MM-DD
}
const parse = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; };
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const dim = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
// วันครบรอบของปี y (29 ก.พ. ในปีที่ไม่ใช่ปีอธิกสุรทิน -> 28 ก.พ.)
const anniv = (s, y) => iso(y, s.m, Math.min(s.d, dim(y, s.m)));
const dayNum = (isoStr) => { const p = parse(isoStr); return Math.floor(Date.UTC(p.y, p.m - 1, p.d) / 86400000); };

// จำนวนเดือนเต็มระหว่าง start ถึง today; วันเริ่มงานอยู่อนาคต/รูปแบบผิด = 0
function tenureMonths(start, today = todayBangkok()) {
  const a = parse(start), b = parse(today);
  if (!a || !b) return 0;
  let m = (b.y - a.y) * 12 + (b.m - a.m);
  if (b.d < a.d) m -= 1;
  return Math.max(0, m);
}

function getSettings() {
  const get = (k, def) => { const r = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(k); return r && r.value !== null ? r.value : def; };
  const cycle = get('leave_cycle', 'calendar');
  return { cycle: CYCLES.includes(cycle) ? cycle : 'calendar', prorate_first_year: get('leave_prorate_first_year', '0') === '1' };
}
function saveSettings({ cycle, prorate_first_year }) {
  const up = db.prepare('INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  up.run('leave_cycle', CYCLES.includes(cycle) ? cycle : 'calendar');
  up.run('leave_prorate_first_year', prorate_first_year ? '1' : '0');
}

// รอบสิทธิ์ปัจจุบันของพนักงาน { key, start, end } (end = วันสุดท้ายของรอบ)
function cycleFor(startDate, settings = getSettings(), today = todayBangkok()) {
  const t = parse(today), s = parse(startDate);
  if (settings.cycle === 'anniversary' && s && dayNum(startDate) <= dayNum(today)) {
    const thisYear = anniv(s, t.y);
    const startY = dayNum(thisYear) <= dayNum(today) ? t.y : t.y - 1;
    const start = anniv(s, startY);
    const nextStart = anniv(s, startY + 1);
    const end = new Date((dayNum(nextStart) - 1) * 86400000).toISOString().slice(0, 10);
    return { key: start, start, end };
  }
  return { key: String(t.y), start: iso(t.y, 1, 1), end: iso(t.y, 12, 31) };
}

function getRules() {
  return db.prepare('SELECT leave_type, min_months, days FROM leave_entitlement_rules ORDER BY leave_type, min_months').all();
}

function entitlementFor(rules, leaveType, months) {
  let best = null;
  for (const r of rules) {
    if (r.leave_type === leaveType && r.min_months <= months && (!best || r.min_months >= best.min_months)) best = r;
  }
  return best ? best.days : 0;
}

// ตัวคูณสัดส่วนปีแรก (1 = เต็ม) — ใช้เมื่อเปิดตัวเลือก + รอบปฏิทิน + เริ่มงานในปีนี้
function prorateFactor(startDate, settings = getSettings(), today = todayBangkok()) {
  const s = parse(startDate), t = parse(today);
  if (!settings.prorate_first_year || settings.cycle !== 'calendar' || !s || s.y !== t.y) return 1;
  const remaining = dayNum(iso(t.y, 12, 31)) - dayNum(startDate) + 1;
  return Math.min(1, Math.max(0, remaining / (isLeap(t.y) ? 366 : 365)));
}

// { vacation_total, personal_total, sick_total } ตามอายุงาน (เดือน) — factor < 1 = ลดตามสัดส่วน ปัดเป็น 0.5 วัน
function computeTotals(months, rules = getRules(), factor = 1) {
  const out = {};
  for (const t of LEAVE_TYPES) {
    const d = entitlementFor(rules, t, months);
    out[TYPE_COL[t]] = factor >= 1 ? d : Math.round(d * factor * 2) / 2;
  }
  return out;
}

// ขึ้นรอบใหม่ -> เก็บยอดรอบก่อนลงประวัติ แล้วรีเซ็ต "ใช้ไป" เป็น 0 ; ครั้งแรกที่ยังไม่มี cycle_key แค่บันทึกรอบ (ไม่รีเซ็ตของเดิม)
function rollCycle(userId, settings = getSettings()) {
  const row = db.prepare(`SELECT b.*, u.start_date FROM leave_balances b JOIN users u ON u.id = b.user_id WHERE b.user_id = ?`).get(userId);
  if (!row) return false;
  const cur = cycleFor(row.start_date, settings).key;
  if (row.cycle_key === cur) return false;
  const tx = db.transaction(() => {
    if (row.cycle_key) {
      db.prepare(`INSERT INTO leave_balance_history (user_id, cycle_key, vacation_total, vacation_used, personal_total, personal_used, sick_total, sick_used)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(userId, row.cycle_key, row.vacation_total, row.vacation_used, row.personal_total, row.personal_used, row.sick_total, row.sick_used);
      db.prepare(`UPDATE leave_balances SET vacation_used = 0, personal_used = 0, sick_used = 0, cycle_key = ?, updated_at = datetime('now') WHERE user_id = ?`).run(cur, userId);
    } else {
      db.prepare('UPDATE leave_balances SET cycle_key = ? WHERE user_id = ?').run(cur, userId);
    }
  });
  tx();
  return !!row.cycle_key;
}

// ตั้ง cycle_key เป็นรอบปัจจุบันโดย "ไม่รีเซ็ต" — ใช้ตอน Admin เปลี่ยนชนิดรอบ/แก้วันเริ่มงาน (เปลี่ยนการตั้งค่าไม่ควรล้างยอดใช้ไปโดยไม่ตั้งใจ)
function rekeyUser(userId, settings = getSettings()) {
  const u = db.prepare('SELECT start_date FROM users WHERE id = ?').get(userId);
  if (!u) return;
  db.prepare('UPDATE leave_balances SET cycle_key = ? WHERE user_id = ?').run(cycleFor(u.start_date, settings).key, userId);
}
function rekeyAll(settings = getSettings()) {
  db.prepare('SELECT user_id FROM leave_balances').all().forEach(r => rekeyUser(r.user_id, settings));
}

// ปรับ *_total ของพนักงานที่เปิดอัตโนมัติให้ตรงกติกา (ไม่แตะยอด "ใช้ไป") — คืน true ถ้ามีการเปลี่ยนค่า
function syncUser(userId, rules, settings = getSettings()) {
  const row = db.prepare(`SELECT b.*, u.start_date FROM leave_balances b JOIN users u ON u.id = b.user_id WHERE b.user_id = ?`).get(userId);
  if (!row || !row.auto_entitlement || !row.start_date) return false;
  const t = computeTotals(tenureMonths(row.start_date), rules || getRules(), prorateFactor(row.start_date, settings));
  if (t.vacation_total === row.vacation_total && t.personal_total === row.personal_total && t.sick_total === row.sick_total) return false;
  db.prepare(`UPDATE leave_balances SET vacation_total = ?, personal_total = ?, sick_total = ?, updated_at = datetime('now') WHERE user_id = ?`)
    .run(t.vacation_total, t.personal_total, t.sick_total, userId);
  return true;
}

function syncAll() {
  const rules = getRules(), settings = getSettings();
  const ids = db.prepare(`SELECT b.user_id FROM leave_balances b JOIN users u ON u.id = b.user_id WHERE b.auto_entitlement = 1 AND u.start_date IS NOT NULL AND u.start_date != ''`).all();
  let n = 0;
  for (const r of ids) if (syncUser(r.user_id, rules, settings)) n += 1;
  return n;
}

module.exports = {
  LEAVE_TYPES, TYPE_COL, CYCLES, tenureMonths, getRules, getSettings, saveSettings, cycleFor, prorateFactor,
  entitlementFor, computeTotals, rollCycle, rekeyUser, rekeyAll, syncUser, syncAll, todayBangkok
};
