// routes/middleware.js
const db = require('../db/database');

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
  }
  // เช็คว่าบัญชียังเปิดใช้งานอยู่หรือไม่ทุกครั้ง (เผื่อ Admin สั่งปิดใช้งานระหว่างที่ session ยังอยู่)
  const user = db.prepare('SELECT is_active FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !user.is_active) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ' });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !roles.includes(req.session.role)) {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
