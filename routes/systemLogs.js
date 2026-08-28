// routes/systemLogs.js - Admin: ดู audit trail การกระทำสำคัญในระบบ
const express = require('express');
const db = require('../db/database');
const { requireAuth, requireRole } = require('./middleware');

const router = express.Router();

// GET /api/system-logs?action=&user_id=&limit=
router.get('/', requireAuth, requireRole('Admin'), (req, res) => {
  const { action, user_id, limit } = req.query;
  const where = [];
  const params = [];
  if (action) { where.push('l.action = ?'); params.push(action); }
  if (user_id) { where.push('l.user_id = ?'); params.push(user_id); }

  const lim = Math.min(Number(limit) || 200, 500);

  const rows = db.prepare(`
    SELECT l.*, u.full_name AS actor_name, u.username AS actor_username
    FROM system_logs l
    LEFT JOIN users u ON u.id = l.user_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY l.created_at DESC
    LIMIT ?
  `).all(...params, lim);

  const actions = db.prepare(`SELECT DISTINCT action FROM system_logs ORDER BY action`).all().map(r => r.action);

  res.json({ logs: rows, actions });
});

module.exports = router;
