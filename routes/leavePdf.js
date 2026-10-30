// routes/leavePdf.js - PDF "ใบลา" ตามแบบฟอร์มกระดาษของบริษัท (ใช้ครึ่งบนของ A4 เพื่อพิมพ์แล้วตัดครึ่งได้)
// เติมข้อมูลลงบนเส้นประของแบบเดิม ช่องลายเซ็นปล่อยว่างไว้ให้เซ็นมือ (ยังไม่ฝังรูปลายเซ็น)
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

const router = express.Router();

const FONT_REGULAR = path.join(__dirname, '..', 'fonts', 'Sarabun-Regular.ttf');
const FONT_BOLD = path.join(__dirname, '..', 'fonts', 'Sarabun-Bold.ttf');
const COMPANY = 'บริษัท ตรีศักดิ์ ออโตเมชั่น จำกัด';
const INK = '#111111';
const FS = 12;

// SQLite เก็บเวลาเป็น UTC -> แปลงเป็นวันที่ไทย (Asia/Bangkok)
function bangkokDate(utcStr) {
  if (!utcStr) return '';
  const d = new Date(String(utcStr).replace(' ', 'T') + 'Z');
  if (isNaN(d)) return toThaiDate(utcStr);
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(d);
  const g = (t) => p.find(x => x.type === t).value;
  return `${g('day')}/${g('month')}/${g('year')}`;
}
const num = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

