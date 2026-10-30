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
const NO_APPROVER_MSG = 'ไม่พบผู้อนุมัติที่ใช้งานได้สำหรับคำขอนี้ (ผู้อนุมัติอาจเป็นตัวคุณเองหรือถูกระงับการใช้งาน) กรุณาติดต่อผู้ดูแลระบบ';

// โมดูลที่ "ผู้ขอที่เป็นผู้อนุมัติอยู่แล้ว (หัวหน้า/ผู้อนุมัติ)" อนุมัติคำขอของตัวเองได้
// - visit: หัวหน้าขอไป Visit เอง ถ้าอนุมัติตัวเองไม่ได้ก็ออกไปไม่ได้ จึงอนุญาต
// - leave / ot: เปิดให้เช่นเดียวกัน (ผู้ขอที่เป็นผู้อนุมัติอยู่แล้ว เช่น หัวหน้า อนุมัติใบลา/OT ของตัวเองได้ — ประวัติจะระบุว่า "โดยผู้ขอเอง")
//   ถ้าอยากกลับไปห้ามเฉพาะโมดูลไหน ให้เอาชื่อโมดูลนั้นออกจากรายการนี้
// หมายเหตุ: คนที่ไม่ได้อยู่ในสายอนุมัติ (พนักงานทั่วไป) ยังอนุมัติของตัวเองไม่ได้เหมือนเดิม เพราะไม่มีชื่อเป็นผู้อนุมัติ
const SELF_APPROVE_MODULES = ['visit', 'leave', 'ot'];
const canSelfApprove = (module) => SELF_APPROVE_MODULES.includes(module);

// กรองรายชื่อผู้อนุมัติ: ต้องยังใช้งานอยู่ (is_active) และ (ยกเว้นโมดูลที่อนุญาต) ต้องไม่ใช่ผู้ขอเอง (กันอนุมัติคำขอของตัวเอง / กันคำขอค้างที่คนลาออก)
function eligibleApproverIds(ids, requesterId, module) {
  const list = Array.from(new Set((ids || []).map(Number))).filter(id => id && (canSelfApprove(module) || id !== Number(requesterId)));
  if (!list.length) return [];
  const ph = list.map(() => '?').join(',');
  return dbModule.prepare(`SELECT id FROM users WHERE is_active = 1 AND id IN (${ph})`).all(...list).map(r => r.id);
}

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
  const me = dbModule.prepare(`SELECT department FROM users WHERE id = ?`).get(userId);
  states.forEach(s => {
    let approvers;
    if (s.approver_source === 'dept_head') {
      // หัวหน้าตามแผนกของผู้ขอ - ไม่นับตัวผู้ขอเอง (ถ้าผู้ขอเป็นหัวหน้าเอง หรือแผนกไม่มีหัวหน้า ขั้นนี้จะถูกข้าม ไปที่ผู้อนุมัติเลย)
      approvers = me && me.department
        ? dbModule.prepare(`SELECT user_id FROM department_heads WHERE department = ?`).all(me.department).map(r => r.user_id).filter(id => id !== Number(userId))
        : [];
    } else {
      approvers = dbModule.prepare(`SELECT user_id FROM template_state_approvers WHERE state_id = ?`).all(s.id).map(r => r.user_id);
    }
    stateApprovers.set(s.id, approvers);
  });
  return {
    templateId: tpl.id,
    templateName: tpl.name,
    states: states.map(s => ({ name: s.name, slot: s.slot || null, mode: s.mode === 'ALL' ? 'ALL' : 'ANY', approverIds: eligibleApproverIds(stateApprovers.get(s.id) || [], userId, module) }))
      .filter(s => s.approverIds.length) // State ที่ไม่มีผู้อนุมัติเลยข้ามไป กัน workflow ค้าง
  };
}

function buildFallbackPlan(userId, module) {
  const user = dbModule.prepare('SELECT department FROM users WHERE id = ?').get(userId);
  const approverIds = eligibleApproverIds(approverIdsForDepartments([user ? user.department : '']), userId, module);
  return {
    templateId: null,
    templateName: null,
    states: [{ name: FALLBACK_STATE_NAME, mode: 'ANY', approverIds }]
  };
}

