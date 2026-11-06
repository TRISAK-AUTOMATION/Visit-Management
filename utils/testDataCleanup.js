// utils/testDataCleanup.js - ล้างข้อมูลที่ลองส่งทดสอบระบบ (ใบลา / OT) ทิ้งถาวร สำหรับ Admin ก่อนเริ่มใช้งานจริง
// - ใบลาที่ "อนุมัติแล้ว" ถูกหักวันลาไปแล้ว -> ตอนลบจะคืนยอดใช้ไป (vacation/personal/sick_used) ให้เท่าเดิมก่อนมีใบนั้น
//   (คืนเฉพาะใบที่ถูกหักในรอบสิทธิ์ปัจจุบัน เหมือนกติกาตอน Admin ยกเลิกใบลาที่อนุมัติแล้ว ใบรอบเก่ายอดถูกรีเซ็ตไปแล้ว)
// - ปิด/เปิดฟีเจอร์นี้ได้ที่ system_settings.test_data_cleanup_enabled (ปิดไว้เมื่อเริ่มระบบจริง กันกดลบข้อมูลจริงโดยพลาด)
const db = require('../db/database');
const entitlement = require('./leaveEntitlement');

const SETTING_KEY = 'test_data_cleanup_enabled';
const TYPE_COL = { 'ลาพักร้อน': 'vacation_used', 'ลากิจ': 'personal_used', 'ลาป่วย': 'sick_used' };

function isEnabled() {
  const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(SETTING_KEY);
  return !row || row.value !== '0'; // ค่าเริ่มต้น = เปิด (คงพฤติกรรมเดิมของปุ่มลบ Visit)
}
function setEnabled(on) {
  db.prepare(`INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(SETTING_KEY, on ? '1' : '0');
}

// ใบลาที่ต้องคืนวันลา: อนุมัติแล้ว + มีจำนวนวัน + ถูกหักในรอบสิทธิ์ปัจจุบันของผู้ขอ
function refundPlan() {
  const settings = entitlement.getSettings();
  const rows = db.prepare(`
    SELECT lr.id, lr.requester_id, lr.leave_type, lr.duration_days, lr.approved_at, u.start_date
    FROM leave_requests lr JOIN users u ON u.id = lr.requester_id
    WHERE lr.status = 'approved' AND lr.duration_days > 0
  `).all();
  const perUser = new Map(); // userId -> { vacation_used, personal_used, sick_used }
  const total = { vacation_used: 0, personal_used: 0, sick_used: 0 };
  const cycles = new Map();
  for (const r of rows) {
    const col = TYPE_COL[r.leave_type];
    if (!col) continue;
    if (!cycles.has(r.requester_id)) cycles.set(r.requester_id, entitlement.cycleFor(r.start_date, settings).start);
    if (String(r.approved_at || '').slice(0, 10) < cycles.get(r.requester_id)) continue;
    const u = perUser.get(r.requester_id) || { vacation_used: 0, personal_used: 0, sick_used: 0 };
    u[col] += r.duration_days;
    total[col] += r.duration_days;
    perUser.set(r.requester_id, u);
  }
  return { perUser, total };
}

function summary() {
  const count = (sql) => db.prepare(sql).get().c;
  const { total } = refundPlan();
  return {
    enabled: isEnabled(),
    visit: { total: count('SELECT COUNT(*) c FROM visit_requests') },
    leave: {
      total: count('SELECT COUNT(*) c FROM leave_requests'),
      approved: count(`SELECT COUNT(*) c FROM leave_requests WHERE status = 'approved' AND duration_days > 0`),
      refund: { vacation: total.vacation_used, personal: total.personal_used, sick: total.sick_used }
    },
    ot: { total: count('SELECT COUNT(*) c FROM ot_requests') }
  };
}

function purgeLeave() {
  return db.transaction(() => {
    const { perUser, total } = refundPlan();
    for (const [userId, d] of perUser) {
      entitlement.rollCycle(userId); // ให้แน่ใจว่าแถวสิทธิ์อยู่ในรอบปัจจุบันก่อนหักคืน (ถ้ายังไม่ขึ้นรอบ ยอดจะถูกรีเซ็ตอยู่แล้ว)
      db.prepare(`UPDATE leave_balances SET
          vacation_used = MAX(0, vacation_used - ?), personal_used = MAX(0, personal_used - ?), sick_used = MAX(0, sick_used - ?),
          updated_at = datetime('now') WHERE user_id = ?`).run(d.vacation_used, d.personal_used, d.sick_used, userId);
    }
    const ids = db.prepare('SELECT id FROM leave_requests').all().map(r => r.id);
    db.prepare('DELETE FROM leave_history').run();
    db.prepare(`DELETE FROM request_workflows WHERE module = 'leave'`).run(); // states/approvers ลบตามด้วย CASCADE
    db.prepare(`DELETE FROM notifications WHERE type LIKE 'leave\\_%' ESCAPE '\\'`).run();
    db.prepare('DELETE FROM leave_requests').run();
    return { deleted: ids.length, refunded: { vacation: total.vacation_used, personal: total.personal_used, sick: total.sick_used }, users: perUser.size };
  })();
}

function purgeOt() {
  return db.transaction(() => {
    const n = db.prepare('SELECT COUNT(*) c FROM ot_requests').get().c;
    db.prepare('DELETE FROM ot_history').run();
    db.prepare(`DELETE FROM request_workflows WHERE module = 'ot'`).run();
    db.prepare(`DELETE FROM notifications WHERE type LIKE 'ot\\_%' ESCAPE '\\'`).run();
    db.prepare('DELETE FROM ot_requests').run();
    return { deleted: n };
  })();
}

module.exports = { isEnabled, setEnabled, summary, purgeLeave, purgeOt };
