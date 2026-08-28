// utils/systemLog.js - บันทึก audit trail การกระทำสำคัญของผู้ใช้งาน
const db = require('../db/database');

function logAction(userId, action, details) {
  try {
    db.prepare(`INSERT INTO system_logs (user_id, action, details) VALUES (?, ?, ?)`)
      .run(userId || null, action, details || '');
  } catch (err) {
    console.error('[systemLog] บันทึก log ไม่สำเร็จ:', err.message);
  }
}

module.exports = { logAction };
