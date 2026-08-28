// utils/mailer.js
// ตัวช่วยส่งอีเมลของระบบ TRISAK Visit Management
// อ่านค่าคอนฟิก SMTP จาก Environment Variables (ดูตัวอย่างใน .env.example)
const nodemailer = require('nodemailer');

const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
const MAIL_FROM = process.env.MAIL_FROM || 'TRISAK Visit Management <no-reply@trisak.co.th>';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) {
    // ยังไม่ตั้งค่า SMTP -> ใช้โหมดจำลอง (log ออก console) เพื่อไม่ให้แอปพลิเคชันล้ม
    return null;
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true', // true สำหรับ port 465, false สำหรับ port อื่น (STARTTLS)
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    } : undefined
  });
  return transporter;
}

// ส่งอีเมล 1 ฉบับ ไม่โยน error ออกไปนอกฟังก์ชัน (กันไม่ให้ล้มทั้ง request เพราะอีเมลส่งไม่สำเร็จ)
async function sendMail({ to, subject, html }) {
  if (!to) return { skipped: true, reason: 'no-recipient' };
  const t = getTransporter();
  if (!t) {
    console.log(`\n[MAIL:DEV] (ยังไม่ตั้งค่า SMTP - แสดงตัวอย่างอีเมลแทน)\nถึง: ${to}\nเรื่อง: ${subject}\n${html}\n`);
    return { skipped: true, reason: 'smtp-not-configured' };
  }
  try {
    await t.sendMail({ from: MAIL_FROM, to, subject, html });
    return { ok: true };
  } catch (err) {
    console.error('[MAIL:ERROR] ส่งอีเมลไม่สำเร็จ:', err.message);
    return { ok: false, error: err.message };
  }
}

// ---------- ชิ้นส่วน UI ของอีเมล (ใช้ <table> ล้วนเพื่อให้แสดงผลถูกต้องใน Outlook) ----------

// แถบหัวสีน้ำเงินพร้อมโลโก้ TRISAK + ป้ายสถานะมุมขวา
// หมายเหตุ: ใช้สีพื้นทึบ (ไม่ไล่สี) และใส่สีผ่าน attribute bgcolor ของ HTML โดยตรง
// เพราะ Outlook (เดสก์ท็อป) ใช้เอนจิน Word เรนเดอร์อีเมล ไม่รองรับ CSS background:linear-gradient()
// และไม่รองรับ background สีโปร่งใส (rgba) ด้วย ถ้าใช้แล้วพื้นจะกลายเป็นสีขาวจนตัวอักษรสีขาวอ่านไม่ออก
function emailHeader(badgeLabel) {
  return `
  <tr>
    <td bgcolor="#2f5bff" style="background-color:#2f5bff;padding:28px 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:middle;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td bgcolor="#ffffff" style="background-color:#ffffff;width:36px;height:36px;text-align:center;vertical-align:middle;font-weight:700;color:#2f5bff;font-size:18px;font-family:Arial,sans-serif;">T</td>
                <td style="padding-left:10px;color:#ffffff;font-size:15px;font-weight:700;letter-spacing:0.3px;font-family:Arial,sans-serif;">TRISAK<br/><span style="font-size:10px;font-weight:400;color:#dbe4ff;letter-spacing:1px;">VISIT MANAGEMENT</span></td>
              </tr>
            </table>
          </td>
          <td style="text-align:right;vertical-align:middle;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table;">
              <tr>
                <td bgcolor="#1e3fd6" style="background-color:#1e3fd6;color:#ffffff;font-size:12px;font-weight:600;padding:6px 12px;font-family:Arial,sans-serif;">${badgeLabel}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

// แถวข้อมูลในการ์ดรายละเอียด (label เล็กสีเทา + value)
function detailRow(label, value, isLast) {
  return `
  <tr>
    <td style="padding:14px 18px;${isLast ? '' : 'border-bottom:1px solid #e8ecf3;'}">
      <div style="color:#9aa4b2;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;font-family:Arial,sans-serif;">${label}</div>
      <div style="color:#111827;font-size:14px;margin-top:2px;font-family:Arial,sans-serif;">${value}</div>
    </td>
  </tr>`;
}

// การ์ดพื้นเทาอ่อนที่รวมแถวข้อมูลไว้ด้วยกัน
function detailCard(rowsHtml) {
  return `
  <tr>
    <td style="padding:16px 32px 8px 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f9fc;border-radius:10px;border:1px solid #e8ecf3;">
        ${rowsHtml}
      </table>
    </td>
  </tr>`;
}

// ปุ่ม CTA แบบเต็มความกว้างของคอลัมน์ (ใช้เดี่ยวหรือคู่ก็ได้)
// ใช้ bgcolor attribute บน <td> แทนการพึ่ง CSS background บน <a> อย่างเดียว
// เพราะ Outlook บางเวอร์ชันไม่ render สีพื้นหลังของ <a> ที่มาจาก CSS-only ทำให้ปุ่มโปร่งใส/มองไม่เห็นสี
function ctaButton(href, label, color) {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" bgcolor="${color}" style="background-color:${color};padding:13px 0;">
        <a href="${href}" style="display:block;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;font-family:Arial,sans-serif;mso-line-height-rule:exactly;">${label}</a>
      </td>
    </tr>
  </table>`;
}

