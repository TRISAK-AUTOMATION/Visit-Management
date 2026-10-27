// utils/reportExport.js - สร้างไฟล์รายงาน Excel (.xlsx) และ PDF จากข้อมูลที่ query แล้ว
// ไม่ใช้ screenshot: Excel สร้างด้วย exceljs, PDF วาดตารางด้วย pdfkit + ฟอนต์ Sarabun (ฝังฟอนต์ ภาษาไทยแสดงถูกต้อง)
const path = require('path');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const FONT_REGULAR = path.join(__dirname, '..', 'fonts', 'Sarabun-Regular.ttf');
const FONT_BOLD = path.join(__dirname, '..', 'fonts', 'Sarabun-Bold.ttf');

const NAVY = '1B2A4A';
const ROYAL = '2F5BFF';
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const nowBangkok = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');
const dmy = (s) => (ISO.test(s || '') ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : s || '');
const num1 = (v) => (Number.isInteger(Number(v)) ? String(Number(v)) : (Math.round(Number(v) * 10) / 10).toFixed(1));

// กัน Excel Formula Injection: ข้อความที่ขึ้นต้นด้วย = + - @ หรือ tab/CR ถูกนำหน้าด้วย ' เพื่อไม่ให้ถูกตีความเป็นสูตร
function safeCell(v) {
  const s = String(v == null ? '' : v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function cellText(col, v) {
  if (v === null || v === undefined || v === '') return '';
  if (col.type === 'date') return dmy(v);
  if (col.type === 'number') return num1(v);
  return String(v);
}

// ---------------- Excel ----------------
async function buildXlsx({ title, columns, rows, meta, totals }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TRISAK Visit Management';
  wb.created = new Date();

  const ws = wb.addWorksheet(title.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map((c) => ({
    header: c.label, key: c.key,
    width: Math.max(10, Math.min(48, Math.round(c.w * 2.4 + 4)))
  }));

  const head = ws.getRow(1);
  head.height = 24;
  head.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + NAVY } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF' + ROYAL } } };
  });

  rows.forEach((r) => {
    const values = {};
    columns.forEach((c) => {
      const v = r[c.key];
      if (v === null || v === undefined || v === '') { values[c.key] = null; return; }
      if (c.type === 'date' && ISO.test(v)) values[c.key] = new Date(Date.UTC(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10)));
      else if (c.type === 'number') values[c.key] = Number(v);
      else values[c.key] = safeCell(v);
    });
    ws.addRow(values);
  });

  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.type === 'date') { col.numFmt = 'dd/mm/yyyy'; col.alignment = { horizontal: 'center', vertical: 'top' }; }
    else if (c.type === 'number') { col.numFmt = '#,##0.0#'; col.alignment = { horizontal: 'right', vertical: 'top' }; }
    else if (c.type === 'time') col.alignment = { horizontal: 'center', vertical: 'top' };
    else col.alignment = { vertical: 'top', wrapText: true };
  });
  head.eachCell((cell) => { cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  // ชีทสรุป: รายละเอียดการสร้างรายงาน + ผลรวมของคอลัมน์ตัวเลข
  const ss = wb.addWorksheet('Summary');
  ss.columns = [{ width: 26 }, { width: 60 }];
  const line = (k, v, bold) => {
    const r = ss.addRow([k, v === null || v === undefined ? '' : (typeof v === 'number' ? v : safeCell(v))]);
    r.getCell(1).font = { bold: true, color: { argb: 'FF' + NAVY } };
    if (bold) r.getCell(2).font = { bold: true };
    r.getCell(2).alignment = { horizontal: 'left', wrapText: true, vertical: 'top' };
    return r;
  };
  const t = ss.addRow([title]); t.getCell(1).font = { bold: true, size: 16, color: { argb: 'FF' + NAVY } };
  ss.addRow([]);
  meta.forEach(([k, v]) => line(k, v));
  line('จำนวนรายการ (Rows)', rows.length, true);
  if (totals && totals.length) {
    ss.addRow([]);
    totals.forEach(([k, v]) => line(k, v, true));
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------------- PDF ----------------
function buildPdf({ title, columns, rows, meta, totals }) {
  return new Promise((resolve, reject) => {
    const landscape = columns.length > 5;
    const doc = new PDFDocument({
      size: 'A4', layout: landscape ? 'landscape' : 'portrait', bufferPages: true,
      margins: { top: 28, left: 28, right: 28, bottom: 36 },
      info: { Title: title, Author: 'TRISAK Visit Management' }
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.registerFont('regular', FONT_REGULAR);
    doc.registerFont('bold', FONT_BOLD);

    const M = 28;
    const pageW = doc.page.width, pageH = doc.page.height;
    const tableW = pageW - M * 2;
    const fs = columns.length > 10 ? 7.2 : columns.length > 7 ? 8 : 9;
    const pad = 3.5;
    const wsum = columns.reduce((s, c) => s + c.w, 0);
    const widths = columns.map((c) => (c.w / wsum) * tableW);
    const bottomLimit = pageH - 36;

    // ส่วนหัวรายงาน
    doc.rect(0, 0, pageW, 46).fill('#' + NAVY);
    doc.fillColor('#ffffff').font('bold').fontSize(15).text(title, M, 10, { width: tableW - 150, lineBreak: false });
    doc.font('regular').fontSize(8.5).fillColor('#c9d6ff').text('TRISAK Visit Management', M, 29, { width: tableW, lineBreak: false });
    doc.font('regular').fontSize(8.5).fillColor('#ffffff').text(`สร้างเมื่อ ${nowBangkok()}`, M, 16, { width: tableW, align: 'right', lineBreak: false });
    let y = 56;
    doc.fillColor('#333333').font('regular').fontSize(8.5);
    meta.filter(([, v]) => v).forEach(([k, v]) => {
      const text = `${k}: ${v}`;
      const h = doc.heightOfString(text, { width: tableW });
      doc.text(text, M, y, { width: tableW });
      y += h + 1;
    });
    y += 5;

    const drawHeader = () => {
      doc.font('bold').fontSize(fs);
      const hh = Math.max(...columns.map((c, i) => doc.heightOfString(c.label, { width: widths[i] - pad * 2 }))) + pad * 2;
      doc.rect(M, y, tableW, hh).fill('#' + NAVY);
      let x = M;
      doc.fillColor('#ffffff');
      columns.forEach((c, i) => {
        doc.text(c.label, x + pad, y + pad, { width: widths[i] - pad * 2, align: c.type === 'number' ? 'right' : 'left' });
        x += widths[i];
      });
      y += hh;
    };
    drawHeader();

    rows.forEach((r, idx) => {
      doc.font('regular').fontSize(fs);
      const texts = columns.map((c) => cellText(c, r[c.key]).slice(0, 350));
      const rh = Math.max(...texts.map((t, i) => doc.heightOfString(t || ' ', { width: widths[i] - pad * 2 }))) + pad * 2;
      if (y + rh > bottomLimit) {
        doc.addPage({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margins: { top: 28, left: 28, right: 28, bottom: 36 } });
        y = 28;
        drawHeader();
      }
      if (idx % 2 === 1) doc.rect(M, y, tableW, rh).fill('#f3f6fc');
      doc.fillColor('#1f2937').font('regular').fontSize(fs);
      let x = M;
      texts.forEach((t, i) => {
        doc.text(t, x + pad, y + pad, { width: widths[i] - pad * 2, align: columns[i].type === 'number' ? 'right' : 'left' });
        x += widths[i];
      });
      doc.moveTo(M, y + rh).lineTo(M + tableW, y + rh).lineWidth(0.4).strokeColor('#dfe3ea').stroke();
      y += rh;
    });

    if (!rows.length) {
      doc.fillColor('#6b7280').font('regular').fontSize(10).text('No records found. / ไม่พบข้อมูลตามเงื่อนไขที่เลือก', M, y + 14, { width: tableW, align: 'center' });
      y += 40;
    } else if (totals && totals.length) {
      if (y + 24 > bottomLimit) { doc.addPage({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margins: { top: 28, left: 28, right: 28, bottom: 36 } }); y = 28; }
      y += 8;
      doc.font('bold').fontSize(9).fillColor('#' + NAVY).text(totals.map(([k, v]) => `${k}: ${v}`).join('   |   '), M, y, { width: tableW });
    }

    // เลขหน้า (ต้องปรับ margin ล่างเป็น 0 ชั่วคราว ไม่เช่นนั้น pdfkit จะเพิ่มหน้าใหม่เอง)
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.page.margins.bottom = 0;
      doc.font('regular').fontSize(8).fillColor('#6b7280');
      doc.text(`หน้า ${i + 1} / ${range.count}`, M, pageH - 22, { width: tableW, align: 'right', lineBreak: false });
      doc.text(`${title} · ${rows.length} รายการ`, M, pageH - 22, { width: tableW / 2, align: 'left', lineBreak: false });
    }
    doc.end();
  });
}

module.exports = { buildXlsx, buildPdf, nowBangkok, dmy, safeCell };
