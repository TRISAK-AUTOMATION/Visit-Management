// utils/customerLevels.js - ระดับลูกค้า (ใช้ร่วมกันระหว่างหน้า Customer และฟอร์ม Visit)
const db = require('../db/database');
const { logAction } = require('./systemLog');

// ตรงกับตัวเลือกใน Customer Level ของฟอร์ม Visit (ยกเว้น "No Change" ที่แปลว่าไม่เปลี่ยน ไม่ใช่ระดับจริง)
const CUSTOMER_LEVELS = ['L1 Strategic', 'L2 Growth', 'L3 Maintain', 'L4 Develop', 'L5 Low Priority'];

// เมื่อคำขอ Visit ได้รับการอนุมัติจนจบ: ถ้าผู้ขอเลือกระดับลูกค้าใหม่ (ไม่ใช่ No Change) และต่างจากระดับปัจจุบัน
// ให้อัปเดตระดับของลูกค้ารายนั้น — คืน { from, to } ถ้ามีการเปลี่ยน ไม่งั้นคืน null (เรียกภายใน transaction ได้)
function applyVisitLevelToCustomer(visit, actorId) {
  let obj;
  try { obj = typeof visit.customer_level_json === 'string' ? JSON.parse(visit.customer_level_json) : visit.customer_level_json; } catch (e) { return null; }
  const level = obj && typeof obj.level === 'string' ? obj.level.trim() : '';
  if (!CUSTOMER_LEVELS.includes(level)) return null;
  const cust = db.prepare('SELECT id, code, name, level FROM customers WHERE id = ?').get(visit.customer_id);
  if (!cust || cust.level === level) return null;
  db.prepare(`UPDATE customers SET level = ?, level_updated_at = datetime('now') WHERE id = ?`).run(level, cust.id);
  logAction(actorId, 'update_customer_level', `เปลี่ยนระดับลูกค้า ${cust.code} - ${cust.name}: ${cust.level || '(ไม่ระบุ)'} → ${level} (จากคำขอ Visit #${visit.code} ที่อนุมัติ)`);
  return { from: cust.level || null, to: level };
}

module.exports = { CUSTOMER_LEVELS, applyVisitLevelToCustomer };