// footer มาตรฐานท้ายอีเมลทุกฉบับ
function emailFooter(noteText) {
  return `
  <tr>
    <td style="padding:24px 32px 28px 32px;">
      <hr style="border:none;border-top:1px solid #eef1f6;margin:0 0 14px 0;"/>
      <div style="color:#9aa4b2;font-size:11.5px;line-height:1.6;font-family:Arial,sans-serif;">
        ${noteText}<br/>
        อีเมลนี้ส่งโดยระบบอัตโนมัติ TRISAK Visit Management
      </div>
    </td>
  </tr>`;
}

// โครงหลักของอีเมล (การ์ดขาวมุมโค้ง กลางพื้นหลังเทาอ่อน)
function emailShell(innerRowsHtml) {
  return `
  <body style="margin:0;padding:24px;background:#eef1f6;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(17,24,39,0.06);">
      ${innerRowsHtml}
    </table>
  </body>`;
}

// อีเมลแจ้งผู้อนุมัติ: มีคำขอออกนอกสถานที่ใหม่รออนุมัติ พร้อมปุ่มอนุมัติ/ไม่อนุมัติผ่านอีเมลได้ทันที
async function sendNewRequestEmail({ to, approverName, requesterName, vr, approveToken, rejectToken }) {
  const detailUrl = `${APP_BASE_URL}/approve-requests?id=${vr.id}`;
  const approveUrl = `${APP_BASE_URL}/api/visit-requests/email-action/${approveToken}`;
  const rejectUrl = `${APP_BASE_URL}/api/visit-requests/email-action/${rejectToken}`;

  const rows = [
    detailRow('ลูกค้า', vr.customer_name || '-'),
    detailRow('วันที่', vr.visit_date) + detailRow('เวลา', `${vr.time_from} - ${vr.time_to}`),
    detailRow('วัตถุประสงค์', vr.purpose, true)
  ].join('');

  const html = emailShell(`
    ${emailHeader('รออนุมัติ')}
    <tr>
      <td style="padding:28px 32px 8px 32px;">
        <div style="color:#111827;font-size:19px;font-weight:700;font-family:Arial,sans-serif;">คำขอออกนอกสถานที่รออนุมัติ</div>
        <div style="color:#6b7280;font-size:13px;margin-top:4px;font-family:Arial,sans-serif;">#${vr.code}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 32px 4px 32px;color:#374151;font-size:14px;line-height:1.6;font-family:Arial,sans-serif;">
        เรียนคุณ ${approverName},<br/>
        <b>${requesterName}</b> ได้ส่งคำขอออกนอกสถานที่นี้เพื่อรอการอนุมัติจากท่าน
      </td>
    </tr>
    ${detailCard(rows)}
    <tr>
      <td style="padding:22px 32px 6px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td width="50%" style="padding-right:6px;">${ctaButton(approveUrl, '✓ อนุมัติ', '#16a34a')}</td>
            <td width="50%" style="padding-left:6px;">${ctaButton(rejectUrl, '✕ ไม่อนุมัติ', '#dc2626')}</td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 32px 4px 32px;text-align:center;">
        <a href="${detailUrl}" style="color:#2f5bff;font-size:13px;text-decoration:none;font-weight:600;font-family:Arial,sans-serif;">ดูรายละเอียด / อนุมัติผ่านเว็บแอปพลิเคชัน &rarr;</a>
      </td>
    </tr>
    ${emailFooter('ลิงก์อนุมัติในอีเมลนี้ใช้ได้ครั้งเดียวและหมดอายุใน 7 วัน')}
  `);

  return sendMail({ to, subject: `[รออนุมัติ] คำขอออกนอกสถานที่ #${vr.code} จาก ${requesterName}`, html });
}

