// utils/viewScope.js - ใครเห็นคำขอ "ของทุกคน" ได้บ้าง
// ผู้มีสิทธิ์อนุมัติ (role Approver/Admin หรือถูก Admin ตั้งเป็นผู้อนุมัติในเทมเพลต/เคยอยู่ในสายอนุมัติ) เห็นคำขอทุกคนได้
// เพื่อให้ตัวเลขบน Dashboard กับรายการที่กดเข้าไปดูตรงกัน (การอนุมัติจริงยังจำกัดเฉพาะคนในสายอนุมัติเหมือนเดิม)
// ฉบับร่าง (draft) ของคนอื่นยังเป็นส่วนตัว ไม่เปิดให้เห็น
const approvalEngine = require('./approvalEngine');

function canViewAll(session) {
  if (!session || !session.userId) return false;
  return ['Approver', 'Admin'].includes(session.role) || approvalEngine.hasEverBeenApprover(session.userId);
}

module.exports = { canViewAll };