// หา "แผน" อนุมัติของผู้ขอ: Template -> fallback ตามแผนก -> Admin คนอื่น (ไม่รวมตัวผู้ขอเอง และเฉพาะคนที่ยังใช้งานอยู่)
// คืน null ถ้าไม่มีใครอนุมัติได้เลย
function resolvePlan(module, requesterId) {
  let plan = findTemplateForRequester(module, requesterId);
  if (!plan || !plan.states.length) plan = buildFallbackPlan(requesterId, module);
  plan.states = plan.states.filter(s => s.approverIds.length);
  // คนเดียวไม่อนุมัติสองขั้น: ถ้าใครอยู่ในขั้นก่อนหน้าแล้ว ตัดชื่อเขาออกจากขั้นหลัง ๆ (ขั้นที่ว่างแล้วจะถูกข้าม)
  const seen = new Set();
  plan.states.forEach(s => { s.approverIds = s.approverIds.filter(id => !seen.has(id)); s.approverIds.forEach(id => seen.add(id)); });
  plan.states = plan.states.filter(s => s.approverIds.length);
  if (!plan.states.length) {
    const allAdmins = dbModule.prepare(`SELECT id FROM users WHERE is_active = 1 AND role = 'Admin'`).all().map(r => r.id);
    const admins = eligibleApproverIds(allAdmins, requesterId, module);
    if (admins.length) plan = { templateId: null, templateName: null, states: [{ name: 'อนุมัติโดย Admin (ไม่พบผู้อนุมัติตามแผนก)', mode: 'ANY', approverIds: admins }] };
  }
  return plan.states.length ? plan : null;
}

// เช็กก่อนบันทึกคำขอว่ามีผู้อนุมัติจริงไหม - คืนข้อความ error หรือ null ถ้าส่งได้ (เรียกก่อนเขียนอะไรลงฐานข้อมูล)
function checkCanSubmit(module, requesterId) {
  return resolvePlan(module, requesterId) ? null : NO_APPROVER_MSG;
}

