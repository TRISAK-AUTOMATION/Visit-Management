// utils/profilePermissions.js - ใครแก้ไขโปรไฟล์/คะแนน KPI ของใครได้บ้าง
const db = require('../db/database');
const { getDepartmentsForUser } = require('./userDepartments');

// viewer แก้ไขโปรไฟล์/คะแนนของ target ได้ไหม
// กฎ: Admin แก้ได้ทุกคนเสมอ | หัวหน้า (Approver) แก้ได้เฉพาะคนที่อยู่แผนกเดียวกัน | หรือมีการมอบสิทธิ์พิเศษจาก Admin
function canEditProfile(viewerId, targetId) {
  if (Number(viewerId) === Number(targetId)) return false; // แก้คะแนนตัวเองไม่ได้
  const viewer = db.prepare('SELECT role FROM users WHERE id = ?').get(viewerId);
  if (!viewer) return false;
  if (viewer.role === 'Admin') return true;

  if (viewer.role === 'Approver') {
    const viewerDepts = getDepartmentsForUser(viewerId);
    const targetDepts = getDepartmentsForUser(targetId);
    if (viewerDepts.some(d => targetDepts.includes(d))) return true;
  }

  const grant = db.prepare('SELECT 1 FROM profile_edit_permissions WHERE editor_user_id = ? AND target_user_id = ?').get(viewerId, targetId);
  return !!grant;
}

module.exports = { canEditProfile };
