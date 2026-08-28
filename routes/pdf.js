// routes/pdf.js - สร้างเอกสาร PDF ของคำขอออกนอกสถานที่ / ใบรายงานการปฏิบัติงาน
const express = require('express');
const path = require('path');
const PDFDocument = require('pdfkit');
const db = require('../db/database');
const { requireAuth } = require('./middleware');

const router = express.Router();

const FONT_REGULAR = path.join(__dirname, '..', 'fonts', 'Sarabun-Regular.ttf');
const FONT_BOLD = path.join(__dirname, '..', 'fonts', 'Sarabun-Bold.ttf');

const NAVY = '#0b1530';
const BLUE = '#2f5bff';
const GREY = '#ffffff';
const LIGHT = '#eef1fb';
const BORDER = '#d7dcec';

const STATUS_TH = { pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิกแล้ว', draft: 'ฉบับร่าง', revision: 'รอแก้ไข' };
const STATUS_COLOR = { pending: '#f5a524', approved: '#1fae62', rejected: '#f0483e', cancelled: '#9aa2b4', draft: '#7a8296', revision: '#d9832a' };

function th(d) {
  if (!d) return '-';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
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

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  doc.registerFont('regular', FONT_REGULAR);
  doc.registerFont('bold', FONT_BOLD);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${request.code}.pdf"`);
  doc.pipe(res);

  const pageW = doc.page.width;
  const marginX = 40;
  const contentW = pageW - marginX * 2;

  // ---------- HEADER ----------
  doc.rect(0, 0, pageW, 86).fill(NAVY);
  doc.fillColor('#ffffff').font('bold').fontSize(20).text('TRISAK', marginX, 24);
  doc.font('regular').fontSize(9.5).fillColor('#b7c0dc').text('VISIT MANAGEMENT SYSTEM', marginX, 48);
  doc.font('bold').fontSize(13).fillColor('#ffffff')
    .text('ใบขออนุมัติออกนอกสถานที่ (Visit Request Form)', marginX, 24, { width: contentW, align: 'right' });
  doc.font('regular').fontSize(10).fillColor('#c7cff0')
    .text(`เลขที่เอกสาร: ${request.code}`, marginX, 48, { width: contentW, align: 'right' });

  // สถานะ badge
  const statusText = STATUS_TH[request.status] || request.status;
  doc.font('bold').fontSize(10);
  const badgeW = doc.widthOfString(statusText) + 24;
  doc.roundedRect(pageW - marginX - badgeW, 62, badgeW, 18, 9).fill(STATUS_COLOR[request.status] || GREY);
  doc.fillColor('#ffffff').text(statusText, pageW - marginX - badgeW, 66, { width: badgeW, align: 'center' });

  let y = 106;

  // ---------- ข้อมูลผู้ขอ / ลูกค้า ----------
  function sectionTitle(title) {
    doc.font('bold').fontSize(11).fillColor(NAVY).text(title, marginX, y);
    y += 16;
    doc.moveTo(marginX, y).lineTo(pageW - marginX, y).strokeColor(BORDER).lineWidth(1).stroke();
    y += 10;
  }

  function fieldRow(pairs) {
    // pairs: [[label, value], [label, value]]
    const colW = contentW / pairs.length;
    const startY = y;
    let maxH = 0;
    pairs.forEach(([label, value], i) => {
      const x = marginX + i * colW;
      doc.font('regular').fontSize(8.5).fillColor(GREY).text(label, x, startY, { width: colW - 10 });
      doc.font('bold').fontSize(10.5).fillColor('#141b2d')
        .text(value || '-', x, startY + 12, { width: colW - 10 });
      const h = doc.heightOfString(value || '-', { width: colW - 10 });
      maxH = Math.max(maxH, 12 + h);
    });
    y = startY + maxH + 9;
  }

  sectionTitle('ข้อมูลผู้ขออนุมัติ');
  fieldRow([
    ['ชื่อผู้ขอ', request.requester_name],
    ['ตำแหน่ง', request.requester_position],
    ['แผนก', request.requester_department]
  ]);
  fieldRow([
    ['วันที่ยื่นคำขอ', request.created_at ? request.created_at.slice(0, 10).split('-').reverse().join('/') : '-'],
    ['ประเภทงาน (Job Type)', request.job_type],
    ['ผู้ดูแลการขาย (Sales)', request.sales_person || request.requester_name]
  ]);

  sectionTitle('ข้อมูลลูกค้า / บริษัท');
  fieldRow([
    ['ลูกค้า / บริษัท', request.customer_name],
    ['เบอร์โทรลูกค้า', request.customer_phone],
    ['เลขประจำตัวผู้เสียภาษี', request.customer_tax_id]
  ]);
  fieldRow([
    ['ผู้ติดต่อ', request.contact_person],
    ['เบอร์โทรผู้ติดต่อ', request.contact_phone],
    ['วันที่ออกใบกำกับภาษี', th(request.tax_invoice_date)]
  ]);
  doc.font('regular').fontSize(8.5).fillColor(GREY).text('สถานที่', marginX, y);
  doc.font('bold').fontSize(10.5).fillColor('#141b2d').text(request.location || '-', marginX, y + 12, { width: contentW });
  y += 12 + doc.heightOfString(request.location || '-', { width: contentW }) + 14;

  sectionTitle('รายละเอียดการปฏิบัติงาน');
  fieldRow([
    ['วันที่ปฏิบัติงาน', th(request.visit_date)],
    ['เวลาตามแผน', `${request.time_from} - ${request.time_to}`],
    ['เวลาปฏิบัติงานจริง', (request.actual_time_out || request.actual_time_back) ? `${request.actual_time_out || '-'} - ${request.actual_time_back || '-'}` : '-']
  ]);
  fieldRow([
    ['ไมล์ออก', request.mileage_out != null ? String(request.mileage_out) : '-'],
    ['ไมล์เข้า', request.mileage_in != null ? String(request.mileage_in) : '-'],
    ['จำนวนชั่วโมง OT', request.ot_hours != null ? `${request.ot_hours} ชม.` : '-']
  ]);
  fieldRow([
    ['ยานพาหนะ', request.transport],
    ['ทะเบียนรถ', request.license_plate],
    ['สินค้า/อุปกรณ์ที่เกี่ยวข้อง', request.product]
  ]);

  doc.font('regular').fontSize(8.5).fillColor(GREY).text('วัตถุประสงค์ / รายละเอียดงาน', marginX, y);
  doc.font('bold').fontSize(10.5).fillColor('#141b2d').text(request.purpose || '-', marginX, y + 12, { width: contentW });
  y += 12 + doc.heightOfString(request.purpose || '-', { width: contentW }) + 10;

  doc.font('regular').fontSize(8.5).fillColor(GREY).text('ผู้ร่วมงาน', marginX, y);
  doc.font('bold').fontSize(10.5).fillColor('#141b2d').text(request.participants || '-', marginX, y + 12, { width: contentW });
  y += 12 + doc.heightOfString(request.participants || '-', { width: contentW }) + 10;

  doc.font('regular').fontSize(8.5).fillColor(GREY).text('หมายเหตุ (Remark)', marginX, y);
  doc.font('bold').fontSize(10.5).fillColor('#141b2d').text(request.notes || '-', marginX, y + 12, { width: contentW });
  y += 12 + doc.heightOfString(request.notes || '-', { width: contentW }) + 16;

  // ---------- ผลการอนุมัติ ----------
  sectionTitle('ผลการพิจารณาอนุมัติ');
  doc.roundedRect(marginX, y, contentW, 56, 8).fillAndStroke(LIGHT, BORDER);
  const boxY = y + 10;
  doc.font('regular').fontSize(8.5).fillColor(GREY).text('สถานะ', marginX + 14, boxY);
  doc.font('bold').fontSize(11).fillColor(STATUS_COLOR[request.status] || NAVY).text(statusText, marginX + 14, boxY + 12);

  doc.font('regular').fontSize(8.5).fillColor(GREY).text('ผู้อนุมัติ', marginX + 200, boxY);
  doc.font('bold').fontSize(11).fillColor('#141b2d').text(request.approver_name || '-', marginX + 200, boxY + 12);

  doc.font('regular').fontSize(8.5).fillColor(GREY).text('วันที่อนุมัติ', marginX + 380, boxY);
  doc.font('bold').fontSize(11).fillColor('#141b2d')
    .text(request.approved_at ? request.approved_at.slice(0, 10).split('-').reverse().join('/') : '-', marginX + 380, boxY + 12);

  if (request.approval_note) {
    doc.font('regular').fontSize(9).fillColor(GREY).text(`ความคิดเห็น: ${request.approval_note}`, marginX + 14, boxY + 30, { width: contentW - 28 });
  }
  y += 56 + 24;

  // ---------- ลายเซ็น ----------
  // ตรวจสอบพื้นที่เหลือ ถ้าไม่พอสำหรับบล็อกลายเซ็น ให้ขึ้นหน้าใหม่
  const sigBlockHeight = 80;
  if (y + sigBlockHeight > doc.page.height - 70) {
    doc.addPage();
    y = 50;
  }
  const sigW = contentW / 3;
  const labels = ['ผู้ขอปฏิบัติงาน', 'ผู้ตรวจสอบ', 'ผู้อนุมัติ'];
  labels.forEach((label, i) => {
    const x = marginX + i * sigW;
    doc.moveTo(x + 20, y + 40).lineTo(x + sigW - 20, y + 40).strokeColor(GREY).lineWidth(0.8).stroke();
    doc.font('regular').fontSize(9.5).fillColor('#141b2d').text(label, x, y + 46, { width: sigW, align: 'center' });
    doc.font('regular').fontSize(8.5).fillColor(GREY).text('วันที่ ____/____/______', x, y + 62, { width: sigW, align: 'center' });
  });

  // ---------- FOOTER ----------
  doc.font('regular').fontSize(8).fillColor(GREY)
    .text(`เอกสารสร้างโดยระบบ TRISAK Visit Management System · พิมพ์เมื่อ ${new Date().toLocaleString('th-TH')}`,
      marginX, doc.page.height - 60, { width: contentW, align: 'center', lineBreak: false });

  doc.end();
});

module.exports = router;
