// routes/visitFormPdf.js - PDF "ใบขออนุมัติออกนอกสถานที่ (Visit Request Form)" ตามแบบฟอร์มกระดาษของบริษัท
// ใช้ครึ่งบนของ A4 (เหมือนใบลา/OT) เติมข้อมูลบนเส้นประของแบบเดิม ต้องไม่ล้นเส้นตัดกลางหน้าแม้ข้อมูลยาว:
//  - ข้อความยาวเกินช่อง: ย่อขนาดอัตโนมัติ (ไม่ต่ำกว่า MIN_FS) แล้วตัดท้ายด้วย … ไม่ตัดขึ้นบรรทัดทับช่องอื่น
//  - ช่องที่ยาวได้ (ที่อยู่/วัตถุประสงค์/ผู้เดินทางร่วม) ใช้ 2 บรรทัดบนเส้นประ
// GET /api/visit-requests/:id/pdf  (ฉบับละเอียดทุกหัวข้ออยู่ที่ /:id/pdf-report ใน routes/pdf.js)
const path = require('path');
const express = require('express');
const PDFDocument = require('pdfkit');
const db = require('../db/database');
const { requireAuth } = require('./middleware');
const { canViewRequest } = require('../utils/requestAccess');
const { readSettings } = require('./pdfSettings');
const approvalEngine = require('../utils/approvalEngine');
const signature = require('../utils/signature');

const FONT_REGULAR = path.join(__dirname, '..', 'fonts', 'Sarabun-Regular.ttf');
const FONT_BOLD = path.join(__dirname, '..', 'fonts', 'Sarabun-Bold.ttf');
const INK = '#111111';
const MUTED = '#777777';
const FS = 9;          // ขนาดตัวอักษรปกติ
const MIN_FS = 6.5;    // ย่อได้ไม่ต่ำกว่านี้
const GAP = 15;        // ระยะบรรทัดของฟอร์ม
const DOT = 11;        // เส้นประอยู่ใต้ตัวอักษร (จากขอบบนบรรทัด)