router.get('/:id/pdf', requireAuth, (req, res) => {
  const cfg = readSettings().docs.leave; // ตั้งค่าได้ที่ Settings > ออกแบบ PDF
  const lr = db.prepare(`
    SELECT lr.*, u.full_name AS requester_name, a.full_name AS approver_name
    FROM leave_requests lr
    JOIN users u ON u.id = lr.requester_id
    LEFT JOIN users a ON a.id = lr.approver_id
    WHERE lr.id = ?
  `).get(req.params.id);
  if (!lr) return res.status(404).json({ error: 'ไม่พบคำขอลา' });
  if (!canViewRequest(req.session, 'leave', lr)) return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ดูคำขอนี้' });
  if (lr.status !== 'approved') return res.status(400).json({ error: 'พิมพ์ PDF ได้เฉพาะคำขอที่อนุมัติแล้วเท่านั้น' });

  // ชื่อผู้ลงนาม: หัวหน้า = ขั้นแรกของสายอนุมัติ, ผู้อนุมัติ = ขั้นสุดท้าย (ถ้ามีขั้นเดียวให้เป็นผู้อนุมัติ)
  const wf = approvalEngine.getWorkflow('leave', lr.id);
  const namesOf = (st) => st ? st.approvers.filter(a => a.decision === 'approve').map(a => a.full_name).join(', ') : '';
  // ลายเซ็น: ใช้ของผู้ที่ "อนุมัติแล้ว" จริงเท่านั้น (คนแรกในขั้นนั้นที่อัปโหลดลายเซ็นไว้)
  const sigOf = (st) => { if (!st) return null; for (const a of st.approvers) { if (a.decision === 'approve') { const b = signature.getBuffer(a.user_id); if (b) return b; } } return null; };
  let headName = '', approverName = lr.approver_name || '', headSig = null, approverSig = null;
  if (wf && wf.states.length) {
    if (wf.states.some(s => s.slot)) {
      // ตั้งช่องลงนามไว้ใน Template: ขั้นที่เป็น 'head' ลงช่องหัวหน้า ที่เหลือลงช่องผู้อนุมัติ
      const hs = wf.states.filter(s => s.slot === 'head'), as = wf.states.filter(s => s.slot !== 'head');
      headName = hs.map(namesOf).filter(Boolean).join(', '); headSig = hs.map(sigOf).find(Boolean) || null;
      approverName = as.map(namesOf).filter(Boolean).join(', ') || approverName; approverSig = as.map(sigOf).find(Boolean) || null;
    } else {
      const last = wf.states[wf.states.length - 1];
      approverName = namesOf(last) || approverName;
      approverSig = sigOf(last);
      if (wf.states.length > 1) { headName = namesOf(wf.states[0]); headSig = sigOf(wf.states[0]); }
    }
  }
  const requesterSig = signature.getBuffer(lr.requester_id);

  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  doc.registerFont('regular', FONT_REGULAR);
  doc.registerFont('bold', FONT_BOLD);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${lr.code}.pdf"`);
  doc.pipe(res);

  const L = 50, R = doc.page.width - 50, W = R - L;
  let y = 42;

  // ข้อความที่เติมบนเส้นประ: label ซ้าย, เส้นประ, ค่า (วางทับเส้น)
  function dots(x1, x2, yy) {
    doc.save().dash(0.8, { space: 1.6 }).lineWidth(0.7).strokeColor(INK).moveTo(x1, yy).lineTo(x2, yy).stroke().undash().restore();
  }
  function field(label, value, x, yy, xEnd, align = 'center') {
    doc.font('regular').fontSize(FS).fillColor(INK);
    const lw = doc.widthOfString(label);
    doc.text(label, x, yy, { lineBreak: false });
    const sx = x + lw + 2;
    dots(sx, xEnd, yy + 14);
    if (value) doc.text(String(value), sx + 2, yy, { width: xEnd - sx - 4, align, lineBreak: false, ellipsis: true });
    return xEnd;
  }
  function checkbox(x, yy, label, checked) {
    doc.lineWidth(0.9).strokeColor(INK).rect(x, yy + 1, 13, 13).stroke();
    if (checked) doc.lineWidth(1.6).moveTo(x + 2.5, yy + 8).lineTo(x + 6, yy + 12).lineTo(x + 11.5, yy + 3).stroke();
    doc.font('regular').fontSize(FS).fillColor(INK).text(label, x + 21, yy, { lineBreak: false });
  }

  // หัวกระดาษ
  doc.font('bold').fontSize(15).fillColor(INK).text(cfg.company || COMPANY, L, y, { width: W, align: 'center' });
  y += 22;
  doc.font('bold').fontSize(14).text(cfg.title, L, y, { width: W, align: 'center' });
  y += 28;

  // วันที่ (ชิดขวา)
  field('วันที่', bangkokDate(lr.created_at), R - 250, y, R);
  y += 28;
  field('ชื่อ-นามสกุล', lr.requester_name, L, y, R, 'left');
  y += 36;

  // ประเภทการลา (ฟอร์มเดิมมี ป่วย/ประจำปี แต่ระบบมี "ลากิจ" ด้วย จึงเพิ่มให้ในแถวเดียวกัน)
  checkbox(L + 70, y, 'ลาป่วย', lr.leave_type === 'ลาป่วย');
  checkbox(L + 185, y, 'ลากิจ', lr.leave_type === 'ลากิจ');
  checkbox(L + 300, y, 'ลาหยุดประจำปี', lr.leave_type === 'ลาพักร้อน');
  y += 36;

  // เหตุผล (ยาวเกินบรรทัดเดียวให้ขึ้นบรรทัดใหม่ มีเส้นประทุกบรรทัด)
  const rLabel = 'เหตุผลในการลา';
  doc.font('regular').fontSize(FS).fillColor(INK);
  const rlw = doc.widthOfString(rLabel);
  doc.text(rLabel, L, y, { lineBreak: false });
  const rx = L + rlw + 6;
  const reasonText = String(lr.reason || '').replace(/\s+/g, ' ').trim();
  const rh = doc.heightOfString(reasonText || ' ', { width: R - rx });
  const lines = Math.min(3, Math.max(1, Math.round(rh / 14)));
  doc.text(reasonText, rx, y, { width: R - rx, height: lines * 14, ellipsis: true, lineGap: 0 });
  dots(L + rlw + 2, R, y + 14);
  for (let i = 1; i < lines; i++) dots(L, R, y + 14 + i * 20);
  y += 22 + (lines - 1) * 20 + 14;

  // ลา(วัน) / ลา(ชั่วโมง)
  const isHours = lr.leave_mode === 'hours';
  const modeTh = { half_day_morning: ' (ครึ่งวันเช้า)', half_day_afternoon: ' (ครึ่งวันบ่าย)' }[lr.leave_mode] || '';
  const range = lr.date_from === lr.date_to ? toThaiDate(lr.date_from) : `${toThaiDate(lr.date_from)} - ${toThaiDate(lr.date_to)}`;
  const dayTxt = isHours ? '' : range + modeTh;
  const hourTxt = isHours ? `${toThaiDate(lr.date_from)}  ${lr.time_from || ''} - ${lr.time_to || ''} น.` : '';
  const split = L + 345;
  field('ลา(วัน)', dayTxt, L, y, split - 6);
  field('รวม', isHours ? '' : num(lr.duration_days), split, y, R - 24);
  doc.font('regular').fontSize(FS).text('วัน', R - 20, y, { lineBreak: false });
  y += 34;
  field('ลา(ชั่วโมง)', hourTxt, L, y, split - 6);
  field('รวม', isHours ? num(lr.duration_hours) : '', split, y, R - 40);
  doc.font('regular').fontSize(FS).text('ชั่วโมง', R - 36, y, { lineBreak: false });
  y += 52;

  // ลายเซ็น 3 ช่อง (ช่องเซ็นว่างไว้ให้เซ็นมือ ชื่อพิมพ์อยู่ใต้ตำแหน่ง)
  const colW = (W - 20) / 3;
  const cols = [
    ['ผู้ยื่นคำร้อง', lr.requester_name, requesterSig],
    ['หัวหน้า', headName, headSig],
    ['ผู้อนุมัติ', approverName, approverSig]
  ];
  if (cfg.show_signature) cols.forEach(([role, name, sig], i) => {
    const cx = L + i * (colW + 10);
    signature.draw(doc, sig, cx, colW, y, 36);
    dots(cx + 12, cx + colW - 12, y);
    doc.font('regular').fontSize(FS).fillColor(INK).text(role, cx, y + 6, { width: colW, align: 'center', lineBreak: false });
    if (name) doc.fontSize(10).text(`(${name})`, cx, y + 22, { width: colW, align: 'center', lineBreak: false, ellipsis: true });
  });
  y += 46;
  doc.font('regular').fontSize(8).fillColor('#777777').text(`เลขที่เอกสาร ${lr.code}`, L, y, { width: W, align: 'right' });

  // เส้นประตัดครึ่งหน้า A4
  doc.save().dash(3, { space: 3 }).lineWidth(0.5).strokeColor('#bbbbbb')
    .moveTo(20, doc.page.height / 2).lineTo(doc.page.width - 20, doc.page.height / 2).stroke().restore();

  doc.end();
});

module.exports = router;
