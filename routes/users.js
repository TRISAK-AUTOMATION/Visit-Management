// routes/users.js
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { requireAuth, requireRole } = require('./middleware');
const { logAction } = require('../utils/systemLog');
const { isValidDepartment } = require('../utils/departments');
const { getDepartmentsForUser, setDepartmentsForUser } = require('../utils/userDepartments');
const signature = require('../utils/signature');

const router = express.Router();

const VALID_ROLES = ['Employee', 'Approver', 'Admin'];
const MIN_PASSWORD_LENGTH = 6;

function sanitize(u) {
  const { password_hash, ...rest } = u;
  return rest;
}

// โปรไฟล์ของตัวเอง
router.put('/me', requireAuth, (req, res) => {
  const { full_name, email, phone, position, department, email_notify, avatar_url } = req.body;
  if (typeof full_name !== 'string' || !full_name.trim()) {
    return res.status(400).json({ error: 'กรุณากรอกชื่อ-นามสกุล' });
  }
  const textOk = (v) => v === undefined || v === null || (typeof v === 'string' && v.length <= 200);
  if (![email, phone, position].every(textOk)) {
    return res.status(400).json({ error: 'ข้อมูลโปรไฟล์ไม่ถูกต้องหรือยาวเกินไป' });
  }
  if (avatar_url && (typeof avatar_url !== 'string' || avatar_url.length > 3_000_000 || !/^(data:image\/|\/|https?:\/\/)/.test(avatar_url))) {
    return res.status(400).json({ error: 'รูปโปรไฟล์ไม่ถูกต้องหรือมีขนาดใหญ่เกินไป' });
  }
  // แผนกมีผลต่อสิทธิ์ (เช่น เมนู Visit ของแผนก Engineer และสายอนุมัติ) จึงให้เฉพาะ Admin เปลี่ยนได้ — พนักงานแก้ได้แค่ข้อมูลส่วนตัว
  const cur = db.prepare('SELECT department FROM users WHERE id = ?').get(req.session.userId);
  // ตรวจแผนกเฉพาะเมื่อ Admin เปลี่ยนเป็นค่าใหม่ — ถ้าแผนกเดิมถูกลบ/เปลี่ยนชื่อออกจากรายการ ผู้ใช้ยังบันทึกโปรไฟล์ส่วนอื่นได้
  if (req.session.role === 'Admin' && department !== (cur ? cur.department : '') && !isValidDepartment(department)) {
    return res.status(400).json({ error: 'แผนกไม่ถูกต้อง กรุณาเลือกจากรายการ' });
  }
  const newDept = req.session.role === 'Admin' ? department : (cur ? cur.department : '');
  db.prepare(`
    UPDATE users SET full_name = ?, email = ?, phone = ?, position = ?, department = ?, email_notify = ?, avatar_url = ?
    WHERE id = ?
  `).run(full_name.trim(), email || '', phone || '', position || '', newDept, email_notify ? 1 : 0, avatar_url || null, req.session.userId);
  res.json({ ok: true });
});

// ลายเซ็นของตัวเอง (ใช้ฝังในเอกสาร PDF ที่อนุมัติแล้ว) — ดู/แก้ได้เฉพาะของตัวเองเท่านั้น
router.get('/me/signature', requireAuth, (req, res) => {
  res.json({ data_url: signature.getDataUrl(req.session.userId) });
});
router.put('/me/signature', requireAuth, (req, res) => {
  const r = signature.save(req.session.userId, req.body && req.body.data_url);
  if (r.error) return res.status(400).json({ error: r.error });
  logAction(req.session.userId, 'update_signature', 'อัปโหลด/เปลี่ยนลายเซ็น');
  res.json({ ok: true });
});
router.delete('/me/signature', requireAuth, (req, res) => {
  signature.remove(req.session.userId);
  logAction(req.session.userId, 'delete_signature', 'ลบลายเซ็น');
  res.json({ ok: true });
});

