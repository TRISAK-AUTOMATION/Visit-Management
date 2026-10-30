// routes/pdfSettings.js - Admin: ออกแบบหน้าตาเอกสาร PDF (ใบขออนุมัติ/รายงานการปฏิบัติงาน)
// ให้ Admin ปรับสี, โลโก้, ข้อความหัวเอกสาร, เปิด/ปิด-จัดลำดับหมวดที่พิมพ์ ได้เองโดยไม่ต้องแก้โค้ด
const express = require('express');
const db = require('../db/database');
const { requireAuth, requireRole } = require('./middleware');
const { logAction } = require('../utils/systemLog');

const router = express.Router();

const KEYS = [
  'pdf_primary_color', 'pdf_accent_color', 'pdf_logo_base64', 'pdf_org_name',
  'pdf_org_subtitle', 'pdf_doc_title', 'pdf_show_signature', 'pdf_section_order', 'pdf_section_visible', 'pdf_docs_json'
];

// ตั้งค่าแยกรายเอกสาร (ค่าเริ่มต้น = ข้อความที่พิมพ์อยู่ในปัจจุบัน)
const DOC_DEFAULTS = {
  visit_form: { label: 'ใบขออนุมัติออกนอกสถานที่ (ครึ่ง A4)', title: 'ใบขออนุมัติออกนอกสถานที่', subtitle: '(Visit Request Form)', show_signature: true, footer: '' },
  visit_report: { label: 'รายงาน Visit แบบละเอียด (A4 เต็มหน้า)', title: 'Visit Report', subtitle: 'ใบรายงานการเข้าพบลูกค้า', show_signature: true, footer: '' },
  leave: { label: 'ใบลา', company: 'Factory Automation Centre Co.,Ltd', title: 'ใบลา', show_signature: true },
  ot: { label: 'ใบขอทำงานล่วงเวลา (OT)', company: 'Factory Automation Centre Co.,Ltd', title: 'Overtime Request and Approval', show_signature: true }
};
const DOC_TEXT_KEYS = ['title', 'subtitle', 'footer', 'company'];
const DOC_TEXT_MAX = 120;
const DOC_KEYS = Object.keys(DOC_DEFAULTS);

const SECTION_LABELS = {
  requester: 'ข้อมูลผู้ขออนุมัติ',
  customer: 'ข้อมูลลูกค้า/บริษัท',
  work: 'รายละเอียดการปฏิบัติงาน',
  approval: 'ผลการพิจารณาอนุมัติ'
};

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function readSettings() {
  const rows = db.prepare(`SELECT key, value FROM system_settings WHERE key IN (${KEYS.map(() => '?').join(',')})`).all(...KEYS);
  const map = {};
  rows.forEach(r => { map[r.key] = r.value; });
  let sectionOrder = ['requester', 'customer', 'work', 'approval'];
  let sectionVisible = { requester: true, customer: true, work: true, approval: true };
  try { sectionOrder = JSON.parse(map.pdf_section_order || '[]'); } catch (e) { /* ใช้ default */ }
  try { sectionVisible = JSON.parse(map.pdf_section_visible || '{}'); } catch (e) { /* ใช้ default */ }
  return {
    primary_color: map.pdf_primary_color || '#0b1530',
    accent_color: map.pdf_accent_color || '#2f5bff',
    logo_base64: map.pdf_logo_base64 || '',
    org_name: map.pdf_org_name || 'TRISAK',
    org_subtitle: map.pdf_org_subtitle || 'VISIT MANAGEMENT SYSTEM',
    doc_title: map.pdf_doc_title || 'ใบขออนุมัติออกนอกสถานที่ (Visit Request Form)',
    show_signature: (map.pdf_show_signature ?? '1') === '1',
    section_order: sectionOrder,
    section_visible: sectionVisible,
    docs: readDocs(map.pdf_docs_json)
  };
}

function readDocs(raw) {
  let saved = {};
  try { saved = JSON.parse(raw || '{}') || {}; } catch (e) { /* ใช้ default */ }
  const out = {};
  DOC_KEYS.forEach((k) => {
    const d = { ...DOC_DEFAULTS[k] }; const sv = saved[k] || {};
    DOC_TEXT_KEYS.forEach((f) => { if (f in d && typeof sv[f] === 'string' && (sv[f].trim() || f === 'footer' || f === 'subtitle')) d[f] = sv[f].trim().slice(0, DOC_TEXT_MAX); });
    if (typeof sv.show_signature === 'boolean') d.show_signature = sv.show_signature;
    out[k] = d;
  });
  return out;
}

