// utils/approvalEngine.js - Template-Based Approval Workflow Engine (V1: โมดูล leave)
//
// แนวคิด: ทุก request (เช่น leave_requests 1 แถว) จะมี "workflow snapshot" ของตัวเองใน
// request_workflows/request_workflow_states/request_workflow_approvers ที่คัดลอกมาจาก
// approval_templates ตอนสร้าง/ส่งคำขอ (หรือคัดลอกใหม่ตอน resubmit หลังโดนส่งกลับแก้ไข)
// เพื่อกัน Admin แก้ Template ภายหลังแล้วกระทบ workflow ของคำขอที่วิ่งอยู่แล้ว
//
// ถ้าผู้ขอไม่มี Template ที่ active ครอบคลุมเขาอยู่เลย ระบบจะ fallback ไปสร้าง workflow
// แบบ 1 State + ANY โดยดึงผู้อนุมัติจากแผนก (เหมือนระบบเดิมก่อนมี Template) — เพื่อให้ใช้งานได้ทันที
// โดย Admin ไม่ต้องตั้ง Template ให้ครบทุกคนก่อน ระบบจะติด template_id = NULL ไว้บอกว่าใช้ค่า fallback นี้

const dbModule = require('../db/database');
const { approverIdsForDepartments } = require('./userDepartments');

const FALLBACK_STATE_NAME = 'อนุมัติ (ระบบเดิม - อิงแผนก)';

function findTemplateForRequester(module, userId) {
  const tpl = dbModule.prepare(`
    SELECT t.* FROM approval_templates t
    JOIN template_requesters tr ON tr.template_id = t.id
    WHERE t.module = ? AND t.is_active = 1 AND tr.user_id = ?
    ORDER BY t.id ASC LIMIT 1
  `).get(module, userId);
  if (!tpl) return null;
  const states = dbModule.prepare(`SELECT * FROM template_states WHERE template_id = ? ORDER BY sort_order ASC, id ASC`).all(tpl.id);
  if (!states.length) return null; // Template ไม่มี state เลย ถือว่ายังใช้งานไม่ได้ ปล่อยให้ fallback แทน
  const stateApprovers = new Map();
  states.forEach(s => {
    const approvers = dbModule.prepare(`SELECT user_id FROM template_state_approvers WHERE state_id = ?`).all(s.id).map(r => r.user_id);
    stateApprovers.set(s.id, approvers);
  });
  return {
    templateId: tpl.id,
    templateName: tpl.name,
    states: states.map(s => ({ name: s.name, mode: s.mode === 'ALL' ? 'ALL' : 'ANY', approverIds: stateApprovers.get(s.id) || [] }))
      .filter(s => s.approverIds.length) // State ที่ไม่มีผู้อนุมัติเลยข้ามไป กัน workflow ค้าง
  };
}

function buildFallbackPlan(userId) {
  const user = dbModule.prepare('SELECT department FROM users WHERE id = ?').get(userId);
  const approverIds = approverIdsForDepartments([user ? user.department : '']);
  return {
    templateId: null,
    templateName: null,
    states: [{ name: FALLBACK_STATE_NAME, mode: 'ANY', approverIds }]
  };
}

// สร้าง (หรือสร้างใหม่ทับ) workflow snapshot ให้ request หนึ่งใบ - เรียกตอนส่งคำขอครั้งแรก และตอน resubmit หลังโดนส่งกลับแก้ไข
function createWorkflow(module, requestId, requesterId) {
  const existing = dbModule.prepare(`SELECT id FROM request_workflows WHERE module = ? AND request_id = ?`).get(module, requestId);
  if (existing) {
    dbModule.prepare(`DELETE FROM request_workflows WHERE id = ?`).run(existing.id); // CASCADE ลบ states/approvers ตามไปด้วย
  }

  let plan = findTemplateForRequester(module, requesterId);
  if (!plan || !plan.states.length) plan = buildFallbackPlan(requesterId);
  if (!plan.states.length) {
    // ไม่มีแม้แต่ผู้อนุมัติตามแผนก (ไม่มีหัวหน้าแผนกในระบบ) - กันพังด้วย state เปล่าที่ไม่มีใครอนุมัติได้ ให้ค้างที่ Admin ทุกคนแทน
    const admins = dbModule.prepare(`SELECT id FROM users WHERE is_active = 1 AND role = 'Admin'`).all().map(r => r.id);
    plan = { templateId: null, templateName: null, states: [{ name: 'อนุมัติโดย Admin (ไม่พบผู้อนุมัติตามแผนก)', mode: 'ANY', approverIds: admins }] };
  }

  const wfInfo = dbModule.prepare(`
    INSERT INTO request_workflows (module, request_id, template_id, template_name, current_state_index, status)
    VALUES (?, ?, ?, ?, 0, 'pending')
  `).run(module, requestId, plan.templateId, plan.templateName);
  const workflowId = wfInfo.lastInsertRowid;

  const insertState = dbModule.prepare(`INSERT INTO request_workflow_states (workflow_id, state_index, name, mode, status) VALUES (?, ?, ?, ?, ?)`);
  const insertApprover = dbModule.prepare(`INSERT INTO request_workflow_approvers (workflow_state_id, user_id) VALUES (?, ?)`);
  plan.states.forEach((s, idx) => {
    const stateInfo = insertState.run(workflowId, idx, s.name, s.mode, idx === 0 ? 'pending' : 'waiting');
    const stateId = stateInfo.lastInsertRowid;
    Array.from(new Set(s.approverIds)).forEach(uid => insertApprover.run(stateId, uid));
  });

  return workflowId;
}

