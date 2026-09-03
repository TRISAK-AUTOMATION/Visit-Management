// utils/emailFields.js
// รวมข้อมูลที่จะแสดงในอีเมลแจ้งอนุมัติ (sendNewRequestEmail) จาก 3 แหล่ง ตามลำดับ:
//   1. Field พื้นฐาน (essential_field_email_settings) - ลูกค้า/วันที่/เวลา/วัตถุประสงค์
//   2. Field เดิมของระบบ (core_field_settings) ที่ Admin ติ๊ก "แสดงใน Email" ไว้ เรียงตาม sort_order
//   3. Field ที่ Admin สร้างเอง (custom_form_fields) ที่ active + ติ๊ก "แสดงใน Email" ไว้ เรียงตาม sort_order
// ทุกจุดอ่านอย่างเดียว ไม่แก้ข้อมูล จึงปลอดภัยเรียกจากที่ไหนก็ได้ก่อนส่งเมล
const db = require('../db/database');

// ค่าของ field พื้นฐาน อ้างอิงจากคอลัมน์จริงใน visit_requests (ผ่าน object vr ที่ query มาแล้ว รวม customer_name)
function essentialValue(fieldKey, vr) {
  switch (fieldKey) {
    case 'customer_id': return vr.customer_name || '-';
    case 'visit_date': return vr.visit_date;
    case 'time_range': return `${vr.time_from} - ${vr.time_to}`;
    case 'purpose': return vr.purpose;
    default: return '';
  }
}

function getEmailRows(vr) {
  const rows = [];

  const essentials = db.prepare(
    'SELECT field_key, label FROM essential_field_email_settings WHERE show_in_email = 1 ORDER BY sort_order ASC'
  ).all();
  for (const f of essentials) {
    rows.push({ label: f.label, value: essentialValue(f.field_key, vr) });
  }

  const coreFields = db.prepare(
    'SELECT field_key, label FROM core_field_settings WHERE show_in_email = 1 ORDER BY sort_order ASC'
  ).all();
  for (const f of coreFields) {
    rows.push({ label: f.label, value: vr[f.field_key] });
  }

  const customFields = db.prepare(
    'SELECT id, field_key, label FROM custom_form_fields WHERE is_active = 1 AND show_in_email = 1 ORDER BY sort_order ASC'
  ).all();
  if (customFields.length) {
    const getValue = db.prepare('SELECT value FROM visit_custom_values WHERE visit_request_id = ? AND field_id = ?');
    for (const f of customFields) {
      const row = getValue.get(vr.id, f.id);
      rows.push({ label: f.label, value: row ? row.value : '' });
    }
  }

  return rows;
}

// อ่านค่าตั้งค่า "แสดงเลขที่เอกสาร (#VR-code) ในอีเมล" - true/false (default true ถ้ายังไม่เคยตั้งค่า)
function getShowDocCode() {
  const row = db.prepare(`SELECT value FROM system_settings WHERE key = 'email_show_doc_code'`).get();
  return row ? row.value === '1' : true;
}

module.exports = { getEmailRows, getShowDocCode };