router.get('/', requireAuth, requireRole('Admin'), (req, res) => {
  res.json({ settings: readSettings(), section_labels: SECTION_LABELS, doc_defaults: DOC_DEFAULTS });
});

router.put('/', requireAuth, requireRole('Admin'), (req, res) => {
  const b = req.body || {};
  if (b.primary_color && !HEX_COLOR_RE.test(b.primary_color)) return res.status(400).json({ error: 'รหัสสีหลักไม่ถูกต้อง (ต้องเป็น #RRGGBB)' });
  if (b.accent_color && !HEX_COLOR_RE.test(b.accent_color)) return res.status(400).json({ error: 'รหัสสีเน้นไม่ถูกต้อง (ต้องเป็น #RRGGBB)' });
  if (b.logo_base64 && b.logo_base64.length > 3_000_000) return res.status(400).json({ error: 'ไฟล์โลโก้ใหญ่เกินไป (ไม่เกิน ~2MB)' });
  if (b.section_order && (!Array.isArray(b.section_order) || b.section_order.some(k => !SECTION_LABELS[k]))) {
    return res.status(400).json({ error: 'ลำดับหมวดไม่ถูกต้อง' });
  }

  const upsert = db.prepare(`INSERT INTO system_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
  const tx = db.transaction(() => {
    if (b.primary_color !== undefined) upsert.run('pdf_primary_color', b.primary_color);
    if (b.accent_color !== undefined) upsert.run('pdf_accent_color', b.accent_color);
    if (b.logo_base64 !== undefined) upsert.run('pdf_logo_base64', b.logo_base64);
    if (b.org_name !== undefined) upsert.run('pdf_org_name', b.org_name);
    if (b.org_subtitle !== undefined) upsert.run('pdf_org_subtitle', b.org_subtitle);
    if (b.doc_title !== undefined) upsert.run('pdf_doc_title', b.doc_title);
    if (b.show_signature !== undefined) upsert.run('pdf_show_signature', b.show_signature ? '1' : '0');
    if (b.docs && typeof b.docs === 'object') {
      const clean = {};
      DOC_KEYS.forEach((k) => {
        const sv = b.docs[k]; if (!sv || typeof sv !== 'object') return;
        clean[k] = {};
        DOC_TEXT_KEYS.forEach((f) => { if (f in DOC_DEFAULTS[k] && typeof sv[f] === 'string') clean[k][f] = sv[f].trim().slice(0, DOC_TEXT_MAX); });
        if (typeof sv.show_signature === 'boolean') clean[k].show_signature = sv.show_signature;
      });
      upsert.run('pdf_docs_json', JSON.stringify(clean));
    }
    if (b.section_order !== undefined) upsert.run('pdf_section_order', JSON.stringify(b.section_order));
    if (b.section_visible !== undefined) upsert.run('pdf_section_visible', JSON.stringify(b.section_visible));
  });
  tx();

  logAction(req.session.userId, 'update_pdf_settings', 'ปรับการตั้งค่าหน้าตาเอกสาร PDF');
  res.json({ ok: true, settings: readSettings() });
});

// GET /api/pdf-settings/preview/:doc -> id ของคำขอล่าสุด (ไม่ใช่ draft) ใช้เปิดดูตัวอย่าง PDF จริงหลังบันทึก
router.get('/preview/:doc', requireAuth, requireRole('Admin'), (req, res) => {
  const T = { visit_form: ['visit_requests', '/api/visit-requests/{id}/pdf'], visit_report: ['visit_requests', '/api/visit-requests/{id}/pdf-report'],
    leave: ['leave_requests', '/api/leave-requests/{id}/pdf'], ot: ['ot_requests', '/api/ot-requests/{id}/pdf'] }[req.params.doc];
  if (!T) return res.status(404).json({ error: 'ไม่พบประเภทเอกสาร' });
  const cond = ['leave', 'ot'].includes(req.params.doc) ? "status = 'approved'" : "status != 'draft'"; // PDF ลา/OT พิมพ์ได้เฉพาะที่อนุมัติแล้ว
  const row = db.prepare(`SELECT id FROM ${T[0]} WHERE ${cond} ORDER BY id DESC LIMIT 1`).get();
  res.json({ url: row ? T[1].replace('{id}', row.id) : null });
});

module.exports = router;
module.exports.readSettings = readSettings;
