// utils/upcomingNotify.js - แจ้งผู้อนุมัติ "ขั้นถัดไป" ให้รู้ล่วงหน้าตั้งแต่ผู้ขอกดส่งคำขอ
// ลำดับการอนุมัติไม่เปลี่ยน: ผู้อนุมัติขั้นถัดไปยังกดอนุมัติไม่ได้จนกว่าขั้นก่อนหน้า (หัวหน้า/ผู้ตรวจสอบ) อนุมัติ
// แจ้งเฉพาะในระบบ (กระดิ่ง) ไม่ส่งอีเมล — อีเมลจะส่งตอน "ถึงคิวคุณ" ตามเดิม กันอีเมลซ้ำ 2 ฉบับต่อ 1 คำขอ
const db = require('../db/database');
const approvalEngine = require('./approvalEngine');

const TYPE = { visit: 'upcoming_request', leave: 'leave_upcoming_request', ot: 'ot_upcoming_request' };

// baseMsg เช่น "มีคำขอ OT ใหม่จาก ... วันที่ ..." / skipIds = คนที่ได้แจ้งไปแล้วในรอบนี้ (เช่น Admin) ไม่ต้องแจ้งซ้ำ
function notifyUpcomingApprovers(module, requestId, baseMsg, { requesterId = null, skipIds = [] } = {}) {
  try {
    const skip = new Set([requesterId, ...skipIds].filter(Boolean));
    const ids = approvalEngine.getUpcomingApproverIds(module, requestId).filter(id => !skip.has(id));
    if (!ids.length) return 0;
    const waiting = approvalEngine.currentApproverNames(module, requestId).join(', ') || 'ขั้นก่อนหน้า';
    const msg = `${baseMsg} — รอ ${waiting} อนุมัติก่อน แล้วจะถึงคิวคุณ`.slice(0, 480);
    const stmt = db.prepare(`INSERT INTO notifications (user_id, type, message, related_id) VALUES (?, ?, ?, ?)`);
    for (const id of ids) stmt.run(id, TYPE[module], msg, requestId);
    return ids.length;
  } catch (err) {
    console.error(`[${module}] notify upcoming approvers error:`, err.message);
    return 0;
  }
}

module.exports = { notifyUpcomingApprovers };