const safeParse = (s, fb) => { try { const v = typeof s === 'string' ? JSON.parse(s) : s; return v == null ? fb : v; } catch (e) { return fb; } };
const dmy = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? [m[3], m[2], m[1]] : ['', '', '']; };
function bkkIso(utc) {
  if (!utc) return '';
  const d = new Date(String(utc).replace(' ', 'T') + 'Z');
  if (isNaN(d)) return '';
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
const dmyText = (iso) => { const [d, m, y] = dmy(iso); return d ? `${d}/${m}/${y}` : ''; };

// job_type ของระบบ -> ช่องติ๊ก "ประเภทการเดินทาง"
function travelKind(jobType) {
  const t = String(jobType || '');
  if (!t) return 'customer';
  if (/ติดตั้ง|บริการ|ซ่อม/.test(t)) return 'service';
  if (/เข้าพบลูกค้า|นำเสนอ|ติดตามงาน|ประชุม/.test(t)) return 'customer';
  return 'other';
}
// transport ของระบบ -> ช่องติ๊ก "ยานพาหนะ"
function vehicleKind(tr) {
  const t = String(tr || '');
  if (!t) return '';
  if (t === 'รถยนต์ส่วนตัว') return 'private';
  if (t === 'รถบริษัท') return 'company';
  return 'other';
}

// SQLite เก็บเวลาเป็น UTC -> "dd/mm/yyyy HH:MM น." (Asia/Bangkok)
function bangkokDateTime(utcStr) {
  if (!utcStr) return '';
  const d = new Date(String(utcStr).replace(' ', 'T') + 'Z');
  if (isNaN(d)) return String(utcStr);
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const g = (t) => p.find(x => x.type === t).value;
  return `${g('day')}/${g('month')}/${g('year')} ${g('hour')}:${g('minute')} น.`;
}

function render(req, res, r, settings) {
  const DOC = (settings && settings.docs && settings.docs.visit_form) || { title: 'ใบขออนุมัติออกนอกสถานที่', subtitle: '(Visit Request Form)', show_signature: true, footer: '' };
  // ค่า "เวลาเข้าพบลูกค้า" จาก custom field ชนิดเวลา (หาจากชื่อ label หรือ key) — ถ้าไม่มีใช้ meeting_start ที่เคยบันทึกไว้
  const mt = db.prepare(`
    SELECT v.value FROM visit_custom_values v JOIN custom_form_fields cf ON cf.id = v.field_id
    WHERE v.visit_request_id = ? AND cf.field_type IN ('time', 'datetime') AND v.value IS NOT NULL AND TRIM(v.value) <> ''
      AND (cf.label LIKE '%เวลาเข้าพบ%' OR cf.label LIKE '%เวลาพบลูกค้า%' OR cf.field_key LIKE '%meeting%' OR cf.field_key LIKE '%visit_time%')
    ORDER BY cf.sort_order ASC, cf.id ASC LIMIT 1`).get(r.id);
  const meetingTime = String((mt && mt.value) || r.meeting_start || '').slice(-5);
  // ลายเซ็นลูกค้า (ถ้าลูกค้าเซ็นบนหน้าจอแล้ว) -> เพิ่มช่อง "ลูกค้ารับทราบ" เป็นคอลัมน์ที่ 3 ในแถวลายเซ็น
  const custRow = db.prepare('SELECT data_url, signer_name, signer_title, signed_at FROM visit_customer_signatures WHERE visit_request_id = ?').get(r.id);
  const custParsed = custRow ? signature.parseDataUrl(custRow.data_url) : null;
  const custSig = custParsed && !custParsed.error ? custParsed.buffer : null;
  const contactsRaw = safeParse(r.contacts_json, []);
  const c0 = (Array.isArray(contactsRaw) && contactsRaw[0]) || {};
  const objective = safeParse(r.objective_json, {}) || {};
  const participants = String(r.participants || '').split(',').map((s) => s.trim()).filter(Boolean).join(', ');

  let purpose = String(r.purpose || '').replace(/\s+/g, ' ').trim();
  if (!purpose) {
    const items = Array.isArray(objective.items) ? objective.items : [];
    purpose = [...items.filter((i) => i !== 'Other'), objective.other || ''].filter(Boolean).join(', ');
  }
  const contactName = r.contact_person || c0.name || '';
  const contactTel = r.contact_phone || [c0.telephone, c0.ext ? `ต่อ ${c0.ext}` : ''].filter(Boolean).join(' ') || c0.mobile || '';
  const address = String(r.customer_address || '').replace(/\s+/g, ' ').trim();

  // ผู้อนุมัติ = ขั้นสุดท้ายของสายอนุมัติ เฉพาะคนที่ "อนุมัติแล้ว" จริง
  const wf = approvalEngine.getWorkflow('visit', r.id);
  let approvers = [];
  if (wf && wf.states.length) approvers = wf.states[wf.states.length - 1].approvers.filter((a) => a.decision === 'approve');
  const approverName = approvers.map((a) => a.full_name).join(', ') || (r.status === 'approved' ? r.approver_name || '' : '');
  let approverSig = null;
  for (const a of approvers) { const b = signature.getBuffer(a.user_id); if (b) { approverSig = b; break; } }
  const requesterSig = signature.getBuffer(r.requester_id);

  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  doc.registerFont('regular', FONT_REGULAR);
  doc.registerFont('bold', FONT_BOLD);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${r.code}.pdf"`);
  doc.pipe(res);

  const PW = doc.page.width, HALF = doc.page.height / 2;
  const L = 30, R = PW - 30, W = R - L;
  const COL2 = 324;

  const dots = (x1, x2, yy) => doc.save().dash(0.7, { space: 1.4 }).lineWidth(0.6).strokeColor(INK).moveTo(x1, yy).lineTo(x2, yy).stroke().undash().restore();
  const vbar = (x, y1, y2) => doc.save().lineWidth(0.7).strokeColor(INK).moveTo(x, y1).lineTo(x, y2).stroke().restore();
  const label = (t, x, yy) => doc.font('regular').fontSize(FS).fillColor(INK).text(t, x, yy, { lineBreak: false });

  // ข้อความบรรทัดเดียว: ย่อให้พอดีความกว้าง ถ้ายังไม่พอตัดท้าย … (ไม่ตัดขึ้นบรรทัดใหม่ทับช่องอื่น)
  function fit(text, x, yy, width, align = 'left') {
    let t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (!t) return;
    let size = FS;
    doc.font('regular').fontSize(size);
    while (size > MIN_FS && doc.widthOfString(t) > width) { size -= 0.25; doc.fontSize(size); }
    if (doc.widthOfString(t) > width) {
      while (t.length > 1 && doc.widthOfString(t + '…') > width) t = t.slice(0, -1);
      t += '…';
    }
    doc.fillColor(INK).text(t, x, yy + (FS - size) * 0.9, { width: width + 1, align, lineBreak: false });
  }
  // ขอบเขตคำที่ใกล้ตำแหน่ง limit ที่สุดโดยไม่เกิน limit (ใช้ Intl.Segmenter ถ้ามี ไม่งั้นตัดตามตัวอักษร)
let _seg = null;
function wordBreak(t, limit) {
  try {
    if (_seg === null) _seg = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('th', { granularity: 'word' }) : false;
    if (!_seg) return limit;
    let best = 0;
    for (const g of _seg.segment(t)) { const end = g.index + g.segment.length; if (end <= limit) best = end; else break; }
    return best > limit * 0.5 ? best : limit; // คำเดียวยาวมาก -> ตัดตามตัวอักษร
  } catch (e) { return limit; }
}
// ตัดข้อความเป็นบรรทัดตามความกว้าง (ภาษาไทยไม่มีเว้นวรรคจึงตัดตามตัวอักษร / เว้นวรรคถ้ามีใกล้ๆ)
  function wrapLines(text, width, maxLines) {
    let t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    const lines = [];
    doc.font('regular').fontSize(FS);
    while (t && lines.length < maxLines - 1) {
      if (doc.widthOfString(t) <= width) break;
      let cut = t.length;
      while (cut > 1 && doc.widthOfString(t.slice(0, cut)) > width) cut -= 1;
      const sp = t.lastIndexOf(' ', cut);
      if (sp > cut * 0.6) cut = sp;
      else cut = wordBreak(t, cut); // ภาษาไทยไม่มีเว้นวรรค: ตัดตามขอบเขตคำ ไม่ตัดกลางคำ
      lines.push(t.slice(0, cut).trim());
      t = t.slice(cut).trim();
    }
    if (t) lines.push(t); // บรรทัดสุดท้าย: fit() จะย่อ/ตัด … ให้เอง
    return lines;
  }

  // label : ....ค่า.... (บรรทัดเดียว)
  function row(lab, value, x, yy, labelW, xEnd, align = 'left') {
    label(lab, x, yy);
    label(':', x + labelW - 8, yy);
    dots(x + labelW, xEnd, yy + DOT);
    fit(value, x + labelW + 3, yy, xEnd - x - labelW - 5, align);
  }
  // label : ....ค่า.... หลายบรรทัด (ได้ n บรรทัด) คืนจำนวนบรรทัดที่ใช้
  function rowMulti(lab, value, x, yy, labelW, xEnd, maxLines) {
    label(lab, x, yy);
    label(':', x + labelW - 8, yy);
    const first = xEnd - x - labelW - 5, full = xEnd - x - 6;
    // บรรทัดแรกกว้างน้อยกว่า (มี label นำ) บรรทัดถัดไปเต็มความกว้าง
    const lines = [];
    let rest = String(value || '').replace(/\s+/g, ' ').trim();
    const w0 = wrapLines(rest, first, 2);
    if (w0.length) { lines.push(w0[0]); rest = w0.slice(1).join(' '); }
    if (rest && maxLines > 1) { const more = wrapLines(rest, full, maxLines - 1); more.forEach((m) => lines.push(m)); }
    const n = Math.max(1, Math.min(maxLines, lines.length));
    dots(x + labelW, xEnd, yy + DOT);
    for (let i = 1; i < n; i++) dots(x, xEnd, yy + GAP * i + DOT);
    lines.slice(0, n).forEach((ln, i) => fit(ln, i === 0 ? x + labelW + 3 : x + 3, yy + GAP * i, i === 0 ? first : full));
    return n;
  }
  function checkbox(x, yy, lab, checked) {
    doc.save().lineWidth(0.8).strokeColor(INK).rect(x, yy + 1, 8.5, 8.5).stroke();
    if (checked) doc.lineWidth(1.4).lineCap('round').lineJoin('round').moveTo(x + 1.8, yy + 5.3).lineTo(x + 3.9, yy + 7.8).lineTo(x + 7.6, yy + 2.2).stroke();
    doc.restore();
    label(lab, x + 12.5, yy);
    return x + 12.5 + doc.widthOfString(lab);
  }
  // วันที่ ....../....../...... ค่าอยู่กลางแต่ละช่อง
  function dateParts(x, yy, iso, seg = [30, 30, 40]) {
    const parts = dmy(iso);
    let cx = x;
    seg.forEach((w, i) => {
      dots(cx, cx + w, yy + DOT);
      if (parts[i]) doc.font('regular').fontSize(FS).fillColor(INK).text(parts[i], cx, yy, { width: w, align: 'center', lineBreak: false });
      cx += w;
      if (i < seg.length - 1) { label('/', cx + 1.5, yy); cx += 8; }
    });
    return cx;
  }
  function heading(no, title, yy) {
    doc.circle(L + 7, yy + 7, 7).fill(INK);
    doc.font('bold').fontSize(8).fillColor('#ffffff').text(String(no), L, yy + 1.1, { width: 14, align: 'center', lineBreak: false });
    doc.font('bold').fontSize(10.5).fillColor(INK).text(title, L + 19, yy + 1, { lineBreak: false });
  }

  // ---------- หัวกระดาษ ----------
  let y = 18;
  if (settings && settings.logo_base64 && String(settings.logo_base64).startsWith('data:image')) {
    try { doc.image(Buffer.from(settings.logo_base64.split(',')[1], 'base64'), L, y + 2, { fit: [105, 30] }); } catch (e) { /* โลโก้เสีย -> ข้าม */ }
  }
  doc.font('bold').fontSize(14).fillColor(INK).text(DOC.title, 180, y - 4, { width: 210, align: 'center', lineBreak: false });
  doc.font('bold').fontSize(12).text(DOC.subtitle, 180, y + 14, { width: 210, align: 'center', lineBreak: false });
  row('เลขที่เอกสาร', r.code, 396, y + 1, 62, R);
  row('วันที่จัดทำ', dmyText(r.request_date || bkkIso(r.created_at)), 396, y + 19, 62, R);
  y += 42;
  doc.save().lineWidth(1).strokeColor(INK).moveTo(L, y).lineTo(R, y).stroke().restore();
  y += 7;


  // ---------- โครงตารางเดียวกันทั้งใบ: เส้นแบ่งคอลัมน์ขวาและตำแหน่ง ":" ตรงกันทุกหัวข้อ ----------
  const LX = L + 6, LLW = 110, LEND = COL2 - 12;   // คอลัมน์ซ้าย: label กว้าง LLW
  const RX = COL2 + 8, RLW = 84;                   // คอลัมน์ขวา: label กว้าง RLW
  // แถวช่วงเวลา "xx:xx - xx:xx น." ใช้ซ้ำทั้งหัวข้อ 1 (เวลาเดินทาง) และหัวข้อ 3 (เวลาเข้าพบลูกค้า)
  const timeRow = (text, from, to, yy) => {
    label(text, LX, yy);
    label(':', LX + LLW - 8, yy);
    const tx = LX + LLW, tw = 44;
    dots(tx, tx + tw, yy + DOT); fit(from, tx, yy, tw, 'center');
    label('-', tx + tw + 4, yy);
    dots(tx + tw + 14, tx + tw * 2 + 14, yy + DOT); fit(to, tx + tw + 14, yy, tw, 'center');
    label('น.', tx + tw * 2 + 18, yy);
  };
  const sep = (yy) => doc.save().lineWidth(0.5).strokeColor('#9a9a9a').moveTo(L, yy).lineTo(R, yy).stroke().restore();

  // ---------- 1. ข้อมูลผู้ขออนุมัติ ----------
  heading(1, 'ข้อมูลผู้ขออนุมัติ', y);
  y += 19;
  const s1 = y;
  row('ชื่อ - นามสกุล (ผู้เดินทาง)', r.requester_name, LX, y, LLW, LEND);
  row('ตำแหน่ง', r.requester_position, LX, y + GAP, LLW, LEND);
  row('แผนก', r.requester_department, LX, y + GAP * 2, LLW, LEND);
  label('วันที่เดินทาง', LX, y + GAP * 3);
  label(':', LX + LLW - 8, y + GAP * 3);
  dateParts(LX + LLW, y + GAP * 3, r.visit_date, [34, 34, 44]);
  timeRow('เวลา', r.time_from, r.time_to, y + GAP * 4);
  const tk = travelKind(r.job_type);
  label('ประเภทการเดินทาง :', RX, y);
  let cx = RX;
  cx = checkbox(cx, y + GAP - 1, 'ไปพบลูกค้า', tk === 'customer') + 12;
  cx = checkbox(cx, y + GAP - 1, 'งานบริการ/ซ่อม', tk === 'service') + 12;
  cx = checkbox(cx, y + GAP - 1, 'อื่นๆ ระบุ', tk === 'other') + 3;
  dots(cx, R, y + GAP - 1 + DOT);
  if (tk === 'other') fit(r.job_type, cx + 2, y + GAP - 1, R - cx - 4);
  const py = y + GAP * 2 + 1;
  const pn = rowMulti('ผู้เดินทางร่วม', participants, RX, py, RLW, R, 2);
  const s1End = Math.max(y + GAP * 5, py + GAP * pn);
  vbar(COL2, s1 - 1, s1End + 1);
  y = s1End + 3; sep(y); y += 6;

  // ---------- 2. ข้อมูลลูกค้า / สถานที่ ----------
  heading(2, 'ข้อมูลลูกค้า / สถานที่', y);
  y += 19;
  const s2 = y;
  const cn = rowMulti('ชื่อบริษัท / ลูกค้า', r.customer_name, LX, y, LLW, LEND, 2);
  const an = rowMulti('ที่อยู่', address, LX, y + GAP * cn, LLW, LEND, 3);
  row('ผู้ติดต่อ', contactName, RX, y, RLW, R);
  row('เบอร์โทรศัพท์', contactTel, RX, y + GAP, RLW, R);
  const s2End = y + GAP * Math.max(2, cn + an);
  vbar(COL2, s2 - 1, s2End + 1);
  y = s2End + 3; sep(y); y += 6;

  // ---------- 3. รายละเอียดการปฏิบัติงาน ----------
  heading(3, 'รายละเอียดการปฏิบัติงาน', y);
  y += 19;
  const s3 = y;
  const pu = rowMulti('วัตถุประสงค์', purpose, LX, y, LLW, LEND, 3);
  const dy = y + GAP * pu;
  label('วันที่เข้าพบ', LX, dy);
  label(':', LX + LLW - 8, dy);
  dateParts(LX + LLW, dy, r.visit_date, [34, 34, 44]);
  const ty = dy + GAP;
  // เวลาเข้าพบลูกค้า: ช่องเวลา (time) ที่ Admin สร้างใน Form Builder ชื่อ "เวลาเข้าพบลูกค้า" — เป็นเวลาเดียว (คนละส่วนกับ Time Out/Time In)
  label('เวลาเข้าพบลูกค้า', LX, ty);
  label(':', LX + LLW - 8, ty);
  const mtx = LX + LLW, mtw = 44;
  dots(mtx, mtx + mtw, ty + DOT); fit(meetingTime, mtx, ty, mtw, 'center');
  label('น.', mtx + mtw + 4, ty);
  const vk = vehicleKind(r.transport);
  label('ยานพาหนะ :', RX, y);
  let vx = RX + 54;
  vx = checkbox(vx, y, 'รถยนต์ส่วนตัว', vk === 'private') + 5;
  vx = checkbox(vx, y, 'รถบริษัท', vk === 'company') + 5;
  vx = checkbox(vx, y, 'อื่นๆ ระบุ', vk === 'other') + 3;
  dots(vx, R, y + DOT);
  if (vk === 'other') fit(r.transport, vx + 2, y, R - vx - 4);
  row('หมายเลขทะเบียน', r.license_plate, RX, y + GAP, RLW, R);
  const rn = rowMulti('เส้นทาง / พื้นที่', r.location, RX, y + GAP * 2, RLW, R, 2);
  const s3End = Math.max(ty + GAP, y + GAP * (2 + rn));
  vbar(COL2, s3 - 1, s3End + 1);
  y = s3End + 4;

  // ---------- ลายเซ็น 2 ช่อง (ผู้ปฏิบัติงาน / ผู้อนุมัติ) + ช่อง 3 "ลูกค้ารับทราบ" เมื่อลูกค้าเซ็นแล้ว ----------
  const hasCust = !!(custRow && custSig);   // ลูกค้าเซ็นบนหน้าจอแล้วหรือยัง (ถ้ายัง ช่องนี้ว่างไว้ให้ลูกค้าเซ็นมือบนกระดาษได้)
  const sigCols = [['ผู้ปฏิบัติงาน', r.requester_name, requesterSig], ['ผู้อนุมัติ', approverName, approverSig],
                   ['ลูกค้ารับทราบ', hasCust ? custRow.signer_name : '', hasCust ? custSig : null]];
  const colW = 160;
  const slotW = W / sigCols.length;
  const sigLineY = y + 24;
  // ไม่แสดงตำแหน่งของลูกค้าใต้ชื่อ (แสดงแค่ชื่อผู้เซ็นเหมือนช่องอื่น)
  if (DOC.show_signature) sigCols.forEach(([role, name, sig], i) => {
    const x = L + i * slotW + (slotW - colW) / 2;
    signature.draw(doc, sig, x, colW, sigLineY, 24);
    dots(x, x + colW, sigLineY);
    doc.font('regular').fontSize(FS).fillColor(INK).text(role, x, sigLineY + 2, { width: colW, align: 'center', lineBreak: false });
    label('(', x + 4, sigLineY + 15);
    dots(x + 12, x + colW - 12, sigLineY + 15 + DOT);
    fit(name, x + 14, sigLineY + 15, colW - 30, 'center');
    label(')', x + colW - 8, sigLineY + 15);
  });
  let bottom = DOC.show_signature ? sigLineY + 15 + DOT + 2 : y + 2;
  if (DOC.footer) { doc.font('regular').fontSize(7.5).fillColor('#666666').text(DOC.footer, L, bottom + 3, { width: W, align: 'center', lineBreak: false, ellipsis: true }); bottom += 11; }
  if (bottom > HALF - 8) console.warn(`[visit-form-pdf] เนื้อหาล้นครึ่ง A4 (${Math.round(bottom)} > ${Math.round(HALF - 8)}) ใบ ${r.code}`);

  // เส้นประตัดครึ่งหน้า A4
  doc.save().dash(3, { space: 3 }).lineWidth(0.5).strokeColor('#bbbbbb').moveTo(20, HALF).lineTo(PW - 20, HALF).stroke().restore();
  doc.end();
  return bottom;
}

const router = express.Router();
router.get('/:id/pdf', requireAuth, (req, res) => {
  const r = db.prepare(`
    SELECT vr.*, c.name AS customer_name, c.address AS customer_address,
           u.full_name AS requester_name, u.position AS requester_position, u.department AS requester_department,
           a.full_name AS approver_name
    FROM visit_requests vr
    JOIN customers c ON c.id = vr.customer_id
    JOIN users u ON u.id = vr.requester_id
    LEFT JOIN users a ON a.id = vr.approver_id
    WHERE vr.id = ?`).get(req.params.id);
  if (!r) return res.status(404).json({ error: 'ไม่พบคำขอ' });
  if (!canViewRequest(req.session, 'visit', r)) return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ดูคำขอนี้' });
  try { render(req, res, r, readSettings()); }
  catch (e) { console.error('[visit-form-pdf]', e.message); if (!res.headersSent) res.status(500).json({ error: 'สร้าง PDF ไม่สำเร็จ' }); }
});

module.exports = router;
