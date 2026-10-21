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

// ลบแจ้งเตือนของตัวเอง — /clear ต้องอยู่ก่อน /:id (ไม่งั้น "clear" ถูกมองเป็น id)
// DELETE /api/notifications/clear?scope=read  -> ลบเฉพาะที่อ่านแล้ว ; scope=all -> ลบทั้งหมด
router.delete('/clear', requireAuth, (req, res) => {
  const all = req.query.scope === 'all';
  const info = db.prepare(`DELETE FROM notifications WHERE user_id = ? ${all ? '' : 'AND is_read = 1'}`).run(req.session.userId);
  res.json({ ok: true, deleted: info.changes });
});

router.delete('/:id', requireAuth, (req, res) => {
  const info = db.prepare(`DELETE FROM notifications WHERE id = ? AND user_id = ?`).run(req.params.id, req.session.userId);
  if (!info.changes) return res.status(404).json({ error: 'ไม่พบการแจ้งเตือนนี้' });
  res.json({ ok: true });
});

module.exports = router;
