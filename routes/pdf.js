// routes/pdf.js - ใบรายงานการเข้าพบลูกค้า (Visit Report) แบบ A4 หลายหน้า
// อ่านหน้าตา (สี/โลโก้/ชื่อองค์กร/ชื่อเอกสาร/เปิด-ปิดลายเซ็น) จาก "ตั้งค่า > ออกแบบ PDF" (routes/pdfSettings.js)
// ครอบคลุมทุกหัวข้อของฟอร์ม Visit ใหม่: Request Detail, Objective, During Visit, Opportunity,
// Action Plan, Customer Level, Next Visit, Remark + ลายเซ็น (ผู้ขอ / ผู้ตรวจสอบ / ผู้อนุมัติ)
const express = require('express');
const path = require('path');
const PDFDocument = require('pdfkit');
const db = require('../db/database');
const { requireAuth } = require('./middleware');
const { toThaiDate } = require('../utils/dateFormat');
const { readSettings } = require('./pdfSettings');
const { canViewRequest } = require('../utils/requestAccess');
const approvalEngine = require('../utils/approvalEngine');
const signature = require('../utils/signature');

const router = express.Router();

const FONT_REGULAR = path.join(__dirname, '..', 'fonts', 'Sarabun-Regular.ttf');
const FONT_BOLD = path.join(__dirname, '..', 'fonts', 'Sarabun-Bold.ttf');

const MUTED = '#6b7280';
const INK = '#1a2233';
const LIGHT = '#eef1fb';
const BORDER = '#d7dcec';
const GREEN = '#1a7a3c';

const STATUS_TH = {
  draft: 'ฉบับร่าง', pending: 'รออนุมัติ', revision: 'รอแก้ไข', approved: 'Approve@Visiting',
  completed: 'Visit Completed', rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิกแล้ว'
};
const STATUS_COLOR = {
  draft: '#6b7280', pending: '#c9670f', revision: '#c9670f', approved: GREEN,
  completed: '#1c5fd1', rejected: '#c0392b', cancelled: '#6b7280'
};

