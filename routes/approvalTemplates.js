// routes/approvalTemplates.js - Admin: จัดการ Template ของระบบอนุมัติ (Template Builder)
const express = require('express');
const db = require('../db/database');
const { requireAuth, requireRole } = require('./middleware');
const { logAction } = require('../utils/systemLog');
const approvalEngine = require('../utils/approvalEngine');
const { getDepartments } = require('../utils/departments');
const SLOTS = ['head', 'checker', 'approver'];

const router = express.Router();
const MODULES = ['leave', 'ot', 'visit']; // V1 รองรับแค่ Leave, ตอนนี้ขยายรองรับ OT และ Visit ด้วยแล้ว

router.use(requireAuth, requireRole('Admin'));

function loadTemplateDetail(id) {
  const tpl = db.prepare(`SELECT * FROM approval_templates WHERE id = ?`).get(id);
  if (!tpl) return null;
  const requesters = db.prepare(`
    SELECT u.id, u.full_name, u.department, u.position FROM template_requesters tr
    JOIN users u ON u.id = tr.user_id WHERE tr.template_id = ? ORDER BY u.full_name
  `).all(id);
  const stateRows = db.prepare(`SELECT * FROM template_states WHERE template_id = ? ORDER BY sort_order ASC, id ASC`).all(id);
  const states = stateRows.map(s => ({
    id: s.id,
    name: s.name,
    mode: s.mode,
    slot: s.slot || null,
    approver_source: s.approver_source || 'manual',
    approvers: db.prepare(`
      SELECT u.id, u.full_name, u.department FROM template_state_approvers a
      JOIN users u ON u.id = a.user_id WHERE a.state_id = ? ORDER BY u.full_name
    `).all(s.id)
  }));
  return { ...tpl, requesters, states };
}

router.get('/', (req, res) => {
  const module_ = req.query.module || 'leave';
  const rows = db.prepare(`SELECT * FROM approval_templates WHERE module = ? ORDER BY created_at DESC`).all(module_);
  const withCounts = rows.map(t => ({
    ...t,
    requester_count: db.prepare(`SELECT COUNT(*) AS c FROM template_requesters WHERE template_id = ?`).get(t.id).c,
    state_count: db.prepare(`SELECT COUNT(*) AS c FROM template_states WHERE template_id = ?`).get(t.id).c
  }));
  res.json({ templates: withCounts });
});

// หัวหน้าแผนก (ต้องประกาศก่อน '/:id')
router.get('/department-heads', (req, res) => {
  const rows = db.prepare(`SELECT department, user_id FROM department_heads`).all();
  const names = new Set(getDepartments());
  db.prepare(`SELECT DISTINCT department FROM users WHERE department IS NOT NULL AND department != ''`).all().forEach(r => names.add(r.department));
  res.json({ departments: [...names].map(d => ({ department: d, user_ids: rows.filter(r => r.department === d).map(r => r.user_id) })) });
});
router.put('/department-heads', (req, res) => {
  const department = String(req.body.department || '').trim();
  if (!department) return res.status(400).json({ error: 'ไม่ระบุแผนก' });
  const ids = Array.from(new Set((req.body.user_ids || []).map(Number).filter(Boolean)));
  db.transaction(() => {
    db.prepare(`DELETE FROM department_heads WHERE department = ?`).run(department);
    const ins = db.prepare(`INSERT OR IGNORE INTO department_heads (department, user_id) VALUES (?, ?)`);
    ids.forEach(uid => ins.run(department, uid));
  })();
  logAction(req.session.userId, 'update_department_heads', `ตั้งหัวหน้าแผนก \"${department}\" (${ids.length} คน)`);
  res.json({ ok: true });
});

router.get('/:id', (req, res) => {
  const detail = loadTemplateDetail(req.params.id);
  if (!detail) return res.status(404).json({ error: 'ไม่พบ Template' });
  res.json({ template: detail });
});

