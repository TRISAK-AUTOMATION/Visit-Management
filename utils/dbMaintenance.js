// utils/dbMaintenance.js - สร้าง index ที่ยังไม่มี (ปลอดภัยรันซ้ำได้ ใช้ IF NOT EXISTS)
// เรียกตอนสตาร์ท server: ไม่แตะข้อมูล ไม่แก้โครงสร้างตาราง แค่เพิ่ม index ให้ query ที่ใช้บ่อยเร็วขึ้นเมื่อข้อมูลโตขึ้น
// ถ้า index ใดสร้างไม่ได้ (เช่น ตารางยังไม่มี) จะข้ามไปและแจ้งเตือนใน console โดยไม่ทำให้ server ล้ม
const INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_leave_requests_requester ON leave_requests(requester_id)',
  'CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status)',
  'CREATE INDEX IF NOT EXISTS idx_ot_requests_requester ON ot_requests(requester_id)',
  'CREATE INDEX IF NOT EXISTS idx_ot_requests_status ON ot_requests(status)',
  'CREATE INDEX IF NOT EXISTS idx_ot_requests_customer ON ot_requests(customer_id)',
  'CREATE INDEX IF NOT EXISTS idx_system_logs_user_created ON system_logs(user_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_request_workflows_request ON request_workflows(module, request_id)',
  'CREATE INDEX IF NOT EXISTS idx_request_workflow_states_wf ON request_workflow_states(workflow_id, state_index)',
  'CREATE INDEX IF NOT EXISTS idx_request_workflow_approvers_user ON request_workflow_approvers(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_request_workflow_approvers_state ON request_workflow_approvers(workflow_state_id)',
  'CREATE INDEX IF NOT EXISTS idx_template_state_approvers_user ON template_state_approvers(user_id)'
];

// ตารางที่เพิ่มภายหลัง (ปลอดภัยรันซ้ำได้)
function ensureTables(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS holidays (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      holiday_date TEXT UNIQUE NOT NULL,   -- YYYY-MM-DD
      name         TEXT NOT NULL,
      created_at   TEXT DEFAULT (datetime('now'))
    )`);
  } catch (err) { console.warn('[db] สร้างตาราง holidays ไม่สำเร็จ:', err.message); }
}

function ensureIndexes(db) {
  for (const sql of INDEXES) {
    try { db.exec(sql); }
    catch (err) { console.warn('[db] สร้าง index ไม่สำเร็จ (ข้ามไป):', err.message, '-', sql); }
  }
}

// เพิ่มคอลัมน์ที่ยังไม่มี (ปลอดภัยรันซ้ำได้: เช็คก่อนว่ามีหรือยัง ไม่แตะข้อมูลเดิม)
//   customers.level = ระดับลูกค้า (L1 Strategic ... L5 Low Priority) แก้ไขทีหลังได้จากหน้า Customer
const COLUMNS = [
  { table: 'customers', column: 'level', ddl: 'ALTER TABLE customers ADD COLUMN level TEXT' },
  { table: 'customers', column: 'level_updated_at', ddl: 'ALTER TABLE customers ADD COLUMN level_updated_at TEXT' }
];
function ensureColumns(db) {
  for (const c of COLUMNS) {
    try {
      const has = db.prepare(`PRAGMA table_info(${c.table})`).all().some(r => r.name === c.column);
      if (!has) db.exec(c.ddl);
    } catch (err) { console.warn('[db] เพิ่มคอลัมน์ไม่สำเร็จ (ข้ามไป):', err.message, '-', c.ddl); }
  }
}

module.exports = { ensureIndexes, ensureColumns, ensureTables, INDEXES };
