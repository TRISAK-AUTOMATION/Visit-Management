// utils/userDepartments.js - จัดการความสัมพันธ์ "ผู้ใช้ 1 คน ดูแลได้หลายแผนก" (เช่น หัวหน้าที่คุมมากกว่า 1 แผนก)
// ใช้ตาราง user_departments (many-to-many) แยกจาก users.department (แผนกหลัก) ที่ยังคงไว้เพื่อความเข้ากันได้กับของเดิม
const db = require('../db/database');

// รายชื่อแผนกทั้งหมดที่ user คนนี้ดูแล/สังกัดอยู่ เรียงตามตัวอักษร
function getDepartmentsForUser(userId) {
  return db.prepare('SELECT department FROM user_departments WHERE user_id = ? ORDER BY department')
    .all(userId).map(r => r.department);
}

// แทนที่รายการแผนกทั้งหมดของ user คนนี้ (ลบของเดิมแล้วใส่ใหม่ทั้งชุด)
// พร้อม sync users.department (แผนกหลัก) ให้เป็นแผนกแรกในลิสต์ เพื่อให้หน้าจอ/รายงานเก่าที่ยังอ่าน users.department ตรงกัน
function setDepartmentsForUser(userId, departments) {
  const list = Array.from(new Set((departments || []).map(d => (d || '').trim()).filter(Boolean)));
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM user_departments WHERE user_id = ?').run(userId);
    const insert = db.prepare('INSERT OR IGNORE INTO user_departments (user_id, department) VALUES (?, ?)');
    list.forEach(d => insert.run(userId, d));
    db.prepare('UPDATE users SET department = ? WHERE id = ?').run(list[0] || '', userId);
  });
  tx();
  return list;
}

// รายชื่อ id ของผู้อนุมัติ (role=Approver, active เท่านั้น) ที่ดูแลแผนกใดแผนกหนึ่งในลิสต์นี้
// (ไม่รวม Admin เพราะ Admin เห็น/อนุมัติได้ทุกคำขออยู่แล้วโดยไม่ต้องเช็คแผนก)
function approverIdsForDepartments(departmentList) {
  const list = (departmentList || []).filter(Boolean);
  if (!list.length) return [];
  const placeholders = list.map(() => '?').join(',');
  return db.prepare(`
    SELECT DISTINCT u.id FROM users u
    JOIN user_departments ud ON ud.user_id = u.id
    WHERE u.is_active = 1 AND u.role = 'Approver' AND ud.department IN (${placeholders})
  `).all(...list).map(r => r.id);
}

module.exports = { getDepartmentsForUser, setDepartmentsForUser, approverIdsForDepartments };
