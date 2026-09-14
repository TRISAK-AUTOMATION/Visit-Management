// routes/pdf.js - สร้างเอกสาร PDF ของคำขอออกนอกสถานที่ / ใบรายงานการปฏิบัติงาน
// หน้าตา (สี/โลโก้/หัวเอกสาร/ลำดับ-เปิดปิดหมวด) อ่านมาจากการตั้งค่าที่ Admin ปรับได้ที่หน้า
// "ตั้งค่า > ออกแบบ PDF" (routes/pdfSettings.js) แทนการ hardcode เหมือนเดิม
//
// Layout v2: จัดใหม่ทั้งหมดให้เป็นระเบียบแบบใบฟอร์มธุรกิจ - หมวดมีเลขกำกับ + แถบหัวหมวดสีอ่อน,
// การ์ดมีเส้นขอบรอบแต่ละหมวด, แต่ละแถวข้อมูลเป็น "label : value" บรรทัดเดียวคั่นด้วยเส้นบางๆ,
// หัวเอกสารพื้นขาว (ไม่ใช่แถบสีทึบ) + เส้นหนาใต้หัวกระดาษ, ไม่แสดงเลขที่เอกสารแล้ว
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

const STATUS_TH = { pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิกแล้ว', draft: 'ฉบับร่าง', revision: 'รอแก้ไข' };
const STATUS_COLOR = { pending: '#c9670f', approved: '#1a7a3c', rejected: '#c0392b', cancelled: '#6b7280', draft: '#6b7280', revision: '#c9670f' };

function th(d) {
  return toThaiDate(d);
}

function fetchRequest(id) {
  const request = db.prepare(`
    SELECT vr.*, c.name AS customer_name, c.address AS customer_address, c.phone AS customer_phone,
           u.full_name AS requester_name, u.position AS requester_position, u.department AS requester_department,
           a.full_name AS approver_name
    FROM visit_requests vr
    JOIN customers c ON c.id = vr.customer_id
    JOIN users u ON u.id = vr.requester_id
    LEFT JOIN users a ON a.id = vr.approver_id
    WHERE vr.id = ?
  `).get(id);
  return request;
}

router.get('/:id/pdf', requireAuth, (req, res) => {
  const request = fetchRequest(req.params.id);
  if (!request) return res.status(404).json({ error: 'ไม่พบคำขอ' });

  const settings = readSettings();
  const PRIMARY = settings.primary_color;
  const ACCENT = settings.accent_color;

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  doc.registerFont('regular', FONT_REGULAR);
  doc.registerFont('bold', FONT_BOLD);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${request.code}.pdf"`);
  doc.pipe(res);

  const pageW = doc.page.width;
  const marginX = 40;
  const contentW = pageW - marginX * 2;

  // ---------- HEADER (พื้นขาว + เส้นหนาสีหลักคั่นด้านล่าง แทนแถบสีทึบแบบเดิม) ----------
  let logoDrawn = false;
  if (settings.logo_base64 && settings.logo_base64.startsWith('data:image')) {
    try {
      const base64Data = settings.logo_base64.split(',')[1];
      const buf = Buffer.from(base64Data, 'base64');
      doc.image(buf, marginX, 24, { fit: [130, 44] });
      logoDrawn = true;
    } catch (e) { /* โลโก้เสีย/อ่านไม่ได้ - ข้ามไปแสดงชื่อองค์กรแทน */ }
  }
  if (!logoDrawn) {
    doc.font('bold').fontSize(24).fillColor(PRIMARY).text(settings.org_name, marginX, 26);
    doc.font('regular').fontSize(8.5).fillColor(MUTED).text(settings.org_subtitle, marginX, 54);
  }

  // ชื่อเอกสาร (ชิดขวา) - ไม่แสดงเลขที่เอกสารแล้วตามที่ขอ
  doc.font('bold').fontSize(17).fillColor(PRIMARY)
    .text(settings.doc_title, marginX, 26, { width: contentW, align: 'right' });

  // กล่องสถานะมุมขวาบน
  const statusText = STATUS_TH[request.status] || request.status;
  const statusColor = STATUS_COLOR[request.status] || MUTED;
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

  // ---------- helper: หมวดมีเลขกำกับ + แถบหัวหมวดสีอ่อน + การ์ดเส้นขอบ ----------
  let sectionNo = 0;
  function beginSection(title) {
    sectionNo += 1;
    doc.roundedRect(marginX, y, contentW, 22, 4).fill(LIGHT);
    doc.circle(marginX + 15, y + 11, 8).fill(ACCENT);
    doc.font('bold').fontSize(8.5).fillColor('#ffffff').text(String(sectionNo), marginX + 15 - 4, y + 7, { width: 8, align: 'center', lineBreak: false });
    doc.font('bold').fontSize(10.5).fillColor(PRIMARY).text(title, marginX + 30, y + 6);
    y += 22 + 10;
    return y; // จุดเริ่มการ์ด (สำหรับวาดกรอบครอบภายหลัง)
  }
  function endSection(cardTop) {
    doc.roundedRect(marginX, cardTop - 10, contentW, (y - cardTop) + 10, 6).strokeColor(CARD_BORDER).lineWidth(1).stroke();
    y += 16;
  }

  // แถวข้อมูลแบบ "label : value" บรรทัดเดียว คั่นด้วยเส้นบางๆ ใต้แต่ละแถว วางเป็น 1 คอลัมน์ภายในความกว้างที่กำหนด
  // labelW กว้างพอสำหรับ label ภาษาไทยที่ยาวที่สุดในฟอร์ม (เช่น "เลขประจำตัวผู้เสียภาษี") และคำนวณความสูงแถวจาก
  // ทั้ง label และ value (ไม่ใช่แค่ value อย่างเดียว) กันกรณี label ยาวจนต้องขึ้นบรรทัดใหม่แล้วไปทับแถวถัดไป
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

  // หมวด 2 คอลัมน์ (ซ้าย/ขวา) ความสูงแต่ละคอลัมน์อาจไม่เท่ากัน - การ์ดยึดตามคอลัมน์ที่สูงกว่า
  function twoColSection(title, leftRows, rightRows) {
    const cardTop = beginSection(title);
    const gap = 24;
    const colW = (contentW - gap) / 2;
    const leftBottom = columnRows(marginX, colW, y, leftRows);
    const rightBottom = columnRows(marginX + colW + gap, colW, y, rightRows);
    y = Math.max(leftBottom, rightBottom);
    endSection(cardTop);
  }

  // หมวดผลการอนุมัติ - กล่อง 3 คอลัมน์เท่ากัน (คงสไตล์เดิมที่อ่านง่าย)
  function approvalSection() {
    const cardTop = beginSection('ผลการพิจารณาอนุมัติ');
    const hasNote = !!request.approval_note;
    const boxH = hasNote ? 52 : 42;
    doc.roundedRect(marginX, y, contentW, boxH, 7).fillAndStroke(LIGHT, BORDER);
    const by = y + 9;
    doc.font('regular').fontSize(8).fillColor(MUTED).text('สถานะ', marginX + 16, by);
    doc.font('bold').fontSize(10.5).fillColor(statusColor).text(statusText, marginX + 16, by + 12);

    doc.font('regular').fontSize(8).fillColor(MUTED).text('ผู้อนุมัติ', marginX + 200, by);
    doc.font('bold').fontSize(10.5).fillColor(INK).text(request.approver_name || '-', marginX + 200, by + 12);

    doc.font('regular').fontSize(8).fillColor(MUTED).text('วันที่อนุมัติ', marginX + 380, by);
    doc.font('bold').fontSize(10.5).fillColor(INK).text(th(request.approved_at), marginX + 380, by + 12);

    if (hasNote) {
      doc.font('regular').fontSize(8.5).fillColor(MUTED).text(`ความคิดเห็น: ${request.approval_note}`, marginX + 16, by + 28, { width: contentW - 32 });
    }
    y += boxH;
    endSection(cardTop);
  }

  // ---------- เนื้อหาแต่ละหมวด ----------
  const visible = settings.section_visible || {};
  const sectionRenderers = {
    requester: () => twoColSection('ข้อมูลผู้ขออนุมัติ',
      [
        ['ชื่อผู้ขอ', request.requester_name],
        ['ตำแหน่ง', request.requester_position],
        ['แผนก', request.requester_department],
        ['วันที่ยื่นคำขอ', th(request.created_at)]
      ],
      [
        ['ประเภทงาน (Job Type)', request.job_type],
        ['ผู้ดูแลการขาย (Sales)', request.sales_person || request.requester_name]
      ]),
    customer: () => twoColSection('ข้อมูลลูกค้า / บริษัท',
      [
        ['บริษัท / ลูกค้า', request.customer_name],
        ['ผู้ติดต่อ', request.contact_person],
        ['สถานที่ปฏิบัติงาน', request.location],
        ['ที่อยู่ลูกค้า', request.customer_address]
      ],
      [
        ['เลขประจำตัวผู้เสียภาษี', request.customer_tax_id],
        ['เบอร์โทรลูกค้า', request.customer_phone],
        ['เบอร์โทรผู้ติดต่อ', request.contact_phone],
        ['วันที่ออกใบกำกับภาษี', th(request.tax_invoice_date)]
      ]),
    work: () => twoColSection('รายละเอียดการปฏิบัติงาน',
      [
        ['วันที่ปฏิบัติงาน', th(request.visit_date)],
        ['เวลาตามแผน', `${request.time_from} - ${request.time_to} น.`],
        ['เวลาปฏิบัติงานจริง', (request.actual_time_out || request.actual_time_back) ? `${request.actual_time_out || '-'} - ${request.actual_time_back || '-'} น.` : '-'],
        ['ไมล์ออก / ไมล์เข้า', `${request.mileage_out ?? '-'} / ${request.mileage_in ?? '-'}`]
      ],
      [
        ['ยานพาหนะ', request.transport],
        ['ทะเบียนรถ', request.license_plate],
        ['สินค้า/อุปกรณ์ที่เกี่ยวข้อง', request.product],
        ['จำนวนชั่วโมง OT', request.ot_hours != null ? `${request.ot_hours} ชม.` : '-'],
        ['วัตถุประสงค์ / รายละเอียดงาน', request.purpose],
        ['ผู้ร่วมงาน', request.participants],
        ['หมายเหตุ (Remark)', request.notes]
      ]),
    approval: approvalSection
  };

  const order = (settings.section_order && settings.section_order.length) ? settings.section_order : Object.keys(sectionRenderers);
  order.forEach(key => {
    if (sectionRenderers[key] && visible[key] !== false) sectionRenderers[key]();
  });

  // ---------- ลายเซ็น (เปิด/ปิดได้จากหน้าตั้งค่า) ----------
  if (settings.show_signature) {
    const sigBlockHeight = 62;
    if (y + sigBlockHeight > doc.page.height - 60) {
      doc.addPage();
      y = 50;
    }
    const sigW = contentW / 3;
    const labels = ['ผู้ขอปฏิบัติงาน', 'ผู้ตรวจสอบ', 'ผู้อนุมัติ'];
    labels.forEach((label, i) => {
      const x = marginX + i * sigW;
      doc.moveTo(x + 20, y + 32).lineTo(x + sigW - 20, y + 32).strokeColor(MUTED).lineWidth(0.8).dash(2, { space: 2 }).stroke().undash();
      doc.font('regular').fontSize(9).fillColor(INK).text(label, x, y + 38, { width: sigW, align: 'center' });
      doc.font('regular').fontSize(8).fillColor(MUTED).text('วันที่ ____/____/______', x, y + 52, { width: sigW, align: 'center' });
    });
  }

  // ---------- FOOTER ----------
  // สร้างสตริงวันที่-เวลาแบบไทยเอง (แทนการพึ่ง toLocaleString('th-TH') ที่ default เป็นปี พ.ศ. และมีพฤติกรรมชั่วโมงไม่แน่นอนตาม ICU ของแต่ละเครื่อง)
  // ให้ตรงกับส่วนอื่นของระบบ: ปี ค.ศ. + เวลาแบบ 24 ชม.
  const now = new Date();
  const printedAt = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ` +
    `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  doc.font('regular').fontSize(7.5).fillColor(MUTED)
    .text(`เอกสารสร้างโดยระบบ ${settings.org_name} ${settings.org_subtitle} · พิมพ์เมื่อ ${printedAt}`,
      marginX, doc.page.height - 56, { width: contentW, align: 'center', lineBreak: false });

  doc.end();
});

module.exports = router;