// สร้าง (หรือสร้างใหม่ทับ) workflow snapshot ให้ request หนึ่งใบ - เรียกตอนส่งคำขอครั้งแรก และตอน resubmit หลังโดนส่งกลับแก้ไข
function createWorkflow(module, requestId, requesterId) {
  const existing = dbModule.prepare(`SELECT id FROM request_workflows WHERE module = ? AND request_id = ?`).get(module, requestId);
  if (existing) {
    dbModule.prepare(`DELETE FROM request_workflows WHERE id = ?`).run(existing.id); // CASCADE ลบ states/approvers ตามไปด้วย
  }

  const plan = resolvePlan(module, requesterId);
  if (!plan) throw new ApprovalError(NO_APPROVER_MSG);

  const wfInfo = dbModule.prepare(`
    INSERT INTO request_workflows (module, request_id, template_id, template_name, current_state_index, status)
    VALUES (?, ?, ?, ?, 0, 'pending')
  `).run(module, requestId, plan.templateId, plan.templateName);
  const workflowId = wfInfo.lastInsertRowid;

  const insertState = dbModule.prepare(`INSERT INTO request_workflow_states (workflow_id, state_index, name, mode, status, slot) VALUES (?, ?, ?, ?, ?, ?)`);
  const insertApprover = dbModule.prepare(`INSERT INTO request_workflow_approvers (workflow_state_id, user_id) VALUES (?, ?)`);
  plan.states.forEach((s, idx) => {
    const stateInfo = insertState.run(workflowId, idx, s.name, s.mode, idx === 0 ? 'pending' : 'waiting', s.slot || null);
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
    return { index: s.state_index, name: s.name, slot: s.slot || null, mode: s.mode, status: s.status, approvers };
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

// ปิด workflow เมื่อคำขอถูกยกเลิก (ไม่งั้นยังค้างเป็น "รอผู้อนุมัติ" ทั้งที่คำขอถูกยกเลิกไปแล้ว)
function closeWorkflow(module, requestId) {
  dbModule.prepare(`UPDATE request_workflows SET status = 'cancelled' WHERE module = ? AND request_id = ? AND status = 'pending'`).run(module, requestId);
}

function listRequestIdsForApprover(module, userId, { onlyCurrentPending = false } = {}) {
  if (onlyCurrentPending) {
    // นับเฉพาะคำขอที่ยังมีสถานะ pending จริง (กันคำขอที่ถูกยกเลิกแล้วแต่ workflow ค้าง)
    const table = REQUEST_TABLE[module];
    const rows = dbModule.prepare(`
      SELECT w.request_id FROM request_workflows w
      JOIN ${table} r ON r.id = w.request_id AND r.status = 'pending'
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

// userId ตัดสินใจคำขอนี้ได้ "ตอนนี้" ไหม: workflow ยัง pending + อยู่ในรายชื่อผู้อนุมัติของ State ปัจจุบัน + ยังไม่ได้ตัดสินใจ
// (ใช้ซ่อนปุ่มอนุมัติ/ไม่อนุมัติสำหรับคนที่กดแล้วจะถูกปฏิเสธอยู่ดี)
function canActOn(module, requestId, userId) {
  const row = dbModule.prepare(`
    SELECT a.decision FROM request_workflows w
    JOIN request_workflow_states s ON s.workflow_id = w.id AND s.state_index = w.current_state_index
    JOIN request_workflow_approvers a ON a.workflow_state_id = s.id
    WHERE w.module = ? AND w.request_id = ? AND w.status = 'pending' AND a.user_id = ?
  `).get(module, requestId, userId);
  return !!row && !row.decision;
}

// ชื่อผู้อนุมัติที่ "ยังไม่ตัดสินใจ" ใน State ปัจจุบัน (ไว้โชว์ว่า "รอ ... อนุมัติ")
function currentApproverNames(module, requestId) {
  return dbModule.prepare(`
    SELECT u.full_name FROM request_workflows w
    JOIN request_workflow_states s ON s.workflow_id = w.id AND s.state_index = w.current_state_index
    JOIN request_workflow_approvers a ON a.workflow_state_id = s.id
    JOIN users u ON u.id = a.user_id
    WHERE w.module = ? AND w.request_id = ? AND w.status = 'pending' AND a.decision IS NULL
    ORDER BY u.full_name
  `).all(module, requestId).map(r => r.full_name);
}

// รีเซ็ตสายอนุมัติได้ไหม: workflow ต้อง pending, อยู่ State แรก และยังไม่มีใครตัดสินใจเลย
// (ถ้ามีคนอนุมัติไปแล้วบางส่วน การรีเซ็ตจะทำให้การตัดสินใจนั้นหาย - ให้ใช้ "ส่งกลับแก้ไข" แล้วส่งใหม่แทน)
function canResync(module, requestId) {
  const wf = dbModule.prepare(`SELECT id, status, current_state_index FROM request_workflows WHERE module = ? AND request_id = ?`).get(module, requestId);
  if (!wf || wf.status !== 'pending' || wf.current_state_index !== 0) return false;
  const decided = dbModule.prepare(`
    SELECT 1 FROM request_workflow_approvers a
    JOIN request_workflow_states s ON s.id = a.workflow_state_id
    WHERE s.workflow_id = ? AND a.decision IS NOT NULL LIMIT 1
  `).get(wf.id);
  return !decided;
}

// สร้าง workflow snapshot ใหม่จาก Template/รายชื่อผู้อนุมัติ "ล่าสุด" ให้คำขอที่ยังรออนุมัติ (สำหรับ Admin: เพิ่มผู้อนุมัติใน Template หลังส่งคำขอไปแล้ว)
function resyncWorkflow(module, requestId, requesterId) {
  if (!canResync(module, requestId)) {
    throw new ApprovalError('รีเซ็ตสายอนุมัติไม่ได้: คำขอนี้ไม่ได้รออนุมัติอยู่ หรือมีผู้อนุมัติตัดสินใจไปแล้ว (ให้ใช้ "ส่งกลับแก้ไข" แล้วส่งใหม่แทน)');
  }
  return createWorkflow(module, requestId, requesterId);
}

// หลัง Admin แก้ขั้นตอนของ Template: ซิงก์คำขอที่ยังรออนุมัติ "และยังไม่มีใครตัดสินใจ" ของ Template นี้ให้ใช้รายชื่อล่าสุดอัตโนมัติ
// คืนรายการ { module, requestId, requesterId } ที่ซิงก์สำเร็จ (ใบที่มีคนตัดสินใจไปแล้วจะไม่ถูกแตะ)
const REQUEST_TABLE = { visit: 'visit_requests', leave: 'leave_requests', ot: 'ot_requests' };
function autoResyncForTemplate(templateId) {
  const wfs = dbModule.prepare(`SELECT module, request_id FROM request_workflows WHERE template_id = ? AND status = 'pending'`).all(templateId);
  const done = [];
  for (const w of wfs) {
    const table = REQUEST_TABLE[w.module];
    if (!table || !canResync(w.module, w.request_id)) continue;
    const row = dbModule.prepare(`SELECT requester_id, status FROM ${table} WHERE id = ?`).get(w.request_id);
    if (!row || row.status !== 'pending') continue;
    try {
      createWorkflow(w.module, w.request_id, row.requester_id);
      done.push({ module: w.module, requestId: w.request_id, requesterId: row.requester_id });
    } catch (e) { if (!(e instanceof ApprovalError)) throw e; }
  }
  return done;
}

// ตัดสินใจของ userId ต่อ request ในโมดูลนี้ - action: 'approve' | 'reject' | 'revision'
// คืนค่า { finalStatus } เมื่อ workflow จบแล้ว (approved/rejected/revision) หรือ { finalStatus: null, advanced: true/false } เมื่อยังไม่จบ (state ผ่านแล้วไปต่อ หรือรอคนอื่นในสเตทเดียวกันอยู่)
function decide(module, requestId, userId, action, comment, requesterId) {
  // requesterId: ส่งมาจาก route เสมอ — ผู้ขอห้ามอนุมัติ/ปฏิเสธคำขอของตัวเอง (ยกเว้นโมดูลใน SELF_APPROVE_MODULES และต้องเป็นผู้อนุมัติของขั้นตอนนั้นจริง)
  if (!canSelfApprove(module) && requesterId != null && Number(requesterId) === Number(userId)) {
    throw new ApprovalError('ไม่สามารถอนุมัติหรือดำเนินการคำขอของตัวเองได้');
  }
  const wf = dbModule.prepare(`SELECT * FROM request_workflows WHERE module = ? AND request_id = ?`).get(module, requestId);
  if (!wf) throw new ApprovalError('ไม่พบ workflow ของคำขอนี้');
  if (wf.status !== 'pending') throw new ApprovalError('คำขอนี้ถูกดำเนินการไปแล้ว');

  const state = dbModule.prepare(`SELECT * FROM request_workflow_states WHERE workflow_id = ? AND state_index = ?`).get(wf.id, wf.current_state_index);
  const approverRow = dbModule.prepare(`SELECT * FROM request_workflow_approvers WHERE workflow_state_id = ? AND user_id = ?`).get(state.id, userId);
  if (!approverRow) throw new ApprovalError('คุณไม่ได้อยู่ในลำดับผู้อนุมัติของคำขอนี้ในขั้นตอนปัจจุบัน');
  if (approverRow.decision) throw new ApprovalError('คุณตัดสินใจคำขอนี้ไปแล้ว');
  // กันคำขอเดิมที่สร้างไว้ก่อนมีกฎนี้: ถ้าเคยอนุมัติในขั้นก่อนหน้าของ workflow เดียวกันแล้ว ห้ามอนุมัติซ้ำในขั้นนี้
  const prior = dbModule.prepare(`SELECT 1 FROM request_workflow_approvers a JOIN request_workflow_states s ON s.id = a.workflow_state_id
    WHERE s.workflow_id = ? AND s.state_index < ? AND a.user_id = ? AND a.decision = 'approve' LIMIT 1`).get(wf.id, wf.current_state_index, userId);
  if (prior) throw new ApprovalError('คุณอนุมัติคำขอนี้ในขั้นก่อนหน้าไปแล้ว ขั้นนี้ต้องให้ผู้อื่นอนุมัติ');

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
  // นับเฉพาะ: (1) ยังอยู่ใน Template ปัจจุบัน หรือ (2) เป็นผู้อนุมัติของคำขอที่ยังค้างอยู่จริง (ยังไม่ตัดสินใจ)
  // ไม่นับประวัติ workflow เก่าที่จบไปแล้ว
  const inTemplate = dbModule.prepare(`SELECT 1 FROM template_state_approvers WHERE user_id = ? LIMIT 1`).get(userId);
  if (inTemplate) return true;
  return !!dbModule.prepare(`
    SELECT 1 FROM request_workflow_approvers a
    JOIN request_workflow_states s ON s.id = a.workflow_state_id
    JOIN request_workflows w ON w.id = s.workflow_id
    WHERE a.user_id = ? AND a.decision IS NULL AND w.status = 'pending' LIMIT 1`).get(userId);
}

module.exports = {
  ApprovalError,
  createWorkflow,
  checkCanSubmit,
  getWorkflow,
  getCurrentApproverIds,
  isWorkflowParticipant,
  canActOn,
  autoResyncForTemplate,
  currentApproverNames,
  canResync,
  resyncWorkflow,
  listRequestIdsForApprover,
  closeWorkflow,
  hasEverBeenApprover,
  decide,
  FALLBACK_STATE_NAME
};