function getWorkflow(module, requestId) {
  const wf = dbModule.prepare(`SELECT * FROM request_workflows WHERE module = ? AND request_id = ?`).get(module, requestId);
  if (!wf) return null;
  const states = dbModule.prepare(`SELECT * FROM request_workflow_states WHERE workflow_id = ? ORDER BY state_index ASC`).all(wf.id);
  const stateList = states.map(s => {
    const approvers = dbModule.prepare(`
      SELECT a.user_id, a.decision, a.comment, a.decided_at, u.full_name
      FROM request_workflow_approvers a JOIN users u ON u.id = a.user_id
      WHERE a.workflow_state_id = ?
    `).all(s.id);
    return { index: s.state_index, name: s.name, mode: s.mode, status: s.status, approvers };
  });
  return {
    workflowId: wf.id,
    templateId: wf.template_id,
    templateName: wf.template_name || (wf.template_id === null ? FALLBACK_STATE_NAME : null),
    currentStateIndex: wf.current_state_index,
    status: wf.status,
    states: stateList
  };
}

// ผู้อนุมัติของ State ปัจจุบัน (เฉพาะตอน workflow ยังไม่จบ)
function getCurrentApproverIds(module, requestId) {
  const wf = getWorkflow(module, requestId);
  if (!wf || wf.status !== 'pending') return [];
  const cur = wf.states[wf.currentStateIndex];
  return cur ? cur.approvers.map(a => a.user_id) : [];
}

// userId เป็นผู้อนุมัติ (ไม่ว่า state ไหนก็ตาม เอาไว้ใช้กรองสิทธิ์ดู/ประวัติ) หรือไม่
function isWorkflowParticipant(module, requestId, userId) {
  const row = dbModule.prepare(`
    SELECT 1 FROM request_workflow_approvers a
    JOIN request_workflow_states s ON s.id = a.workflow_state_id
    JOIN request_workflows w ON w.id = s.workflow_id
    WHERE w.module = ? AND w.request_id = ? AND a.user_id = ?
    LIMIT 1
  `).get(module, requestId, userId);
  return !!row;
}

// รายการ request_id ที่ userId เป็นผู้อนุมัติ - onlyCurrentPending = true จะกรองเหลือเฉพาะที่รอ userId ตัดสินใจ ณ ขณะนี้จริงๆ
function listRequestIdsForApprover(module, userId, { onlyCurrentPending = false } = {}) {
  if (onlyCurrentPending) {
    const rows = dbModule.prepare(`
      SELECT w.request_id FROM request_workflows w
      JOIN request_workflow_states s ON s.workflow_id = w.id AND s.state_index = w.current_state_index
      JOIN request_workflow_approvers a ON a.workflow_state_id = s.id
      WHERE w.module = ? AND w.status = 'pending' AND a.user_id = ? AND a.decision IS NULL
    `).all(module, userId);
    return rows.map(r => r.request_id);
  }
  const rows = dbModule.prepare(`
    SELECT DISTINCT w.request_id FROM request_workflows w
    JOIN request_workflow_states s ON s.workflow_id = w.id
    JOIN request_workflow_approvers a ON a.workflow_state_id = s.id
    WHERE w.module = ? AND a.user_id = ?
  `).all(module, userId);
  return rows.map(r => r.request_id);
}

class ApprovalError extends Error {}

