// utils/requestAccess.js - กติกา "ใครดูคำขอใบนี้ได้" ที่ใช้ร่วมกัน (รายละเอียดคำขอ, PDF)
// ตรงกับเงื่อนไขของ GET /:id ใน visitRequests.js / ot.js / leave.js:
//   เจ้าของคำขอ, Admin, ผู้อยู่ในสายอนุมัติของคำขอนั้น, หรือผู้มีสิทธิ์อนุมัติ (canViewAll) ที่ดูได้ยกเว้นฉบับร่างของคนอื่น
const approvalEngine = require('./approvalEngine');
const { canViewAll } = require('./viewScope');

// module: 'visit' | 'leave' | 'ot' ; row ต้องมี id, requester_id, status
function canViewRequest(session, module, row) {
  if (!session || !session.userId || !row) return false;
  if (Number(row.requester_id) === Number(session.userId)) return true;
  if (session.role === 'Admin') return true;
  if (approvalEngine.isWorkflowParticipant(module, row.id, session.userId)) return true;
  return canViewAll(session) && row.status !== 'draft';
}

module.exports = { canViewRequest };
