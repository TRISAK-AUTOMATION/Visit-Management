// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { requireAuth } = require('./middleware');
const { logAction } = require('../utils/systemLog');
const { getDepartmentsForUser } = require('../utils/userDepartments');
const approvalEngine = require('../utils/approvalEngine');

const router = express.Router();

// มีสิทธิ์ประเมิน/แก้ไขโปรไฟล์คนอื่นไหม (ใช้โชว์เมนู "ทีมของฉัน") - เป็นหัวหน้า/Admin โดยตำแหน่ง หรือได้รับสิทธิ์พิเศษจาก Admin ก็ได้
function computeCanEvaluate(user) {
  if (user.role === 'Approver' || user.role === 'Admin') return true;
  const grant = db.prepare('SELECT 1 FROM profile_edit_permissions WHERE editor_user_id = ?').get(user.id);
  return !!grant;
}

// มีสิทธิ์เข้าหน้า "อนุมัติการลา" ไหม - เป็นหัวหน้า/Admin โดยตำแหน่ง หรือถูก Admin ตั้งเป็นผู้อนุมัติใน Template (ไม่ว่า role จะเป็นอะไร)
function computeCanApproveLeave(user) {
  if (user.role === 'Approver' || user.role === 'Admin') return true;
  return approvalEngine.hasEverBeenApprover(user.id);
}

router.post('/login', (req, res) => {
  const { username, password, remember } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }
  if (!user.is_active) {
    return res.status(403).json({ error: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ' });
  }
  req.session.userId = user.id;
  req.session.role = user.role;
  // ติ๊ก "จำฉันไว้ในระบบ" = อยู่ได้ 30 วัน, ไม่ติ๊ก = 8 ชั่วโมงเหมือนเดิม
  req.session.cookie.maxAge = remember ? 1000 * 60 * 60 * 24 * 30 : 1000 * 60 * 60 * 8;
  logAction(user.id, 'login', `เข้าสู่ระบบ (${user.username})`);
  res.json({ user: { ...sanitize(user), departments: getDepartmentsForUser(user.id), can_evaluate: computeCanEvaluate(user), can_approve_leave: computeCanApproveLeave(user) } });
});

router.post('/logout', requireAuth, (req, res) => {
  const userId = req.session.userId;
  logAction(userId, 'logout', 'ออกจากระบบ');
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'ไม่พบผู้ใช้' });
  res.json({ user: { ...sanitize(user), departments: getDepartmentsForUser(user.id), can_evaluate: computeCanEvaluate(user), can_approve_leave: computeCanApproveLeave(user) } });
});

function sanitize(user) {
  const { password_hash, ...rest } = user;
  return rest;
}

module.exports = router;
