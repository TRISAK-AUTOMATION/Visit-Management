// routes/otPdf.js - สร้างเอกสาร PDF ใบขอทำงานล่วงเวลา (OT) - ใช้สไตล์เดียวกับ routes/pdf.js
const express = require('express');
const path = require('path');
const PDFDocument = require('pdfkit');
const db = require('../db/database');
const { requireAuth } = require('./middleware');
const { toThaiDate } = require('../utils/dateFormat');
const { readSettings } = require('./pdfSettings');

const router = express.Router();

const FONT_REGULAR = path.join(__dirname, '..', 'fonts', 'Sarabun-Regular.ttf');
const FONT_BOLD = path.join(__dirname, '..', 'fonts', 'Sarabun-Bold.ttf');

const MUTED = '#6b7280';
const INK = '#1a2233';
const LIGHT = '#eef1fb';
const BORDER = '#d7dcec';
const CARD_BORDER = '#e2e6f2';

const STATUS_TH = { pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิกแล้ว', draft: 'ฉบับร่าง' };
const STATUS_COLOR = { pending: '#c9670f', approved: '#1a7a3c', rejected: '#c0392b', cancelled: '#6b7280', draft: '#6b7280' };

function th(d) { return toThaiDate(d); }

router.get('/:id/pdf', requireAuth, (req, res) => {
  const ot = db.prepare(`
    SELECT o.*, u.full_name AS requester_name, u.position AS requester_position, u.department AS requester_department,
           a.full_name AS approver_name
    FROM ot_requests o
    JOIN users u ON u.id = o.requester_id
    LEFT JOIN users a ON a.id = o.approver_id
    WHERE o.id = ?
  `).get(req.params.id);
  if (!ot) return res.status(404).json({ error: 'ไม่พบคำขอ OT' });
  if (ot.status !== 'approved') return res.status(400).json({ error: 'พิมพ์ PDF ได้เฉพาะคำขอที่อนุมัติแล้วเท่านั้น' });

  const settings = readSettings();
  const PRIMARY = settings.primary_color;
  const ACCENT = settings.accent_color;

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  doc.registerFont('regular', FONT_REGULAR);
  doc.registerFont('bold', FONT_BOLD);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${ot.code}.pdf"`);
  doc.pipe(res);

  const pageW = doc.page.width;
  const marginX = 40;
  const contentW = pageW - marginX * 2;

  // ---------- HEADER ----------
  let logoDrawn = false;
  if (settings.logo_base64 && settings.logo_base64.startsWith('data:image')) {
    try {
      const buf = Buffer.from(settings.logo_base64.split(',')[1], 'base64');
      doc.image(buf, marginX, 24, { fit: [130, 44] });
      logoDrawn = true;
    } catch (e) { /* โลโก้เสีย/อ่านไม่ได้ - ข้ามไปแสดงชื่อองค์กรแทน */ }
  }
  if (!logoDrawn) {
    doc.font('bold').fontSize(24).fillColor(PRIMARY).text(settings.org_name, marginX, 26);
    doc.font('regular').fontSize(8.5).fillColor(MUTED).text(settings.org_subtitle, marginX, 54);
  }

  doc.font('bold').fontSize(17).fillColor(PRIMARY)
    .text('ใบขอทำงานล่วงเวลา (OT)', marginX, 26, { width: contentW, align: 'right' });

  const statusText = STATUS_TH[ot.status] || ot.status;
  const statusColor = STATUS_COLOR[ot.status] || MUTED;
  doc.font('bold').fontSize(9.5);
  const statusValW = doc.widthOfString(statusText);
  const boxW = Math.max(90, statusValW + 24);
  const boxX = pageW - marginX - boxW;
  const boxY = 54;
  doc.roundedRect(boxX, boxY, boxW, 26, 6).fillAndStroke(LIGHT, BORDER);
  doc.font('regular').fontSize(7.5).fillColor(MUTED).text('สถานะ', boxX + 10, boxY + 5);
  doc.font('bold').fontSize(9.5).fillColor(statusColor).text(statusText, boxX + 10, boxY + 15);

  let y = 90;
  doc.moveTo(marginX, y).lineTo(pageW - marginX, y).strokeColor(PRIMARY).lineWidth(2).stroke();
  y += 18;

  let sectionNo = 0;
  function beginSection(title) {
    sectionNo += 1;
    doc.roundedRect(marginX, y, contentW, 22, 4).fill(LIGHT);
    doc.circle(marginX + 15, y + 11, 8).fill(ACCENT);
    doc.font('bold').fontSize(8.5).fillColor('#ffffff').text(String(sectionNo), marginX + 15 - 4, y + 7, { width: 8, align: 'center', lineBreak: false });
    doc.font('bold').fontSize(10.5).fillColor(PRIMARY).text(title, marginX + 30, y + 6);
    y += 22 + 10;
    return y;
  }
  function endSection(cardTop) {
    doc.roundedRect(marginX, cardTop - 10, contentW, (y - cardTop) + 10, 6).strokeColor(CARD_BORDER).lineWidth(1).stroke();
    y += 16;
  }
  function columnRows(x, colW, startY, rows) {
    const labelW = 130;
    const valueW = colW - labelW - 6;
    let cy = startY;
    rows.forEach(([label, value]) => {
      doc.font('regular').fontSize(8.3).fillColor(MUTED).text(label, x, cy, { width: labelW });
      doc.font('regular').fontSize(8.3).fillColor(MUTED).text(':', x + labelW - 8, cy, { width: 8, lineBreak: false });
      doc.font('bold').fontSize(9.5).fillColor(INK).text(value || '-', x + labelW, cy, { width: valueW });
      const valueH = doc.heightOfString(value || '-', { width: valueW });
      const labelH = doc.heightOfString(label, { width: labelW });
      const rowH = Math.max(15, valueH, labelH);
      cy += rowH + 5;
      doc.moveTo(x, cy - 3).lineTo(x + colW, cy - 3).strokeColor(BORDER).lineWidth(0.5).stroke();
    });
    return cy;
  }
  function twoColSection(title, leftRows, rightRows) {
    const cardTop = beginSection(title);
    const gap = 24;
    const colW = (contentW - gap) / 2;
    const leftBottom = columnRows(marginX, colW, y, leftRows);
    const rightBottom = columnRows(marginX + colW + gap, colW, y, rightRows);
    y = Math.max(leftBottom, rightBottom);
    endSection(cardTop);
  }

  twoColSection('ข้อมูลผู้ขอ',
    [
      ['ชื่อผู้ขอ', ot.requester_name],
      ['ตำแหน่ง', ot.requester_position],
      ['แผนก', ot.requester_department],
      ['วันที่ยื่นคำขอ', th(ot.created_at)]
    ],
    [
      ['วันที่ทำ OT', th(ot.ot_date)],
      ['เวลา', `${ot.time_from} - ${ot.time_to} น.`],
      ['จำนวนชั่วโมง', `${ot.hours} ชม.`],
      ['สถานที่ปฏิบัติงาน', ot.location]
    ]);

  twoColSection('รายละเอียดงาน',
    [
      ['รายละเอียดงานที่ทำ', ot.work_detail],
      ['เหตุผลในการทำ OT', ot.reason]
    ],
    [
      ['หมายเหตุ', ot.notes]
    ]);

  // ---------- ผลการอนุมัติ ----------
  {
    const cardTop = beginSection('ผลการพิจารณาอนุมัติ');
    const hasNote = !!ot.approval_note;
    const boxH = hasNote ? 52 : 42;
    doc.roundedRect(marginX, y, contentW, boxH, 7).fillAndStroke(LIGHT, BORDER);
    const by = y + 9;
    doc.font('regular').fontSize(8).fillColor(MUTED).text('สถานะ', marginX + 16, by);
    doc.font('bold').fontSize(10.5).fillColor(statusColor).text(statusText, marginX + 16, by + 12);
    doc.font('regular').fontSize(8).fillColor(MUTED).text('ผู้อนุมัติ', marginX + 200, by);
    doc.font('bold').fontSize(10.5).fillColor(INK).text(ot.approver_name || '-', marginX + 200, by + 12);
    doc.font('regular').fontSize(8).fillColor(MUTED).text('วันที่อนุมัติ', marginX + 380, by);
    doc.font('bold').fontSize(10.5).fillColor(INK).text(th(ot.approved_at), marginX + 380, by + 12);
    if (hasNote) {
      doc.font('regular').fontSize(8.5).fillColor(MUTED).text(`ความคิดเห็น: ${ot.approval_note}`, marginX + 16, by + 28, { width: contentW - 32 });
    }
    y += boxH;
    endSection(cardTop);
  }

  // ---------- ลายเซ็น ----------
  if (settings.show_signature) {
    const sigBlockHeight = 62;
    if (y + sigBlockHeight > doc.page.height - 60) { doc.addPage(); y = 50; }
    const sigW = contentW / 3;
    ['ผู้ขอทำ OT', 'ผู้ตรวจสอบ', 'ผู้อนุมัติ'].forEach((label, i) => {
      const x = marginX + i * sigW;
      doc.moveTo(x + 20, y + 32).lineTo(x + sigW - 20, y + 32).strokeColor(MUTED).lineWidth(0.8).dash(2, { space: 2 }).stroke().undash();
      doc.font('regular').fontSize(9).fillColor(INK).text(label, x, y + 38, { width: sigW, align: 'center' });
      doc.font('regular').fontSize(8).fillColor(MUTED).text('วันที่ ____/____/______', x, y + 52, { width: sigW, align: 'center' });
    });
  }

  const now = new Date();
  const printedAt = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ` +
    `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  doc.font('regular').fontSize(7.5).fillColor(MUTED)
    .text(`เอกสารสร้างโดยระบบ ${settings.org_name} ${settings.org_subtitle} · พิมพ์เมื่อ ${printedAt}`,
      marginX, doc.page.height - 56, { width: contentW, align: 'center', lineBreak: false });

  doc.end();
});

module.exports = router;
