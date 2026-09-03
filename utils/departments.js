// utils/departments.js - จัดการรายชื่อ "แผนก" ที่ใช้เป็นตัวเลือก (dropdown) ทั่วทั้งระบบ
// เก็บเป็น JSON array ไว้ใน system_settings (key = 'departments') เพื่อให้ Admin เพิ่ม/ลบแผนกเองได้
// ภายหลังโดยไม่ต้องแก้โค้ด/deploy ใหม่ทุกครั้งที่มีแผนกใหม่
const db = require('../db/database');

const KEY = 'departments';
const DEFAULT_DEPARTMENTS = ['Sales', 'IT', 'Engineer', 'บัญชี/Accounting', 'HR', 'Stor'];

function getDepartments() {
  const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(KEY);
  if (!row) return DEFAULT_DEPARTMENTS;
  try {
    const arr = JSON.parse(row.value);
    return Array.isArray(arr) ? arr : DEFAULT_DEPARTMENTS;
  } catch (e) {
    return DEFAULT_DEPARTMENTS;
  }
}

function saveDepartments(list) {
  db.prepare(`INSERT INTO system_settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(KEY, JSON.stringify(list));
}

// ใช้ตรวจตอนสร้าง/แก้ไขผู้ใช้ (routes/users.js) - อนุญาตค่าว่าง (ยังไม่ระบุแผนก) หรือค่าที่อยู่ในลิสต์เท่านั้น
function isValidDepartment(department) {
  if (!department) return true;
  return getDepartments().includes(department);
}

module.exports = { getDepartments, saveDepartments, isValidDepartment, DEFAULT_DEPARTMENTS };
