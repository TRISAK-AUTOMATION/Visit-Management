// utils/approvalReminders.js - เตือนผู้อนุมัติเมื่อมีใบ (Visit / ลา / OT) ค้างรออนุมัติเกิน REMIND_AFTER_HOURS
// ส่งเป็นการแจ้งเตือนในระบบ (กระดิ่ง) ให้เฉพาะผู้อนุมัติที่ "ยังไม่ตัดสินใจ" ใน State ปัจจุบัน
// เตือนซ้ำได้อีกหลังผ่านไป REPEAT_AFTER_HOURS ถ้ายังค้างอยู่ (กันเตือนถี่เกินไป)
const REMIND_AFTER_HOURS = Math.max(1, parseInt(process.env.REMIND_AFTER_HOURS, 10) || 24);
const REPEAT_AFTER_HOURS = 23;

const MODULES = [
  { module: 'visit', table: 'visit_requests', prefix: '', label: 'Visit' },
  { module: 'leave', table: 'leave_requests', prefix: 'leave_', label: 'ลา' },
  { module: 'ot', table: 'ot_requests', prefix: 'ot_', label: 'OT' }
];

function runApprovalReminders(db) {
  let sent = 0;
  const ins = db.prepare(`INSERT INTO notifications (user_id, type, message, related_id) VALUES (?, ?, ?, ?)`);
  for (const m of MODULES) {
    // ใบที่รออนุมัติ + "รอมาตั้งแต่เมื่อไร" = เวลาที่เริ่มรอ State ปัจจุบัน (ส่งคำขอ หรือ State ก่อนหน้าอนุมัติเสร็จ)
    const rows = db.prepare(`
      SELECT r.id, r.code, u.full_name AS requester_name,
             COALESCE((SELECT MAX(a.decided_at) FROM request_workflow_states s2
                       JOIN request_workflow_approvers a ON a.workflow_state_id = s2.id
                       WHERE s2.workflow_id = w.id AND s2.state_index < w.current_state_index), w.created_at) AS waiting_since,
             w.id AS wf_id, w.current_state_index
      FROM ${m.table} r
      JOIN request_workflows w ON w.module = ? AND w.request_id = r.id AND w.status = 'pending'
      JOIN users u ON u.id = r.requester_id
      WHERE r.status = 'pending'
        AND COALESCE((SELECT MAX(a.decided_at) FROM request_workflow_states s2
                      JOIN request_workflow_approvers a ON a.workflow_state_id = s2.id
                      WHERE s2.workflow_id = w.id AND s2.state_index < w.current_state_index), w.created_at) <= datetime('now', ?)
    `).all(m.module, `-${REMIND_AFTER_HOURS} hours`);

    for (const r of rows) {
      const approvers = db.prepare(`
        SELECT a.user_id FROM request_workflow_states s
        JOIN request_workflow_approvers a ON a.workflow_state_id = s.id
        WHERE s.workflow_id = ? AND s.state_index = ? AND a.decision IS NULL
      `).all(r.wf_id, r.current_state_index);
      const type = `${m.prefix}reminder`;
      const hrs = Math.max(REMIND_AFTER_HOURS, Math.floor((Date.now() - new Date(String(r.waiting_since).replace(' ', 'T') + 'Z').getTime()) / 3600000) || 0);
      const days = Math.floor(hrs / 24);
      const waited = days >= 1 ? `${days} วัน` : `${hrs} ชั่วโมง`;
      for (const a of approvers) {
        const dup = db.prepare(`SELECT 1 FROM notifications WHERE user_id = ? AND type = ? AND related_id = ? AND created_at > datetime('now', ?) LIMIT 1`)
          .get(a.user_id, type, r.id, `-${REPEAT_AFTER_HOURS} hours`);
        if (dup) continue;
        ins.run(a.user_id, type, `เตือน: คำขอ ${m.label} ${r.code} ของ ${r.requester_name} ค้างรออนุมัติมา ${waited}`, r.id);
        sent++;
      }
    }
  }
  return sent;
}

// ตรวจทุกชั่วโมง (เริ่มหลังเปิดระบบ 5 นาที)
function startReminderSchedule(db) {
  const run = () => { try { const n = runApprovalReminders(db); if (n) console.log(`[reminder] ส่งเตือนผู้อนุมัติ ${n} รายการ`); } catch (e) { console.error('[reminder] ไม่สำเร็จ:', e.message); } };
  setTimeout(() => { run(); setInterval(run, 60 * 60 * 1000); }, 5 * 60 * 1000);
}

module.exports = { runApprovalReminders, startReminderSchedule, REMIND_AFTER_HOURS };
