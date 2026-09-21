// routes/kpi.js - ระบบประเมินผลงาน (KPI) ต่อพนักงาน
const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('./middleware');
const { canEditProfile } = require('../utils/profilePermissions');
const { toThaiDate } = require('../utils/dateFormat');

const router = express.Router();

const CATEGORIES = ['attendance', 'performance', 'responsibility', 'teamwork', 'discipline'];

function ensureKpi(userId) {
  const existing = db.prepare('SELECT * FROM employee_kpi WHERE user_id = ?').get(userId);
  if (existing) return existing;
  db.prepare('INSERT INTO employee_kpi (user_id) VALUES (?)').run(userId);
  return db.prepare('SELECT * FROM employee_kpi WHERE user_id = ?').get(userId);
}

// ใครดูโปรไฟล์/คะแนนของใครได้บ้าง: ตัวเอง, Admin, คนที่แก้ไขให้ได้ (canEditProfile) ดูได้หมด
function canView(req, targetId) {
  if (Number(req.session.userId) === Number(targetId)) return true;
  if (req.session.role === 'Admin') return true;
  return canEditProfile(req.session.userId, targetId);
}

router.get('/:userId', requireAuth, (req, res) => {
  const targetId = req.params.userId;
  if (!canView(req, targetId)) return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ดูข้อมูลนี้' });

  const user = db.prepare('SELECT id, full_name, position, department, avatar_url, is_active, created_at FROM users WHERE id = ?').get(targetId);
  if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });

  const kpi = ensureKpi(targetId);
  const checklist = db.prepare('SELECT * FROM employee_kpi_checklist WHERE user_id = ? ORDER BY category, sort_order, id').all(targetId);

  // สถิติอัตโนมัติจากข้อมูลจริงในระบบ (ปีนี้)
  const leaveCount = db.prepare(`
    SELECT COUNT(*) AS c FROM leave_requests WHERE requester_id = ? AND status = 'approved' AND strftime('%Y', date_from) = strftime('%Y', 'now')
  `).get(targetId).c;
  const visitSuccess = db.prepare(`
    SELECT COUNT(*) AS c FROM visit_requests WHERE requester_id = ? AND status = 'approved' AND strftime('%Y', created_at) = strftime('%Y', 'now')
  `).get(targetId).c;
  const otSuccess = db.prepare(`
    SELECT COUNT(*) AS c FROM ot_requests WHERE requester_id = ? AND status = 'approved' AND strftime('%Y', ot_date) = strftime('%Y', 'now')
  `).get(targetId).c;

  const overall = Math.round((kpi.attendance_score + kpi.performance_score + kpi.responsibility_score + kpi.teamwork_score + kpi.discipline_score) / 5);

  res.json({
    user,
    kpi: { ...kpi, overall_score: overall },
    checklist,
    auto_stats: { leave_count: leaveCount, visit_success: visitSuccess, ot_success: otSuccess },
    can_edit: canEditProfile(req.session.userId, targetId)
  });
});

