// utils/retention.js - ลบข้อมูลอัตโนมัติตามกฎที่ Admin ตั้งไว้ (retention_settings)
const db = require('../db/database');

const DATA_TYPES = ['system_logs', 'notifications', 'completed_visit_requests', 'archived_customers'];
const COMPLETED_STATUSES = ['approved', 'rejected', 'cancelled'];

// คำนวณวันที่ตัดรอบ (cutoff) ย้อนหลังจากตอนนี้ ตามจำนวน + หน่วยที่ตั้งไว้ คืนเป็น ISO string เทียบกับ created_at ในตาราง (datetime('now') format)
function computeCutoffISO(value, unit) {
  const n = Number(value) || 0;
  const now = new Date();
  const cutoff = new Date(now);
  if (unit === 'day') cutoff.setDate(cutoff.getDate() - n);
  else if (unit === 'year') cutoff.setFullYear(cutoff.getFullYear() - n);
  else cutoff.setMonth(cutoff.getMonth() - n); // default: month
  // SQLite เก็บ created_at เป็น datetime('now') รูปแบบ 'YYYY-MM-DD HH:MM:SS' (UTC) เทียบ string ตรงๆ ได้
  return cutoff.toISOString().slice(0, 19).replace('T', ' ');
}

function cleanupSystemLogs(rule) {
  const cutoff = computeCutoffISO(rule.retain_value, rule.retain_unit);
  const info = db.prepare('DELETE FROM system_logs WHERE created_at < ?').run(cutoff);
  return { deleted: info.changes };
}

function cleanupNotifications(rule) {
  const cutoff = computeCutoffISO(rule.retain_value, rule.retain_unit);
  const info = db.prepare('DELETE FROM notifications WHERE created_at < ?').run(cutoff);
  return { deleted: info.changes };
}

// ลบคำขอ Visit ที่ "จบสิ้นแล้ว" (อนุมัติ/ไม่อนุมัติ/ยกเลิก) และเก่าเกินกำหนด พร้อม cascade ลูกที่ผูกกับคำขอนั้น
function cleanupCompletedVisitRequests(rule) {
  const cutoff = computeCutoffISO(rule.retain_value, rule.retain_unit);
  const placeholders = COMPLETED_STATUSES.map(() => '?').join(',');
  const ids = db.prepare(
    `SELECT id FROM visit_requests WHERE status IN (${placeholders}) AND created_at < ?`
  ).all(...COMPLETED_STATUSES, cutoff).map(r => r.id);

  if (!ids.length) return { deleted: 0 };

  const idPh = ids.map(() => '?').join(',');
  const run = db.transaction(() => {
    db.prepare(`DELETE FROM approval_tokens WHERE visit_request_id IN (${idPh})`).run(...ids);
    db.prepare(`DELETE FROM approval_history WHERE visit_request_id IN (${idPh})`).run(...ids);
    db.prepare(`DELETE FROM notifications WHERE related_id IN (${idPh})`).run(...ids);
    db.prepare(`DELETE FROM visit_requests WHERE id IN (${idPh})`).run(...ids);
  });
  run();
  return { deleted: ids.length };
}

// ลบลูกค้าที่ถูกเก็บถาวรไว้นานเกินกำหนด - เช็คซ้ำเสมอว่ายังไม่มีคำขอ Visit ใดอ้างอิงอยู่ ณ ตอนลบจริง (safety net)
function cleanupArchivedCustomers(rule) {
  const cutoff = computeCutoffISO(rule.retain_value, rule.retain_unit);
  const rows = db.prepare(
    'SELECT id FROM customers WHERE is_archived = 1 AND archived_at IS NOT NULL AND archived_at < ?'
  ).all(cutoff);

  const checkUsage = db.prepare('SELECT COUNT(*) c FROM visit_requests WHERE customer_id = ?');
  const deleteStmt = db.prepare('DELETE FROM customers WHERE id = ?');
  let deleted = 0;
  const run = db.transaction(() => {
    for (const row of rows) {
      if (checkUsage.get(row.id).c > 0) continue; // ยังมีคำขอเก่าอ้างอิงอยู่ ข้ามไปก่อน (เก็บถาวรต่อ)
      deleteStmt.run(row.id);
      deleted++;
    }
  });
  run();
  return { deleted };
}

const CLEANERS = {
  system_logs: cleanupSystemLogs,
  notifications: cleanupNotifications,
  completed_visit_requests: cleanupCompletedVisitRequests,
  archived_customers: cleanupArchivedCustomers
};

const LABELS = {
  system_logs: 'System Logs',
  notifications: 'การแจ้งเตือน',
  completed_visit_requests: 'คำขอ Visit ที่จบสิ้นแล้ว',
  archived_customers: 'ลูกค้าที่ถูกเก็บถาวร'
};

// รันตามกฎที่เปิดใช้งาน (enabled = 1) ทั้งหมด บันทึกผลล่าสุดไว้ในตารางเดียวกัน
function runRetentionCleanup() {
  const rules = db.prepare('SELECT * FROM retention_settings').all();
  const updateRun = db.prepare('UPDATE retention_settings SET last_run_at = datetime(\'now\'), last_run_summary = ? WHERE data_type = ?');
  const results = {};

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const cleaner = CLEANERS[rule.data_type];
    if (!cleaner) continue;
    try {
      const result = cleaner(rule);
      results[rule.data_type] = result;
      updateRun.run(`ลบสำเร็จ ${result.deleted} รายการ`, rule.data_type);
    } catch (err) {
      console.error(`[retention] ลบข้อมูล ${rule.data_type} ไม่สำเร็จ:`, err.message);
      updateRun.run(`เกิดข้อผิดพลาด: ${err.message}`, rule.data_type);
    }
  }
  return results;
}

module.exports = { runRetentionCleanup, computeCutoffISO, DATA_TYPES, LABELS };