// อีเมลแจ้งผู้ขอ: ผลการอนุมัติ/ไม่อนุมัติ
async function sendDecisionEmail({ to, requesterName, vr, status, approverName, note, viaChannel }) {
  const approved = status === 'approved';
  const detailUrl = `${APP_BASE_URL}/my-requests?id=${vr.id}`;
  const color = approved ? '#16a34a' : '#dc2626';
  const badge = approved ? 'อนุมัติแล้ว' : 'ไม่อนุมัติ';

  const rows = [
    detailRow('วันที่', vr.visit_date) + detailRow('เวลา', `${vr.time_from} - ${vr.time_to}`),
    detailRow('ผู้อนุมัติ', approverName) + detailRow('ช่องทาง', viaChannel === 'email' ? 'อีเมล' : 'เว็บแอปพลิเคชัน', !note),
    note ? detailRow('หมายเหตุ', note, true) : ''
  ].join('');

  const html = emailShell(`
    ${emailHeader(badge)}
    <tr>
      <td style="padding:28px 32px 8px 32px;">
        <div style="color:${color};font-size:19px;font-weight:700;font-family:Arial,sans-serif;">คำขอออกนอกสถานที่${approved ? 'ได้รับการอนุมัติ' : 'ไม่ได้รับการอนุมัติ'}</div>
        <div style="color:#6b7280;font-size:13px;margin-top:4px;font-family:Arial,sans-serif;">#${vr.code}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 32px 4px 32px;color:#374151;font-size:14px;line-height:1.6;font-family:Arial,sans-serif;">
        เรียนคุณ ${requesterName},<br/>
        คำขอออกนอกสถานที่ของท่าน${approved ? 'ได้รับการอนุมัติ' : 'ไม่ได้รับการอนุมัติ'}เรียบร้อยแล้ว
      </td>
    </tr>
    ${detailCard(rows)}
    <tr>
      <td style="padding:22px 32px 6px 32px;">${ctaButton(detailUrl, 'ดูรายละเอียดคำขอของฉัน &rarr;', '#2f5bff')}</td>
    </tr>
    ${emailFooter('ท่านสามารถดูประวัติคำขอทั้งหมดได้ในเมนู My Requests')}
  `);

  return sendMail({ to, subject: `[${badge}] คำขอออกนอกสถานที่ #${vr.code}`, html });
}

// อีเมลแจ้งผู้ขอ: ผู้อนุมัติส่งคำขอกลับมาให้แก้ไข (revision)
async function sendRevisionEmail({ to, requesterName, vr, approverName, note }) {
  const editUrl = `${APP_BASE_URL}/visit-request?id=${vr.id}`;
  const color = '#c9861a';

  const rows = [
    detailRow('วันที่', vr.visit_date) + detailRow('เวลา', `${vr.time_from} - ${vr.time_to}`),
    detailRow('ส่งกลับโดย', approverName, !note),
    note ? detailRow('หมายเหตุจากผู้อนุมัติ', note, true) : ''
  ].join('');

  const html = emailShell(`
    ${emailHeader('ส่งกลับแก้ไข')}
    <tr>
      <td style="padding:28px 32px 8px 32px;">
        <div style="color:${color};font-size:19px;font-weight:700;font-family:Arial,sans-serif;">คำขอออกนอกสถานที่ถูกส่งกลับให้แก้ไข</div>
        <div style="color:#6b7280;font-size:13px;margin-top:4px;font-family:Arial,sans-serif;">#${vr.code}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 32px 4px 32px;color:#374151;font-size:14px;line-height:1.6;font-family:Arial,sans-serif;">
        เรียนคุณ ${requesterName},<br/>
        คำขอออกนอกสถานที่ของท่านถูกส่งกลับให้แก้ไขโดย <b>${approverName}</b>
      </td>
    </tr>
    ${detailCard(rows)}
    <tr>
      <td style="padding:22px 32px 6px 32px;">${ctaButton(editUrl, 'แก้ไขคำขอ &rarr;', '#2f5bff')}</td>
    </tr>
    ${emailFooter('หลังแก้ไขแล้วกรุณาส่งคำขออีกครั้งเพื่อรอการอนุมัติ')}
  `);

  return sendMail({ to, subject: `[ส่งกลับแก้ไข] คำขอออกนอกสถานที่ #${vr.code}`, html });
}

module.exports = { sendMail, sendNewRequestEmail, sendDecisionEmail, sendRevisionEmail, APP_BASE_URL };