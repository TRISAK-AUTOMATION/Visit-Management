// routes/dashboard.js
const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('./middleware');

const router = express.Router();

router.get('/stats', requireAuth, (req, res) => {
  const { userId, role } = req.session;
  let scope = '';
  let params = [];

  if (role === 'Employee') {
    scope = 'AND vr.requester_id = ?';
    params = [userId];
  } else if (role === 'Approver') {
    // Approver เห็นเฉพาะสถิติของคำขอในแผนกตัวเอง (ไม่รวมฉบับร่าง/รอแก้ไข ที่ยังอยู่กับผู้ขอ)
    const me = db.prepare('SELECT department FROM users WHERE id = ?').get(userId);
    scope = `AND u.department = ? AND vr.status != 'draft' AND vr.status != 'revision'`;
    params = [me ? me.department : ''];
  }
  // Admin: ไม่มีการกรอง เห็นทุกคำขอ

  const joinUser = 'JOIN users u ON u.id = vr.requester_id';

  const total = db.prepare(`SELECT COUNT(*) c FROM visit_requests vr ${joinUser} WHERE 1=1 ${scope}`).get(...params).c;
  const pending = db.prepare(`SELECT COUNT(*) c FROM visit_requests vr ${joinUser} WHERE vr.status='pending' ${scope}`).get(...params).c;
  const approved = db.prepare(`SELECT COUNT(*) c FROM visit_requests vr ${joinUser} WHERE vr.status='approved' ${scope}`).get(...params).c;
  const rejected = db.prepare(`SELECT COUNT(*) c FROM visit_requests vr ${joinUser} WHERE vr.status='rejected' ${scope}`).get(...params).c;

  const latest = db.prepare(`
    SELECT vr.*, c.name AS customer_name
    FROM visit_requests vr JOIN customers c ON c.id = vr.customer_id ${joinUser}
    WHERE 1=1 ${scope}
    ORDER BY vr.created_at DESC LIMIT 5
  `).all(...params);

  const upcoming = db.prepare(`
    SELECT vr.*, c.name AS customer_name
    FROM visit_requests vr JOIN customers c ON c.id = vr.customer_id ${joinUser}
    WHERE vr.status='approved' AND vr.visit_date >= date('now') ${scope}
    ORDER BY vr.visit_date ASC LIMIT 5
  `).all(...params);

  res.json({
    stats: { total, pending, approved, rejected },
    latest,
    upcoming
  });
});

module.exports = router;
