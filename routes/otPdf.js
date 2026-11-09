// routes/otPdf.js - PDF "Overtime Request and Approval" ตามแบบฟอร์มกระดาษของบริษัท (ครึ่งบนของ A4 ตัดครึ่งได้ เหมือนใบลา)
// ตารางคอลัมน์ Date | Customer | Details | Start | Finish | Hr — คำขอ 1 ใบ = 1 รายการ (ช่องที่เหลือเว้นว่างไว้ให้เขียนเพิ่มด้วยมือ)
const express = require('express');
const path = require('path');
const PDFDocument = require('pdfkit');
const db = require('../db/database');
const { requireAuth } = require('./middleware');
const { toThaiDate } = require('../utils/dateFormat');
const { canViewRequest } = require('../utils/requestAccess');
const approvalEngine = require('../utils/approvalEngine');
const signature = require('../utils/signature');
const { readSettings } = require('./pdfSettings');
const { companyName } = require('../utils/companies');
const { bangkokDate, signerSlots, requesterStamp } = require('../utils/paperForms');

const router = express.Router();

const FONT_REGULAR = path.join(__dirname, '..', 'fonts', 'Sarabun-Regular.ttf');
const FONT_BOLD = path.join(__dirname, '..', 'fonts', 'Sarabun-Bold.ttf');
const INK = '#111111';
const RED = '#d11a1a';

// 08:30 -> "08.30 น."
const clock = (t) => (t ? `${String(t).replace(':', '.')} น.` : '');
const num = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
// ชนิดวัน: ใช้ค่าที่ผู้ขอเลือก (ot.day_type) ถ้าไม่มี (ใบเก่า) คำนวณจากวันที่ — เสาร์/อาทิตย์ = วันหยุด
function dayType(isoDate) {
  const d = new Date(`${String(isoDate).slice(0, 10)}T00:00:00Z`);
  if (isNaN(d)) return { text: '', holiday: false };
  const wd = d.getUTCDay();
  return wd === 0 || wd === 6 ? { text: 'วันหยุด', holiday: true } : { text: 'วันทำงาน', holiday: false };
}

