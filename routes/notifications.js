// routes/notifications.js
const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('./middleware');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
  `).all(req.session.userId);
  const unread = db.prepare(`SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND is_read = 0`).get(req.session.userId).c;
  res.json({ notifications: rows, unread });
});

router.post('/:id/read', requireAuth, (req, res) => {
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`).run(req.params.id, req.session.userId);
  res.json({ ok: true });
});

router.post('/read-all', requireAuth, (req, res) => {
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`).run(req.session.userId);
  res.json({ ok: true });
});

module.exports = router;