// ตัดสินใจของ userId ต่อ request ในโมดูลนี้ - action: 'approve' | 'reject' | 'revision'
// คืนค่า { finalStatus } เมื่อ workflow จบแล้ว (approved/rejected/revision) หรือ { finalStatus: null, advanced: true/false } เมื่อยังไม่จบ (state ผ่านแล้วไปต่อ หรือรอคนอื่นในสเตทเดียวกันอยู่)
function decide(module, requestId, userId, action, comment) {
  const wf = dbModule.prepare(`SELECT * FROM request_workflows WHERE module = ? AND request_id = ?`).get(module, requestId);
  if (!wf) throw new ApprovalError('ไม่พบ workflow ของคำขอนี้');
  if (wf.status !== 'pending') throw new ApprovalError('คำขอนี้ถูกดำเนินการไปแล้ว');

  const state = dbModule.prepare(`SELECT * FROM request_workflow_states WHERE workflow_id = ? AND state_index = ?`).get(wf.id, wf.current_state_index);
  const approverRow = dbModule.prepare(`SELECT * FROM request_workflow_approvers WHERE workflow_state_id = ? AND user_id = ?`).get(state.id, userId);
  if (!approverRow) throw new ApprovalError('คุณไม่ได้อยู่ในลำดับผู้อนุมัติของคำขอนี้ในขั้นตอนปัจจุบัน');
  if (approverRow.decision) throw new ApprovalError('คุณตัดสินใจคำขอนี้ไปแล้ว');

  dbModule.prepare(`UPDATE request_workflow_approvers SET decision = ?, comment = ?, decided_at = datetime('now') WHERE id = ?`)
    .run(action, comment || '', approverRow.id);

  if (action === 'reject') {
    dbModule.prepare(`UPDATE request_workflow_states SET status = 'rejected' WHERE id = ?`).run(state.id);
    dbModule.prepare(`UPDATE request_workflows SET status = 'rejected' WHERE id = ?`).run(wf.id);
    return { finalStatus: 'rejected' };
  }
  if (action === 'revision') {
    dbModule.prepare(`UPDATE request_workflow_states SET status = 'revision' WHERE id = ?`).run(state.id);
    dbModule.prepare(`UPDATE request_workflows SET status = 'revision' WHERE id = ?`).run(wf.id);
    return { finalStatus: 'revision' };
  }

  // action === 'approve'
  if (state.mode === 'ALL') {
    const allApprovers = dbModule.prepare(`SELECT decision FROM request_workflow_approvers WHERE workflow_state_id = ?`).all(state.id);
    const stillWaiting = allApprovers.some(a => a.decision !== 'approve');
    if (stillWaiting) return { finalStatus: null, advanced: false }; // รออีกคนใน state เดียวกัน
  }

  dbModule.prepare(`UPDATE request_workflow_states SET status = 'approved' WHERE id = ?`).run(state.id);
  const totalStates = dbModule.prepare(`SELECT COUNT(*) AS c FROM request_workflow_states WHERE workflow_id = ?`).get(wf.id).c;
  if (wf.current_state_index + 1 >= totalStates) {
    dbModule.prepare(`UPDATE request_workflows SET status = 'approved' WHERE id = ?`).run(wf.id);
    return { finalStatus: 'approved' };
  }
  const nextIndex = wf.current_state_index + 1;
  dbModule.prepare(`UPDATE request_workflows SET current_state_index = ? WHERE id = ?`).run(nextIndex, wf.id);
  dbModule.prepare(`UPDATE request_workflow_states SET status = 'pending' WHERE workflow_id = ? AND state_index = ?`).run(wf.id, nextIndex);
  return { finalStatus: null, advanced: true };
}

// เคยถูกตั้งเป็นผู้อนุมัติในระบบ Template หรือมี workflow ที่ตัวเองอยู่ในสายอนุมัติอยู่ไหม (ไม่ว่า role จะเป็นอะไรก็ตาม)
// ใช้แสดงเมนู "อนุมัติการลา" / อนุญาตเข้าหน้าและ endpoint อนุมัติ ให้คนที่ Admin ตั้งเป็นผู้อนุมัติผ่าน Template แม้ role จะเป็น Employee ก็ตาม
function hasEverBeenApprover(userId) {
  const inTemplate = dbModule.prepare(`SELECT 1 FROM template_state_approvers WHERE user_id = ? LIMIT 1`).get(userId);
  if (inTemplate) return true;
  const inWorkflow = dbModule.prepare(`SELECT 1 FROM request_workflow_approvers WHERE user_id = ? LIMIT 1`).get(userId);
  return !!inWorkflow;
}

module.exports = {
  ApprovalError,
  createWorkflow,
  getWorkflow,
  getCurrentApproverIds,
  isWorkflowParticipant,
  listRequestIdsForApprover,
  hasEverBeenApprover,
  decide,
  FALLBACK_STATE_NAME
};