router.put('/me/password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body;
  if (typeof current_password !== 'string' || !current_password) {
    return res.status(400).json({ error: 'กรุณากรอกรหัสผ่านปัจจุบัน' });
  }
  if (typeof new_password !== 'string' || new_password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `รหัสผ่านใหม่ต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร` });
  }
  if (new_password.length > 200) {
    return res.status(400).json({ error: 'รหัสผ่านใหม่ยาวเกินไป' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(400).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
  }
  const newHash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.session.userId);
  res.json({ ok: true });
});

// รายชื่อผู้ใช้ในแผนกหนึ่งๆ (สำหรับ dropdown เลือกคน เช่น เชิญ Engineer ร่วมทีมไป Visit) - ทุกคนที่ login แล้วดูได้ ไม่ใช่แค่ Admin
router.get('/by-department/:dept', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT DISTINCT u.id, u.full_name FROM users u
    JOIN user_departments ud ON ud.user_id = u.id
    WHERE ud.department = ? AND u.is_active = 1
    ORDER BY u.full_name
  `).all(req.params.dept);
  res.json({ users: rows });
});

// รายชื่อพนักงานทุกแผนก (เฉพาะชื่อ + แผนก) สำหรับช่อง "ผู้ร่วมงาน" เมื่อต้องการเลือกคนนอกแผนก Engineer - ทุกคนที่ login แล้วดูได้
router.get('/directory', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT id, full_name, department FROM users WHERE is_active = 1 ORDER BY full_name
  `).all();
  res.json({ users: rows });
});

// ---------- ADMIN: จัดการผู้ใช้ ----------
router.get('/', requireAuth, requireRole('Admin'), (req, res) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY id').all();
  res.json({ users: rows.map(u => ({ ...sanitize(u), departments: getDepartmentsForUser(u.id) })) });
});

router.post('/', requireAuth, requireRole('Admin'), (req, res) => {
  const { username, password, full_name, email, phone, position, departments, role } = req.body;
  if (!username || !password || !full_name) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `รหัสผ่านต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร` });
  }
  if (role !== undefined && role !== null && role !== '' && !VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'ตำแหน่ง (role) ไม่ถูกต้อง' });
  }
  const deptList = Array.isArray(departments) ? departments.filter(Boolean) : [];
  const invalidDept = deptList.find(d => !isValidDepartment(d));
  if (invalidDept) {
    return res.status(400).json({ error: `แผนก "${invalidDept}" ไม่ถูกต้อง กรุณาเลือกจากรายการ` });
  }
  const dup = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (dup) return res.status(400).json({ error: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' });

  const info = db.prepare(`
    INSERT INTO users (username, password_hash, full_name, email, phone, position, department, role)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(username, bcrypt.hashSync(password, 10), full_name, email || '', phone || '', position || '', deptList[0] || '', role || 'Employee');
  setDepartmentsForUser(info.lastInsertRowid, deptList);
  logAction(req.session.userId, 'create_user', `สร้างผู้ใช้ใหม่ ${username} (${full_name})`);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/:id', requireAuth, requireRole('Admin'), (req, res) => {
  const { full_name, email, phone, position, departments, role } = req.body;
  const exists = db.prepare('SELECT id, role, is_active FROM users WHERE id = ?').get(req.params.id);
  if (!exists) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'ตำแหน่ง (role) ไม่ถูกต้อง' });
  }
  if (typeof full_name !== 'string' || !full_name.trim()) {
    return res.status(400).json({ error: 'กรุณากรอกชื่อ-นามสกุล' });
  }
  if (![email, phone, position].every((v) => v === undefined || v === null || (typeof v === 'string' && v.length <= 200))) {
    return res.status(400).json({ error: 'ข้อมูลผู้ใช้ไม่ถูกต้องหรือยาวเกินไป' });
  }
  // กันระบบไม่มี Admin เหลือเลย: ห้ามลดสิทธิ์ Admin คนสุดท้ายที่ยังใช้งานอยู่
  if (exists.role === 'Admin' && role !== 'Admin' && exists.is_active) {
    const otherAdmins = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'Admin' AND is_active = 1 AND id != ?`).get(req.params.id).c;
    if (otherAdmins === 0) {
      return res.status(400).json({ error: 'ไม่สามารถลดสิทธิ์ผู้ดูแลระบบคนสุดท้ายได้ ต้องมี Admin อย่างน้อย 1 คน' });
    }
  }
  const deptList = Array.isArray(departments) ? departments.filter(Boolean) : [];
  const invalidDept = deptList.find(d => !isValidDepartment(d));
  if (invalidDept) {
    return res.status(400).json({ error: `แผนก "${invalidDept}" ไม่ถูกต้อง กรุณาเลือกจากรายการ` });
  }
  db.prepare(`
    UPDATE users SET full_name = ?, email = ?, phone = ?, position = ?, role = ?
    WHERE id = ?
  `).run(full_name, email || '', phone || '', position || '', role, req.params.id);
  setDepartmentsForUser(req.params.id, deptList);
  logAction(req.session.userId, 'update_user', `แก้ไขข้อมูลผู้ใช้ #${req.params.id} (${full_name})`);
  res.json({ ok: true });
});

