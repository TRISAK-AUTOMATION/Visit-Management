// routes/emailSettings.js - Admin: ตั้งค่าที่เกี่ยวกับอีเมลแจ้งอนุมัติ
// 1) เปิด/ปิดแสดงเลขที่เอกสาร (#VR-code) ในอีเมล
// 2) เปิด/ปิด "แสดงใน Email" ของ Field พื้นฐาน (ลูกค้า/วันที่/เวลา/วัตถุประสงค์)
// Field เดิมของระบบ + Field ที่สร้างเอง จัดการที่หน้า Form Builder (routes/coreFields.js และ routes/formFields.js)
const express = require('express');
const db = require('../db/database');
const { requireAuth, requireRole } = require('./middleware');
const { logAction } = require('../utils/systemLog');

const router = express.Router();

router.get('/', requireAuth, requireRole('Admin'), (req, res) => {
  const docCodeRow = db.prepare(`SELECT value FROM system_settings WHERE key = 'email_show_doc_code'`).get();
  const essentialFields = db.prepare(
    'SELECT field_key, label, show_in_email FROM essential_field_email_settings ORDER BY sort_order ASC'
  ).all().map(r => ({ ...r, show_in_email: !!r.show_in_email }));

  res.json({
    show_doc_code: docCodeRow ? docCodeRow.value === '1' : true,
    essential_fields: essentialFields
  });
});

// PUT /api/email-settings/doc-code -> { show_doc_code: true/false }
router.put('/doc-code', requireAuth, requireRole('Admin'), (req, res) => {
  const value = req.body.show_doc_code ? '1' : '0';
  db.prepare(`INSERT INTO system_settings (key, value) VALUES ('email_show_doc_code', ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(value);
  logAction(req.session.userId, 'update_email_settings',
    `${value === '1' ? 'เปิด' : 'ปิด'}แสดงเลขที่เอกสารในอีเมล`);
  res.json({ ok: true, show_doc_code: value === '1' });
});

// PUT /api/email-settings/essential/:field_key -> { show_in_email: true/false }
router.put('/essential/:field_key', requireAuth, requireRole('Admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM essential_field_email_settings WHERE field_key = ?').get(req.params.field_key);
  if (!existing) return res.status(404).json({ error: 'ไม่พบ Field นี้' });
  const showInEmail = req.body.show_in_email ? 1 : 0;
  db.prepare(`UPDATE essential_field_email_settings SET show_in_email = ?, updated_at = datetime('now'), updated_by = ? WHERE field_key = ?`)
    .run(showInEmail, req.session.userId, req.params.field_key);
  logAction(req.session.userId, 'update_email_settings',
    `${showInEmail ? 'เปิด' : 'ปิด'}แสดงใน Email สำหรับ Field พื้นฐาน: ${existing.label} (${req.params.field_key})`);
  res.json({ ok: true, show_in_email: !!showInEmail });
});

module.exports = router;