router.get('/:id/pdf', requireAuth, (req, res) => {
  const cfg = readSettings().docs.ot; // ตั้งค่าได้ที่ Settings > ออกแบบ PDF
  const ot = db.prepare(`
    SELECT o.*, u.full_name AS requester_name, a.full_name AS approver_name, c.name AS customer_name
    FROM ot_requests o
    JOIN users u ON u.id = o.requester_id
    LEFT JOIN users a ON a.id = o.approver_id
    LEFT JOIN customers c ON c.id = o.customer_id
    WHERE o.id = ?
  `).get(req.params.id);
  if (!ot) return res.status(404).json({ error: 'ไม่พบคำขอ OT' });
  if (!canViewRequest(req.session, 'ot', ot)) return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ดูคำขอนี้' });
  if (ot.status !== 'approved') return res.status(400).json({ error: 'พิมพ์ PDF ได้เฉพาะคำขอที่อนุมัติแล้วเท่านั้น' });

  // ผู้ลงนาม: แบ่งขั้นตอนลงช่องผู้ตรวจสอบ/ผู้อนุมัติ (กติกาเดียวกับหน้าต่างรายละเอียดในเว็บ - utils/paperForms.js)
  const wf = approvalEngine.getWorkflow('ot', ot.id);
  const slots = signerSlots(wf);
  const checker1 = slots.checker.names, checker2 = '';
  const approverName = slots.approver.names || ot.approver_name || '';
  const checkerSig = slots.checker.signerId ? signature.getBuffer(slots.checker.signerId) : null;
  const approverSig = slots.approver.signerId ? signature.getBuffer(slots.approver.signerId) : null;
  const requesterSig = signature.getBuffer(ot.requester_id);

  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  doc.registerFont('regular', FONT_REGULAR);
  doc.registerFont('bold', FONT_BOLD);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${ot.code}.pdf"`);
  doc.pipe(res);

  const L = 40, R = doc.page.width - 40, W = R - L;
  let y = 36;

  function dots(x1, x2, yy) {
    doc.save().dash(0.8, { space: 1.6 }).lineWidth(0.7).strokeColor(INK).moveTo(x1, yy).lineTo(x2, yy).stroke().undash().restore();
  }

  // pdfkit วางข้อความด้วย "ขอบบนของบรรทัด" ซึ่งฟอนต์ไทยมีช่วงเหนือ baseline สูง ทำให้ตัวหนังสือลอยเมื่อเทียบกับเส้น/ช่อง
  // จึงคำนวณจาก baseline จริงของฟอนต์: onLine = ให้ตัวหนังสือนั่งบนเส้น, inMid = ให้อยู่กึ่งกลางความสูงของช่อง
  const asc = (size) => (doc._font.ascender * size) / 1000;
  const onLine = (lineY, size) => lineY - 2.5 - asc(size);
  const inMid = (midY, size) => midY + 0.34 * size - asc(size);

  doc.font('bold').fontSize(15).fillColor(INK).text(companyName(ot.company) || cfg.company, L, y, { width: W, align: 'center' }); // หัวเอกสาร = บริษัทที่ทำ OT ให้ (ใบเก่าที่ไม่ได้ระบุ ใช้ชื่อที่ตั้งใน Settings)
  y += 21;
  doc.font('bold').fontSize(12.5).text(cfg.title, L, y, { width: W, align: 'center' });
  y += 28;

  // Name / Date
  doc.font('regular').fontSize(12).fillColor(INK);
  const ny = onLine(y + 17, 12);
  doc.text('Name :', L, ny, { lineBreak: false });
  const nx = L + 42;
  doc.lineWidth(0.8).strokeColor(INK).moveTo(nx, y + 17).lineTo(nx + 250, y + 17).stroke();
  doc.text(ot.requester_name || '', nx + 4, ny, { width: 244, lineBreak: false, ellipsis: true });
  const dx = R - 175;
  doc.text('Date', dx, ny, { lineBreak: false });
  doc.moveTo(dx + 34, y + 17).lineTo(R, y + 17).stroke();
  doc.text(bangkokDate(ot.created_at), dx + 36, ny, { width: R - dx - 38, align: 'center', lineBreak: false });
  y += 34;

  // ตาราง
  const cols = [
    { k: 'date', t: 'Date', w: 58 }, { k: 'cus', t: 'Customer', w: 142 }, { k: 'det', t: 'Details', w: 179 },
    { k: 'st', t: 'Start', w: 48 }, { k: 'fn', t: 'Finish', w: 48 }, { k: 'hr', t: 'Hr', w: 40 }
  ];
  let x = L; cols.forEach(c => { c.x = x; x += c.w; });
  const HEAD_H = 22, SUB_H = 16, ENTRY_H = SUB_H * 2, ENTRIES = 5;
  const tableTop = y, tableH = HEAD_H + ENTRIES * ENTRY_H;
  doc.lineWidth(0.8).strokeColor(INK);
  doc.rect(L, tableTop, W, tableH).stroke();
  cols.slice(1).forEach(c => doc.moveTo(c.x, tableTop).lineTo(c.x, tableTop + tableH).stroke());
  for (let i = 0; i <= ENTRIES; i++) { const ly = tableTop + HEAD_H + i * ENTRY_H; doc.moveTo(L, ly).lineTo(R, ly).stroke(); }
  doc.font('regular').fontSize(11).fillColor(INK);
  cols.forEach(c => doc.text(c.t, c.x, inMid(tableTop + HEAD_H / 2, 11), { width: c.w, align: 'center', lineBreak: false }));

  // รายการ (แถวแรก)
  const ry = tableTop + HEAD_H;
  const cell = (c, text, midY, opt = {}) => {
    if (!text) return;
    doc.font(opt.bold ? 'bold' : 'regular').fontSize(opt.size || 9.5).fillColor(opt.color || INK)
      .text(String(text), c.x + 3, inMid(midY, opt.size || 9.5), { width: c.w - 6, align: opt.align || 'left', lineBreak: false, ellipsis: true });
  };
  const col = Object.fromEntries(cols.map(c => [c.k, c]));
  const dt = ot.day_type ? { text: ot.day_type === 'holiday' ? 'วันหยุด' : 'วันทำงาน', holiday: ot.day_type === 'holiday' } : dayType(ot.ot_date);
  cell(col.date, toThaiDate(ot.ot_date), ry + SUB_H / 2, { align: 'center' });
  // ช่องที่มีบรรทัดเดียว (เวลา/ชั่วโมง/ลูกค้าที่ไม่มีเลข Project) จัดกึ่งกลางความสูงของทั้งรายการ ไม่ติดขอบบน
  const midAll = ry + ENTRY_H / 2;
  const projLine = [ot.project_no, ot.job_no].filter(Boolean).join(' / ');
  cell(col.cus, ot.customer_name || ot.location || '', projLine ? ry + SUB_H / 2 : midAll);
  cell(col.st, clock(ot.time_from), midAll, { bold: true, align: 'center', size: 9 });
  cell(col.fn, clock(ot.time_to), midAll, { bold: true, align: 'center', size: 9 });
  cell(col.hr, num(ot.hours), midAll, { align: 'center' });
  cell(col.date, dt.text, ry + SUB_H * 1.5, { align: 'center', color: dt.holiday ? RED : INK });
  cell(col.cus, projLine, ry + SUB_H * 1.5, { color: RED });
  // รายละเอียดงาน: ไหลต่อเนื่อง 2 บรรทัดในช่อง Details (เกินตัดด้วย ...)
  {
    const detail = String(ot.work_detail || '').replace(/\s*\n\s*/g, ' / ');
    doc.font('regular').fontSize(9.5).fillColor(INK);
    const lh = doc.currentLineHeight();
    const dw = col.det.w - 6;
    const single = doc.heightOfString(detail, { width: dw }) <= lh + 0.5;
    // บรรทัดเดียว -> กึ่งกลางทั้งรายการ, 2 บรรทัด -> กึ่งกลางของแต่ละครึ่งแถว
    doc.text(detail, col.det.x + 3, inMid(single ? midAll : ry + SUB_H / 2, 9.5),
      { width: dw, height: ENTRY_H, ellipsis: true, lineGap: single ? 0 : SUB_H - lh });
  }

  // ลายเซ็น: เส้นประอยู่บน ชื่อตำแหน่งอยู่ใต้เส้นตรงกลางช่อง ชื่อในวงเล็บใต้ตำแหน่ง (โครงเดียวกับใบลา)
  y = tableTop + tableH + 40;
  const colW = (W - 20) / 3;
  if (cfg.show_signature)   [['ผู้ยื่นคำร้อง', ot.requester_name, requesterSig, requesterStamp('ot', ot)], ['ผู้ตรวจสอบ', [checker1, checker2].filter(Boolean).join(', '), checkerSig, slots.checker.stamp], ['ผู้อนุมัติ', approverName, approverSig, slots.approver.stamp]].forEach(([role, name, sig, stamp], i) => {
    const cx = L + i * (colW + 10);
    signature.draw(doc, sig, cx, colW, y, 34, stamp); // ไม่มีลายเซ็น -> ชื่อลายมือ + วันเวลาที่ลงนามผ่านระบบ
    dots(cx + 12, cx + colW - 12, y);
    doc.font('regular').fontSize(12).fillColor(INK).text(role, cx, y + 6, { width: colW, align: 'center', lineBreak: false });
    if (name) doc.fontSize(10).text(`(${name})`, cx, y + 22, { width: colW, align: 'center', lineBreak: false, ellipsis: true });
  });
  y += 46;
  doc.font('regular').fontSize(8).fillColor('#777777').text(`เลขที่เอกสาร ${ot.code}`, L, y, { width: W, align: 'right' });

  doc.save().dash(3, { space: 3 }).lineWidth(0.5).strokeColor('#bbbbbb')
    .moveTo(20, doc.page.height / 2).lineTo(doc.page.width - 20, doc.page.height / 2).stroke().restore();

  doc.end();
});

module.exports = router;