// เปิด/ปิดการใช้งานบัญชี
router.patch('/:id/active', requireAuth, requireRole('Admin'), (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  if (Number(req.params.id) === req.session.userId) {
    return res.status(400).json({ error: 'ไม่สามารถระงับบัญชีของตัวเองได้' });
  }
  const isActive = req.body.is_active ? 1 : 0;
  db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(isActive, req.params.id);
  logAction(req.session.userId, isActive ? 'enable_user' : 'disable_user',
    `${isActive ? 'เปิดใช้งาน' : 'ระงับการใช้งาน'}บัญชี ${target.username} (${target.full_name})`);
  res.json({ ok: true, is_active: !!isActive });
});

// Admin รีเซ็ตรหัสผ่านให้ผู้ใช้ (ใช้กรณีพนักงานลืมรหัสผ่าน)
router.put('/:id/password', requireAuth, requireRole('Admin'), (req, res) => {
  const { new_password } = req.body;
  if (!new_password || String(new_password).length < 6) {
    return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' });
  }
  const target = db.prepare('SELECT username, full_name FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(new_password), 10), req.params.id);
  // ไม่ใส่รหัสผ่านลงใน log
  logAction(req.session.userId, 'reset_password', `รีเซ็ตรหัสผ่านให้ ${target.username} (${target.full_name})`);
  res.json({ ok: true });
});

router.delete('/:id', requireAuth, requireRole('Admin'), (req, res) => {
  if (Number(req.params.id) === req.session.userId) {
    return res.status(400).json({ error: 'ไม่สามารถลบบัญชีของตัวเองได้' });
  }
  const target = db.prepare('SELECT username, full_name FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  try {
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  } catch (err) {
    // ผู้ใช้รายนี้มีข้อมูลเชื่อมโยงอยู่ในระบบ (เคยส่งคำขอ Visit, อนุมัติ, มี log ฯลฯ)
    // ลบไม่ได้เพราะจะทำให้ข้อมูลเก่าเสียหาย (ประวัติ Visit ไม่รู้ว่าใครเป็นคนขอ) — ให้ระงับการใช้งานแทน
    if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || err.code === 'SQLITE_CONSTRAINT') {
      return res.status(400).json({
        error: `ไม่สามารถลบผู้ใช้ "${target.full_name}" ได้ เนื่องจากมีข้อมูลเชื่อมโยงอยู่ในระบบ (เคยส่งคำขอ Visit / อนุมัติ / มีประวัติการใช้งาน) กรุณากด "ระงับการใช้งาน" แทนการลบ เพื่อไม่ให้ข้อมูลเก่าเสียหาย`
      });
    }
    throw err;
  }
  logAction(req.session.userId, 'delete_user', `ลบผู้ใช้ ${target.username} (${target.full_name})`);
  res.json({ ok: true });
});

module.exports = router;