router.put('/:userId', requireAuth, (req, res) => {
  const targetId = req.params.userId;
  if (!canEditProfile(req.session.userId, targetId)) return res.status(403).json({ error: 'คุณไม่มีสิทธิ์แก้ไขคะแนนของคนนี้' });

  const { attendance_score, performance_score, responsibility_score, teamwork_score, discipline_score,
    late_count, absent_count, pending_tasks, work_status } = req.body;
  const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0));

  ensureKpi(targetId);
  db.prepare(`
    UPDATE employee_kpi SET attendance_score = ?, performance_score = ?, responsibility_score = ?, teamwork_score = ?, discipline_score = ?,
      late_count = ?, absent_count = ?, pending_tasks = ?, work_status = ?, updated_by = ?, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(
    clamp(attendance_score), clamp(performance_score), clamp(responsibility_score), clamp(teamwork_score), clamp(discipline_score),
    Number(late_count) || 0, Number(absent_count) || 0, Number(pending_tasks) || 0, work_status || 'ปกติ',
    req.session.userId, targetId
  );
  res.json({ ok: true });
});

router.post('/:userId/checklist', requireAuth, (req, res) => {
  const targetId = req.params.userId;
  if (!canEditProfile(req.session.userId, targetId)) return res.status(403).json({ error: 'คุณไม่มีสิทธิ์แก้ไขข้อมูลนี้' });
  const { category, label } = req.body;
  if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'หมวด KPI ไม่ถูกต้อง' });
  if (!label || !label.trim()) return res.status(400).json({ error: 'กรุณาระบุข้อความเช็คลิสต์' });
  const maxOrder = db.prepare('SELECT MAX(sort_order) AS m FROM employee_kpi_checklist WHERE user_id = ? AND category = ?').get(targetId, category).m || 0;
  const info = db.prepare('INSERT INTO employee_kpi_checklist (user_id, category, label, sort_order, created_by) VALUES (?, ?, ?, ?, ?)')
    .run(targetId, category, label.trim(), maxOrder + 1, req.session.userId);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/checklist/:itemId', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM employee_kpi_checklist WHERE id = ?').get(req.params.itemId);
  if (!item) return res.status(404).json({ error: 'ไม่พบรายการ' });
  // แก้สถานะติ๊กถูกได้ทั้งเจ้าของโปรไฟล์ (ดูอย่างเดียวไม่ได้ แก้เอง) และคนที่มีสิทธิ์แก้ไข
  const isSelf = Number(req.session.userId) === Number(item.user_id);
  if (!isSelf && !canEditProfile(req.session.userId, item.user_id)) {
    return res.status(403).json({ error: 'คุณไม่มีสิทธิ์แก้ไขข้อมูลนี้' });
  }
  const { is_checked, label } = req.body;
  if (typeof is_checked !== 'undefined') {
    db.prepare('UPDATE employee_kpi_checklist SET is_checked = ? WHERE id = ?').run(is_checked ? 1 : 0, req.params.itemId);
  }
  if (typeof label !== 'undefined' && !isSelf) {
    db.prepare('UPDATE employee_kpi_checklist SET label = ? WHERE id = ?').run(label, req.params.itemId);
  }
  res.json({ ok: true });
});

router.delete('/checklist/:itemId', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM employee_kpi_checklist WHERE id = ?').get(req.params.itemId);
  if (!item) return res.status(404).json({ error: 'ไม่พบรายการ' });
  if (!canEditProfile(req.session.userId, item.user_id)) return res.status(403).json({ error: 'คุณไม่มีสิทธิ์แก้ไขข้อมูลนี้' });
  db.prepare('DELETE FROM employee_kpi_checklist WHERE id = ?').run(req.params.itemId);
  res.json({ ok: true });
});

router.get('/:userId/activity', requireAuth, (req, res) => {
  const targetId = req.params.userId;
  if (!canView(req, targetId)) return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ดูข้อมูลนี้' });
  const NOISY = ['login', 'logout'];
  const rows = db.prepare(`
    SELECT id, action, details, created_at FROM system_logs
    WHERE user_id = ? ORDER BY created_at DESC LIMIT 40
  `).all(targetId).filter(r => !NOISY.includes(r.action));
  res.json({ activity: rows.slice(0, 10).map(r => ({ ...r, date_th: toThaiDate(r.created_at) })) });
});

// ===== Admin: มอบ/ถอนสิทธิ์แก้ไขโปรไฟล์คนอื่นเพิ่มเติม =====
router.get('/permissions/all', requireAuth, (req, res) => {
  if (req.session.role !== 'Admin') return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้' });
  const rows = db.prepare(`
    SELECT p.id, p.editor_user_id, e.full_name AS editor_name, p.target_user_id, t.full_name AS target_name, p.created_at
    FROM profile_edit_permissions p
    JOIN users e ON e.id = p.editor_user_id
    JOIN users t ON t.id = p.target_user_id
    ORDER BY p.created_at DESC
  `).all();
  res.json({ permissions: rows });
});

router.post('/permissions', requireAuth, (req, res) => {
  if (req.session.role !== 'Admin') return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้' });
  const { editor_user_id, target_user_id } = req.body;
  if (!editor_user_id || !target_user_id) return res.status(400).json({ error: 'กรุณาเลือกทั้งผู้แก้ไขและเจ้าของข้อมูล' });
  if (Number(editor_user_id) === Number(target_user_id)) return res.status(400).json({ error: 'ไม่สามารถมอบสิทธิ์ให้แก้ไขข้อมูลตัวเองได้' });
  try {
    db.prepare('INSERT INTO profile_edit_permissions (editor_user_id, target_user_id, granted_by) VALUES (?, ?, ?)')
      .run(editor_user_id, target_user_id, req.session.userId);
    res.status(201).json({ ok: true });
  } catch (err) {
    if (/UNIQUE constraint/.test(err.message)) return res.status(400).json({ error: 'มอบสิทธิ์นี้ไว้อยู่แล้ว' });
    throw err;
  }
});

router.delete('/permissions/:id', requireAuth, (req, res) => {
  if (req.session.role !== 'Admin') return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้' });
  db.prepare('DELETE FROM profile_edit_permissions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// รายชื่อคนที่ฉันมีสิทธิ์แก้ไขโปรไฟล์ได้ (ทีมของฉัน) - ใช้ทำหน้า "ทีมของฉัน" สำหรับหัวหน้า
router.get('/team/mine', requireAuth, (req, res) => {
  if (!['Approver', 'Admin'].includes(req.session.role)) return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้' });
  const all = db.prepare(`SELECT id, full_name, position, department, avatar_url, is_active FROM users WHERE id != ? ORDER BY full_name`).all(req.session.userId);
  const mine = all.filter(u => canEditProfile(req.session.userId, u.id));
  res.json({ team: mine });
});

module.exports = router;