router.post('/', (req, res) => {
  const { module: module_, name } = req.body;
  if (!MODULES.includes(module_)) return res.status(400).json({ error: 'โมดูลไม่ถูกต้อง' });
  if (!name || !name.trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อ Template' });
  const info = db.prepare(`INSERT INTO approval_templates (module, name, created_by) VALUES (?, ?, ?)`)
    .run(module_, name.trim(), req.session.userId);
  logAction(req.session.userId, 'create_approval_template', `สร้าง Template อนุมัติ "${name.trim()}" (${module_})`);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const tpl = db.prepare(`SELECT * FROM approval_templates WHERE id = ?`).get(req.params.id);
  if (!tpl) return res.status(404).json({ error: 'ไม่พบ Template' });
  const { name, is_active } = req.body;
  db.prepare(`UPDATE approval_templates SET name = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`)
    .run((name || tpl.name).trim(), typeof is_active === 'undefined' ? tpl.is_active : (is_active ? 1 : 0), req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const tpl = db.prepare(`SELECT * FROM approval_templates WHERE id = ?`).get(req.params.id);
  if (!tpl) return res.status(404).json({ error: 'ไม่พบ Template' });
  // คำขอที่กำลังวิ่งอยู่ด้วย Template นี้จะไม่กระทบ เพราะ workflow ของแต่ละคำขอเป็น snapshot แยกไว้แล้ว
  db.prepare(`DELETE FROM approval_templates WHERE id = ?`).run(req.params.id);
  logAction(req.session.userId, 'delete_approval_template', `ลบ Template อนุมัติ "${tpl.name}"`);
  res.json({ ok: true });
});

// แทนที่รายชื่อ Requester ทั้งหมดของ Template นี้
router.put('/:id/requesters', (req, res) => {
  const tpl = db.prepare(`SELECT * FROM approval_templates WHERE id = ?`).get(req.params.id);
  if (!tpl) return res.status(404).json({ error: 'ไม่พบ Template' });
  const ids = Array.from(new Set((req.body.user_ids || []).map(Number).filter(Boolean)));
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM template_requesters WHERE template_id = ?`).run(req.params.id);
    const insert = db.prepare(`INSERT OR IGNORE INTO template_requesters (template_id, user_id) VALUES (?, ?)`);
    ids.forEach(uid => insert.run(req.params.id, uid));
  });
  tx();
  res.json({ ok: true });
});

// แทนที่ State ทั้งหมดของ Template นี้ (ลำดับตามที่ส่งมา, ลบของเดิมทั้งหมดแล้วสร้างใหม่)
// body: { states: [{ name, mode: 'ANY'|'ALL', approver_ids: [...] }, ...] }
router.put('/:id/states', (req, res) => {
  const tpl = db.prepare(`SELECT * FROM approval_templates WHERE id = ?`).get(req.params.id);
  if (!tpl) return res.status(404).json({ error: 'ไม่พบ Template' });
  const states = Array.isArray(req.body.states) ? req.body.states : [];
  if (!states.length) return res.status(400).json({ error: 'ต้องมีอย่างน้อย 1 ขั้นตอนอนุมัติ' });
  for (const s of states) {
    if (!s.name || !s.name.trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อทุกขั้นตอน' });
    if (s.slot && !SLOTS.includes(s.slot)) return res.status(400).json({ error: 'ช่องลงนามไม่ถูกต้อง' });
    if (s.approver_source === 'dept_head') continue; // ผู้อนุมัติดึงจากหัวหน้าแผนกของผู้ขอตอนส่งคำขอ ไม่ต้องเลือกรายชื่อ
    if (!Array.isArray(s.approver_ids) || !s.approver_ids.length) return res.status(400).json({ error: `ขั้นตอน "${s.name}" ต้องมีผู้อนุมัติอย่างน้อย 1 คน` });
  }
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM template_states WHERE template_id = ?`).run(req.params.id); // CASCADE ลบ approvers ตามไปด้วย
    const insertState = db.prepare(`INSERT INTO template_states (template_id, name, sort_order, mode, slot, approver_source) VALUES (?, ?, ?, ?, ?, ?)`);
    const insertApprover = db.prepare(`INSERT INTO template_state_approvers (state_id, user_id) VALUES (?, ?)`);
    states.forEach((s, idx) => {
      const src = s.approver_source === 'dept_head' ? 'dept_head' : 'manual';
      const info = insertState.run(req.params.id, s.name.trim(), idx, s.mode === 'ALL' ? 'ALL' : 'ANY', s.slot || null, src);
      if (src === 'manual') Array.from(new Set((s.approver_ids || []).map(Number))).forEach(uid => insertApprover.run(info.lastInsertRowid, uid));
    });
    db.prepare(`UPDATE approval_templates SET updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
  });
  tx();
  logAction(req.session.userId, 'update_approval_template_states', `แก้ไขขั้นตอนอนุมัติของ Template "${tpl.name}"`);

  // คำขอที่ยังรออนุมัติและยังไม่มีใครตัดสินใจ ให้ใช้รายชื่อผู้อนุมัติล่าสุดทันที (เช่น เพิ่มผู้อนุมัติหลังมีคนส่งคำขอไปแล้ว)
  let synced = [];
  try {
    synced = approvalEngine.autoResyncForTemplate(Number(req.params.id));
    const HIST = {
      visit: `INSERT INTO approval_history (visit_request_id, action_by, action, channel) VALUES (?, ?, ?, 'web')`,
      leave: `INSERT INTO leave_history (leave_request_id, action_by, action) VALUES (?, ?, ?)`,
      ot: `INSERT INTO ot_history (ot_request_id, action_by, action) VALUES (?, ?, ?)`
    };
    const routes = { visit: '../routes/visitRequests', leave: '../routes/leave', ot: '../routes/ot' };
    for (const s of synced) {
      db.prepare(HIST[s.module]).run(s.requestId, req.session.userId, 'อัปเดตสายอนุมัติอัตโนมัติ (Template ถูกแก้ไข)');
      try {
        const requester = db.prepare('SELECT full_name, department FROM users WHERE id = ?').get(s.requesterId);
        const notify = require(routes[s.module]).notifySubmitted;
        if (typeof notify === 'function') {
          if (s.module === 'visit') notify(s.requestId, requester, true); else notify(s.requestId, true);
        }
      } catch (e) { console.error('auto-resync notify error:', e.message); }
    }
    if (synced.length) logAction(req.session.userId, 'auto_resync_workflows', `อัปเดตสายอนุมัติอัตโนมัติ ${synced.length} คำขอ จาก Template "${tpl.name}"`);
  } catch (e) { console.error('auto-resync error:', e.message); }
  res.json({ ok: true, resynced: synced.length });
});

module.exports = router;