const safeParse = (s, fb) => { try { const v = typeof s === 'string' ? JSON.parse(s) : s; return v === null || v === undefined ? fb : v; } catch (e) { return fb; } };
const th = (d) => (d ? toThaiDate(d) : '');
const clock = (t) => (t ? `${t} น.` : '');
// วันที่-เวลาที่ SQLite เก็บเป็น UTC -> แสดงเวลาไทย dd/mm/yyyy
function bkkDate(utc) {
  if (!utc) return '';
  const d = new Date(String(utc).replace(' ', 'T') + 'Z');
  if (isNaN(d)) return th(utc);
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g('day')}/${g('month')}/${g('year')}`;
}
const list = (a) => (Array.isArray(a) ? a.filter(Boolean) : []);
const withOther = (items, other) => list(items).map((i) => (i === 'Other' && other ? `Other: ${other}` : i));

function fetchRequest(id) {
  return db.prepare(`
    SELECT vr.*, c.name AS customer_name, c.address AS customer_address, c.phone AS customer_phone, c.level AS customer_level_now,
           u.full_name AS requester_name, u.position AS requester_position, u.department AS requester_department,
           a.full_name AS approver_name
    FROM visit_requests vr
    JOIN customers c ON c.id = vr.customer_id
    JOIN users u ON u.id = vr.requester_id
    LEFT JOIN users a ON a.id = vr.approver_id
    WHERE vr.id = ?
  `).get(id);
}

router.get('/:id/pdf-report', requireAuth, (req, res) => {
  const r = fetchRequest(req.params.id);
  if (!r) return res.status(404).json({ error: 'ไม่พบคำขอ' });
  if (!canViewRequest(req.session, 'visit', r)) return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ดูคำขอนี้' });

  const settings = readSettings();
  const DOC = settings.docs.visit_report;
  const PRIMARY = settings.primary_color;
  const ACCENT = settings.accent_color;
  const statusKey = r.status === 'approved' && r.completed_at ? 'completed' : r.status;

  // ----- ข้อมูลส่วน JSON (ฟอร์มใหม่) -----
  const contacts = list(safeParse(r.contacts_json, []));
  const objective = safeParse(r.objective_json, {}) || {};
  const during = safeParse(r.during_visit_json, null);
  const opp = safeParse(r.opportunity_json, null);
  const plan = safeParse(r.action_plan_json, null);
  const lvl = safeParse(r.customer_level_json, null);
  const next = safeParse(r.next_visit_json, null);
  const participants = String(r.participants || '').split(',').map((s) => s.trim()).filter(Boolean);
  const customRows = db.prepare(`
    SELECT f.label, v.value FROM visit_custom_values v JOIN custom_form_fields f ON f.id = v.field_id
    WHERE v.visit_request_id = ? AND v.value IS NOT NULL AND v.value != '' ORDER BY f.id
  `).all(r.id).filter((x) => !/^data:/.test(String(x.value)));

  // ----- ผู้ลงนาม: เฉพาะผู้ที่ "อนุมัติแล้ว" จริง -----
  const wf = approvalEngine.getWorkflow('visit', r.id);
  const approvedOf = (st) => (st ? st.approvers.filter((a) => a.decision === 'approve') : []);
  const nameOf = (arr) => arr.map((a) => a.full_name).join(', ');
  const sigOf = (arr) => { for (const a of arr) { const b = signature.getBuffer(a.user_id); if (b) return b; } return null; };
  const dateOf = (arr) => { const d = arr.map((a) => a.decided_at).filter(Boolean).sort().pop(); return d ? bkkDate(d) : ''; };
  let checkers = [], approvers = [];
  if (wf && wf.states.length) {
    approvers = approvedOf(wf.states[wf.states.length - 1]);
    if (wf.states.length > 1) checkers = approvedOf(wf.states[0]);
  }
  const approverName = nameOf(approvers) || (r.status === 'approved' ? r.approver_name || '' : '');
  const signers = [
    { role: 'ผู้ขอปฏิบัติงาน', name: r.requester_name, sig: signature.getBuffer(r.requester_id), date: bkkDate(r.created_at) },
    { role: 'ผู้ตรวจสอบ', name: nameOf(checkers), sig: sigOf(checkers), date: dateOf(checkers) },
    { role: 'ผู้อนุมัติ', name: approverName, sig: sigOf(approvers), date: dateOf(approvers) || (r.status === 'approved' ? bkkDate(r.approved_at) : '') }
  ];

  // ----- เอกสาร -----
  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
  doc.registerFont('regular', FONT_REGULAR);
  doc.registerFont('bold', FONT_BOLD);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${r.code}.pdf"`);
  doc.pipe(res);

  const PW = doc.page.width, PH = doc.page.height;
  const MX = 36, CW = PW - MX * 2, BOTTOM = PH - 52, TOP = 40;
  let y = 0;

  // ---- ส่วนหัวหน้าแรก ----
  function header() {
    let logoDrawn = false;
    if (settings.logo_base64 && settings.logo_base64.startsWith('data:image')) {
      try {
        doc.image(Buffer.from(settings.logo_base64.split(',')[1], 'base64'), MX, 26, { fit: [120, 40] });
        logoDrawn = true;
      } catch (e) { /* โลโก้เสีย -> แสดงชื่อองค์กรแทน */ }
    }
    if (!logoDrawn) {
      doc.font('bold').fontSize(22).fillColor(PRIMARY).text(settings.org_name, MX, 24, { lineBreak: false });
      doc.font('regular').fontSize(8).fillColor(MUTED).text(settings.org_subtitle, MX, 50, { lineBreak: false });
    }
    doc.font('bold').fontSize(16).fillColor(PRIMARY).text(DOC.title, MX, 24, { width: CW, align: 'right', lineBreak: false });
    doc.font('regular').fontSize(9.5).fillColor(MUTED).text(DOC.subtitle, MX, 44, { width: CW, align: 'right', lineBreak: false });
    // ป้ายสถานะ
    const st = STATUS_TH[statusKey] || statusKey;
    doc.font('bold').fontSize(9);
    const bw = doc.widthOfString(st) + 22, bx = PW - MX - bw;
    doc.roundedRect(bx, 59, bw, 17, 8.5).fill(STATUS_COLOR[statusKey] || MUTED);
    doc.fillColor('#ffffff').text(st, bx, 63, { width: bw, align: 'center', lineBreak: false });
    doc.font('regular').fontSize(9).fillColor(MUTED).text(`No. ${r.code}`, MX, 63, { width: CW - bw - 8, align: 'right', lineBreak: false });
    y = 84;
    doc.moveTo(MX, y).lineTo(PW - MX, y).strokeColor(PRIMARY).lineWidth(2).stroke();
    y += 12;
  }

  const ensure = (h) => { if (y + h > BOTTOM) { doc.addPage(); y = TOP; } };
  doc.addPage ? null : null;
  header();

  // ---- หัวข้อหมวด (มีเลข) ----
  let secNo = 0;
  function section(title, thai) {
    ensure(54);
    secNo += 1;
    doc.roundedRect(MX, y, CW, 22, 4).fill(LIGHT);
    doc.circle(MX + 14, y + 11, 8).fill(ACCENT);
    doc.font('bold').fontSize(8.5).fillColor('#ffffff').text(String(secNo), MX + 6, y + 7, { width: 16, align: 'center', lineBreak: false });
    doc.font('bold').fontSize(10.5).fillColor(PRIMARY).text(title, MX + 30, y + 5.5, { lineBreak: false });
    const tw = doc.widthOfString(title);
    if (thai) doc.font('regular').fontSize(9).fillColor(MUTED).text(`  ${thai}`, MX + 30 + tw, y + 7, { lineBreak: false });
    y += 22 + 8;
  }

  // ---- แถว label/value เรียงเป็นกริด n คอลัมน์ (full = เต็มแถว) ----
  function kv(items, cols = 2) {
    const rows = items.filter((it) => it && it[1] !== undefined && it[1] !== null && String(it[1]).trim() !== '');
    if (!rows.length) { empty(); return; }
    const gap = 18, colW = (CW - gap * (cols - 1)) / cols, labelW = cols === 1 ? 110 : 78;
    let i = 0;
    while (i < rows.length) {
      const line = [];
      if (rows[i][2] === 'full' || cols === 1) line.push([rows[i], CW]); // เต็มแถว
      else { for (let c = 0; c < cols && i + line.length < rows.length && rows[i + line.length][2] !== 'full'; c++) line.push([rows[i + line.length], colW]); }
      let h = 0;
      doc.font('bold').fontSize(9.5);
      line.forEach(([it, w]) => {
        const lw = w === CW ? 110 : labelW;
        h = Math.max(h, doc.heightOfString(String(it[1]), { width: w - lw - 4 }), 13);
      });
      ensure(h + 6);
      line.forEach(([it, w], k) => {
        const x = w === CW ? MX : MX + k * (colW + gap), lw = w === CW ? 110 : labelW;
        doc.font('regular').fontSize(8.3).fillColor(MUTED).text(it[0], x + 4, y + 1.5, { width: lw - 6 });
        doc.font('bold').fontSize(9.5).fillColor(INK).text(String(it[1]), x + lw, y, { width: w - lw - 4 });
      });
      y += h + 4;
      doc.moveTo(MX, y - 1.5).lineTo(MX + CW, y - 1.5).strokeColor('#e8ebf5').lineWidth(0.5).stroke();
      i += line.length;
    }
    y += 6;
  }
  function empty() {
    ensure(18);
    doc.font('regular').fontSize(9).fillColor(MUTED).text('- ไม่มีข้อมูล -', MX + 4, y, { lineBreak: false });
    y += 18;
  }

  // ---- ป้ายตัวเลือกที่เลือก (chips) ----
  function chips(items, color = ACCENT) {
    const arr = list(items);
    if (!arr.length) return;
    let x = MX + 4;
    doc.font('regular').fontSize(9);
    arr.forEach((t) => {
      const w = Math.min(doc.widthOfString(t) + 22, CW - 8);
      if (x + w > MX + CW) { x = MX + 4; y += 21; }
      ensure(24);
      doc.roundedRect(x, y, w, 17, 8.5).fillAndStroke('#f4f7ff', '#cfdcff');
      doc.save().lineWidth(1.4).lineCap('round').lineJoin('round').strokeColor(color)
        .moveTo(x + 5.5, y + 8.8).lineTo(x + 8, y + 11.4).lineTo(x + 12.2, y + 5.6).stroke().restore();
      doc.fillColor(INK).font('regular').fontSize(9).text(t, x + 17, y + 4, { width: w - 20, lineBreak: false, ellipsis: true });
      x += w + 6;
    });
    y += 25;
  }
  // หัวข้อย่อย + ข้อความหลายบรรทัด
  function sub(label) {
    ensure(58);
    doc.font('bold').fontSize(9.3).fillColor(PRIMARY).text(label, MX + 4, y, { lineBreak: false });
    y += 14;
  }
  function para(text) {
    const t = String(text || '').trim();
    if (!t) return;
    doc.font('regular').fontSize(9.5);
    const h = doc.heightOfString(t, { width: CW - 12 });
    if (h > BOTTOM - TOP - 20) { // ข้อความยาวมากกว่าหนึ่งหน้า: ตัดทอนตามที่พอดี
      ensure(40);
    } else ensure(h + 8);
    doc.fillColor(INK).text(t, MX + 8, y, { width: CW - 12 });
    y += h + 7;
  }
  function note(label, value) { if (value && String(value).trim()) { sub(label); para(value); } }

  // ---- ตาราง ----
  function table(heads, widths, rows) {
    const total = widths.reduce((a, b) => a + b, 0);
    const w = widths.map((x) => (x / total) * CW);
    const drawHead = () => {
      ensure(24);
      doc.rect(MX, y, CW, 18).fill(PRIMARY);
      let x = MX;
      heads.forEach((h, i) => { doc.font('bold').fontSize(8.5).fillColor('#ffffff').text(h, x + 4, y + 4.5, { width: w[i] - 8, lineBreak: false, ellipsis: true }); x += w[i]; });
      y += 18;
    };
    drawHead();
    rows.forEach((row, ri) => {
      doc.font('regular').fontSize(9);
      const h = Math.max(...row.map((c, i) => doc.heightOfString(String(c || '-'), { width: w[i] - 8 })), 12) + 8;
      if (y + h > BOTTOM) { doc.addPage(); y = TOP; drawHead(); }
      if (ri % 2) doc.rect(MX, y, CW, h).fill('#f7f9fe');
      let x = MX;
      row.forEach((c, i) => { doc.font('regular').fontSize(9).fillColor(INK).text(String(c || '-'), x + 4, y + 4, { width: w[i] - 8 }); x += w[i]; });
      y += h;
      doc.moveTo(MX, y).lineTo(MX + CW, y).strokeColor(BORDER).lineWidth(0.5).stroke();
    });
    y += 10;
  }

  // ================= 1. Request Detail =================
  section('Request Detail', 'รายละเอียดการเข้าพบลูกค้า');
  kv([
    ['วันที่ทำรายการ', th(r.request_date) || bkkDate(r.created_at)],
    ['วันที่เข้าพบ', th(r.visit_date)],
    ['เวลา (แผน)', `${r.time_from || ''} - ${r.time_to || ''} น.`],
    ['ผู้ขอ', r.requester_name],
    ['แผนก', r.requester_department],
    ['ตำแหน่ง', r.requester_position],
    ['บริษัท / ลูกค้า', r.customer_name, 'full'],
    ['ประเภทลูกค้า', r.customer_type === 'new' ? 'ลูกค้าใหม่' : r.customer_type === 'current' ? 'ลูกค้าปัจจุบัน' : r.customer_type],
    ['ระดับลูกค้า', r.customer_level_now],
    ['ประเภทงาน', r.job_type],
    ['ผู้ดูแลการขาย', r.sales_person],
    ['สถานที่', r.location, 'full'],
    ['ที่อยู่ลูกค้า', r.customer_address, 'full'],
    ['Tax ID ลูกค้า', r.customer_tax_id],
    ['วันที่ใบกำกับภาษี', th(r.tax_invoice_date)],
    ['สินค้า/อุปกรณ์', r.product, 'full'],
    ['ผู้ร่วมงาน', participants.join(', '), 'full'],
    ['ยานพาหนะ', r.transport],
    ['ทะเบียนรถ', r.license_plate],
    ['ไมล์ออก', r.mileage_out],
    ['ไมล์เข้า', r.mileage_in],
    ['เวลาออกจริง', clock(r.actual_time_out)],
    ['เวลากลับจริง', clock(r.actual_time_back)],
    ['ชั่วโมง OT', r.ot_hours]
  ], 2);
  if (contacts.length) {
    sub('Contact Information (ผู้ติดต่อ)');
    table(['ชื่อ', 'ตำแหน่ง', 'โทรศัพท์ (ต่อ)', 'มือถือ', 'อีเมล'], [3, 2.4, 2.2, 2, 3.2],
      contacts.map((c) => [c.name, c.position, [c.telephone, c.ext ? `ต่อ ${c.ext}` : ''].filter(Boolean).join(' '), c.mobile, c.email]));
  } else if (r.contact_person) {
    kv([['ผู้ติดต่อ', r.contact_person], ['เบอร์โทร', r.contact_phone]], 2);
  }

  // ================= 2. Objective =================
  section('Visit Objective', 'วัตถุประสงค์การเข้าพบ');
  const objItems = withOther(objective.items, objective.other);
  if (objItems.length) chips(objItems);
  if (r.purpose && !objItems.length) para(r.purpose);
  else if (r.purpose && objItems.join(', ') !== r.purpose) note('รายละเอียดวัตถุประสงค์', r.purpose);
  if (!objItems.length && !r.purpose) empty();

  // ================= 3. During Visit =================
  section('During Visit', 'ข้อมูลที่พบระหว่างการเข้าพบ');
  if (during) {
    const d = during;
    const any = list(d.brands).length || d.brand_notes || (d.recurring && d.recurring.value) || list(d.problems && d.problems.items).length
      || (d.problems && d.problems.detail) || list(d.projects && d.projects.items).length || (d.projects && d.projects.detail)
      || list(d.potential && d.potential.items).length;
    if (!any) empty();
    if (list(d.brands).length || d.brand_notes) { sub('3.1 Current Products / Brands (สินค้า/ยี่ห้อที่ลูกค้าใช้อยู่)'); chips(d.brands); note('หมายเหตุ', d.brand_notes); }
    if (d.recurring && d.recurring.value) {
      sub('3.2 Recurring Part Demand (ความต้องการต่อเนื่อง)');
      chips([{ yes: 'Yes', no: 'No', need_info: 'Need More Information' }[d.recurring.value] || d.recurring.value]);
      note('สินค้า / งานที่ใช้', d.recurring.detail);
    }
    if (d.problems && (list(d.problems.items).length || d.problems.detail)) {
      sub('3.3 Customer Problem / Improvement (ปัญหา / สิ่งที่ต้องการปรับปรุง)');
      chips(withOther(d.problems.items, d.problems.other)); note('รายละเอียด', d.problems.detail);
    }
    if (d.projects && (list(d.projects.items).length || d.projects.detail || d.projects.timing)) {
      sub('3.4 Upcoming Project / Future Plan (โครงการ/แผนในอนาคต)');
      chips(withOther(d.projects.items, d.projects.other)); note('รายละเอียด', d.projects.detail);
      if (d.projects.timing) kv([['ช่วงเวลาที่คาด', d.projects.timing]], 1);
    }
    if (d.potential && (list(d.potential.items).length || d.potential.product_application || d.potential.current_brand || d.potential.target_brand)) {
      sub('3.5 Potential Product Opportunity (โอกาสสินค้า)');
      chips(withOther(d.potential.items, d.potential.other));
      kv([['สินค้า/งานที่มีโอกาส', d.potential.product_application, 'full'], ['ยี่ห้อที่ใช้อยู่', d.potential.current_brand], ['ยี่ห้อเป้าหมาย', d.potential.target_brand]], 2);
    }
  } else empty();

  // ================= 4. Opportunity =================
  section('Opportunity Summary', 'สรุปโอกาสทางธุรกิจ');
  if (opp && (list(opp.found).length || opp.level || opp.description)) {
    if (list(opp.found).length) { sub('สิ่งที่พบ (What did we find?)'); chips(opp.found); }
    kv([['ระดับโอกาส', opp.level]], 1);
    note('รายละเอียดโอกาส', opp.description);
  } else empty();

  // ================= 5. Action Plan =================
  section('Action Plan', 'แผนดำเนินงาน');
  const planRows = plan ? list(plan.rows) : [];
  if (plan && list(plan.actions).length) { sub('Next Action'); chips(plan.actions); }
  if (planRows.length) {
    table(['#', 'Next Action', 'ผู้รับผิดชอบ', 'ผู้ติดต่อ', 'กำหนดเสร็จ', 'ผลที่คาดหวัง'], [0.5, 3.6, 2, 2, 1.7, 3],
      planRows.map((p, i) => [i + 1, p.next_action, p.owner_name, p.contact, th(p.due_date), p.expected_result]));
  } else if (!(plan && list(plan.actions).length)) empty();

  // ================= 6. Customer Level =================
  section('Customer Level', 'ระดับลูกค้า');
  if (lvl && lvl.level) kv([['ระดับ', lvl.level], ['เหตุผล', lvl.reason, 'full']], 2); else empty();

  // ================= 7. Next Visit =================
  section('Next Visit', 'การเข้าพบครั้งถัดไป');
  if (next && (next.needed || next.date || next.purpose || next.expected_outcome)) {
    kv([['ต้องเข้าพบอีก', next.needed === 'yes' ? 'ใช่' : next.needed === 'no' ? 'ไม่ต้อง' : next.needed], ['วันที่', th(next.date)],
      ['วัตถุประสงค์', next.purpose, 'full'], ['ผลที่คาดหวัง', next.expected_outcome, 'full']], 2);
  } else empty();

  // ================= 8. Remark =================
  section('Remark', 'หมายเหตุ');
  if (r.notes && String(r.notes).trim()) para(r.notes); else empty();
  if (r.completed_at) kv([['Visit Completed เมื่อ', bkkDate(r.completed_at)], ['บันทึกเมื่อเสร็จสิ้น', r.completion_note, 'full']], 2);

  // ================= ข้อมูลเพิ่มเติม (Custom fields) =================
  if (customRows.length) {
    section('Additional Information', 'ข้อมูลเพิ่มเติม');
    kv(customRows.map((c) => [c.label, c.value, 'full']), 1);
  }
  if (r.approval_note && r.status !== 'pending') { sub('ความคิดเห็นผู้อนุมัติ'); para(r.approval_note); }

  // ================= ลายเซ็น =================
  if (DOC.show_signature) {
    const BLOCK = 96;
    ensure(BLOCK + 10);
    y += 6;
    const colW = (CW - 24) / 3;
    signers.forEach((s, i) => {
      const x = MX + i * (colW + 12);
      doc.roundedRect(x, y, colW, BLOCK, 6).strokeColor(BORDER).lineWidth(0.8).stroke();
      const lineY = y + 54;
      signature.draw(doc, s.sig, x, colW, lineY, 44);
      doc.moveTo(x + 18, lineY).lineTo(x + colW - 18, lineY).strokeColor(MUTED).lineWidth(0.7).dash(2, { space: 2 }).stroke().undash();
      doc.font('bold').fontSize(9.5).fillColor(INK).text(s.role, x, lineY + 5, { width: colW, align: 'center', lineBreak: false });
      if (s.name) doc.font('regular').fontSize(9).fillColor(INK).text(`(${s.name})`, x + 6, lineY + 18, { width: colW - 12, align: 'center', lineBreak: false, ellipsis: true });
      doc.font('regular').fontSize(8).fillColor(MUTED).text(s.date ? `วันที่ ${s.date}` : 'วันที่ ____/____/______', x, lineY + 32, { width: colW, align: 'center', lineBreak: false });
    });
    y += BLOCK + 8;
  }

  // ================= ส่วนท้ายทุกหน้า =================
  const now = new Date();
  const printedAt = bkkDate(now.toISOString().replace('T', ' ')) + ' ' +
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.moveTo(MX, PH - 40).lineTo(PW - MX, PH - 40).strokeColor(BORDER).lineWidth(0.6).stroke();
    doc.font('regular').fontSize(7.5).fillColor(MUTED)
      .text(`${DOC.footer || `เอกสารสร้างโดยระบบ ${settings.org_name} ${settings.org_subtitle}`} · พิมพ์เมื่อ ${printedAt}`, MX, PH - 34, { width: CW - 80, lineBreak: false });
    doc.text(`หน้า ${i + 1} / ${range.count}`, PW - MX - 80, PH - 34, { width: 80, align: 'right', lineBreak: false });
  }
  doc.end();
});

module.exports = router;
