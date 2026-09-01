// routes/users.js
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { requireAuth, requireRole } = require('./middleware');
const { logAction } = require('../utils/systemLog');

const router = express.Router();

function sanitize(u) {
  const { password_hash, ...rest } = u;
  return rest;
}

// โปรไฟล์ของตัวเอง
router.put('/me', requireAuth, (req, res) => {
  const { full_name, email, phone, position, department, email_notify } = req.body;
  db.prepare(`
    UPDATE users SET full_name = ?, email = ?, phone = ?, position = ?, department = ?, email_notify = ?
    WHERE id = ?
  `).run(full_name, email, phone, position, department, email_notify ? 1 : 0, req.session.userId);
  res.json({ ok: true });
});

router.put('/me/password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(400).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
  }
  const newHash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.session.userId);
  res.json({ ok: true });
});

// ---------- ADMIN: จัดการผู้ใช้ ----------
router.get('/', requireAuth, requireRole('Admin'), (req, res) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY id').all();
  res.json({ users: rows.map(sanitize) });
});

router.post('/', requireAuth, requireRole('Admin'), (req, res) => {
  const { username, password, full_name, email, phone, position, department, role } = req.body;
  if (!username || !password || !full_name) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }
  const dup = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (dup) return res.status(400).json({ error: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' });

  const info = db.prepare(`
    INSERT INTO users (username, password_hash, full_name, email, phone, position, department, role)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(username, bcrypt.hashSync(password, 10), full_name, email || '', phone || '', position || '', department || '', role || 'Employee');
  logAction(req.session.userId, 'create_user', `สร้างผู้ใช้ใหม่ ${username} (${full_name})`);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/:id', requireAuth, requireRole('Admin'), (req, res) => {
  const { full_name, email, phone, position, department, role } = req.body;
  const exists = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!exists) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  db.prepare(`
    UPDATE users SET full_name = ?, email = ?, phone = ?, position = ?, department = ?, role = ?
    WHERE id = ?
  `).run(full_name, email || '', phone || '', position || '', department || '', role, req.params.id);
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

router.delete('/:id', requireAuth, requireRole('Admin'), (req, res) => {
  if (Number(req.params.id) === req.session.userId) {
    return res.status(400).json({ error: 'ไม่สามารถลบบัญชีของตัวเองได้' });
  }
  const userId = req.params.id;
  const target = db.prepare('SELECT username, full_name FROM users WHERE id = ?').get(userId);
  if (!target) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });

  const ownRequestCount = db.prepare('SELECT COUNT(*) c FROM visit_requests WHERE requester_id = ?').get(userId).c;
  const otherUsage = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM visit_requests WHERE approver_id = ? AND requester_id != ?) +
      (SELECT COUNT(*) FROM approval_history WHERE action_by = ?) +
      (SELECT COUNT(*) FROM notifications WHERE user_id = ?) +
      (SELECT COUNT(*) FROM system_logs WHERE user_id = ?) AS c
  `).get(userId, userId, userId, userId, userId).c;

  const cascade = req.query.cascade === '1';

  if ((ownRequestCount > 0 || otherUsage > 0) && !cascade) {
    return res.status(400).json({
      error: `ไม่สามารถลบผู้ใช้นี้ได้ตรงๆ เนื่องจากมีประวัติการใช้งานในระบบอยู่ (คำขอ Visit ของตัวเอง ${ownRequestCount} รายการ) กรุณาใช้ "ระงับการใช้งาน" แทน หรือยืนยันลบแบบรวมประวัติทั้งหมด`,
      requiresCascadeConfirm: true,
      ownRequestCount
    });
  }

  const run = db.transaction(() => {
    const ownRequestIds = db.prepare('SELECT id FROM visit_requests WHERE requester_id = ?').all(userId).map(r => r.id);

    if (ownRequestIds.length) {
      const placeholders = ownRequestIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM approval_tokens WHERE visit_request_id IN (${placeholders})`).run(...ownRequestIds);
      db.prepare(`DELETE FROM approval_history WHERE visit_request_id IN (${placeholders})`).run(...ownRequestIds);
      db.prepare(`DELETE FROM notifications WHERE related_id IN (${placeholders})`).run(...ownRequestIds);
      db.prepare(`DELETE FROM visit_requests WHERE id IN (${placeholders})`).run(...ownRequestIds);
    }

    // คำขอ "ของคนอื่น" ที่ user นี้เคยเป็นผู้อนุมัติ/มีชื่ออยู่ - ไม่ลบคำขอ แค่ล้างการอ้างอิงถึง user นี้ออก
    db.prepare('UPDATE visit_requests SET approver_id = NULL WHERE approver_id = ?').run(userId);
    db.prepare('UPDATE approval_history SET action_by = NULL WHERE action_by = ?').run(userId);
    db.prepare('DELETE FROM approval_tokens WHERE approver_id = ?').run(userId);
    db.prepare('DELETE FROM notifications WHERE user_id = ?').run(userId);
    db.prepare('UPDATE system_logs SET user_id = NULL WHERE user_id = ?').run(userId);

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  });
  run();

  logAction(req.session.userId, 'delete_user',
    `ลบผู้ใช้ ${target.username} (${target.full_name})${ownRequestCount ? ` พร้อมคำขอ Visit เก่า ${ownRequestCount} รายการ` : ''}`);
  res.json({ ok: true, deletedRequests: ownRequestCount });
});

module.exports = router;
