// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { requireAuth } = require('./middleware');
const { logAction } = require('../utils/systemLog');
const { getDepartmentsForUser } = require('../utils/userDepartments');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
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
  logAction(user.id, 'login', `เข้าสู่ระบบ (${user.username})`);
  res.json({ user: { ...sanitize(user), departments: getDepartmentsForUser(user.id) } });
});

router.post('/logout', requireAuth, (req, res) => {
  const userId = req.session.userId;
  logAction(userId, 'logout', 'ออกจากระบบ');
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'ไม่พบผู้ใช้' });
  res.json({ user: { ...sanitize(user), departments: getDepartmentsForUser(user.id) } });
});

function sanitize(user) {
  const { password_hash, ...rest } = user;
  return rest;
}

module.exports = router;
