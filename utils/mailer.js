// utils/mailer.js
// ตัวช่วยส่งอีเมลของระบบ TRISAK Visit Management
// อ่านค่าคอนฟิก SMTP จาก Environment Variables (ดูตัวอย่างใน .env.example)
const nodemailer = require('nodemailer');
const { toThaiDate } = require('./dateFormat');

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


// ---------- ชิ้นส่วน UI ของอีเมล (ดีไซน์ใหม่) ----------
// ใช้ <table> ล้วน + ใส่สีผ่าน attribute bgcolor ของ HTML โดยตรงเสมอ (ไม่ใช่แค่ CSS background)
// เพราะ Outlook เดสก์ท็อปใช้เอนจิน Word เรนเดอร์อีเมล ซึ่ง "ไม่อ่าน" CSS background/background-color
// บน <table>/<td> เชื่อถือได้ - ต้องพึ่ง attribute bgcolor เท่านั้นถึงจะขึ้นสีแน่นอนทุกโปรแกรมอีเมล
// (นี่คือสาเหตุที่การ์ดพื้นเทาของดีไซน์เดิมไม่ขึ้นสีใน Outlook - ใช้แค่ CSS background เพียงอย่างเดียว)
// ก็ยังคงเลี่ยง gradient / rgba / box-shadow / border-radius (ที่พึ่งได้แค่เป็น bonus บนโปรแกรมอื่น)

const FONT = "Arial,Helvetica,sans-serif";

// แถบแบรนด์บนสุด - พื้นเข้ม เรียบหรู ไม่ใช่สีเดียวกับสถานะ (แยกความรู้สึก "หัวเว็บ" ออกจาก "เนื้อหาสถานะ")
function brandBar() {
  return `
  <tr>
    <td bgcolor="#111827" style="background-color:#111827;padding:16px 32px;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td bgcolor="#2f5bff" style="background-color:#2f5bff;width:30px;height:30px;text-align:center;vertical-align:middle;font-weight:700;color:#ffffff;font-size:14px;font-family:${FONT};border-radius:7px;">T</td>
          <td style="padding-left:10px;vertical-align:middle;color:#f3f4f6;font-size:13px;font-weight:700;letter-spacing:0.4px;font-family:${FONT};">TRISAK <span style="color:#8b93a3;font-weight:400;">Visit Management</span></td>
        </tr>
      </table>
    </td>
  </tr>`;
}

// ส่วนหัวใจความสำคัญ (hero) - พื้นสีตามสถานะเต็มความกว้าง + วงกลมไอคอนขาว + หัวข้อ + เลขที่เอกสาร
// accentColor: สีหลักของอีเมลฉบับนี้ (ฟ้า=รออนุมัติ, เขียว=อนุมัติ, แดง=ไม่อนุมัติ, ส้ม=ส่งกลับแก้ไข)
// icon: อักขระเดี่ยวสั้นๆ ที่สื่อความหมาย (!, ✓, ✕, ✎) แทนอิโมจิ เพื่อให้สีตรงกับ accentColor แน่นอนทุกเมล์ไคลเอนต์
function hero({ accentColor, icon, title, codeText }) {
  return `
  <tr>
    <td bgcolor="${accentColor}" style="background-color:${accentColor};padding:32px 32px 28px 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="52" style="vertical-align:top;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td bgcolor="#ffffff" style="background-color:#ffffff;width:42px;height:42px;text-align:center;vertical-align:middle;font-size:19px;font-weight:700;color:${accentColor};font-family:${FONT};border-radius:21px;">${icon}</td>
              </tr>
            </table>
          </td>
          <td style="vertical-align:middle;padding-left:14px;">
            <div style="color:#ffffff;font-size:19px;font-weight:700;font-family:${FONT};line-height:1.35;">${title}</div>
            ${codeText ? `<div style="color:#ffffff;font-size:12.5px;font-weight:400;font-family:${FONT};margin-top:3px;opacity:0.85;">${codeText}</div>` : ''}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

// ข้อความนำเรื่อง (สวัสดีคุณ..., ใจความสั้นๆ)
function introText(html) {
  return `
  <tr>
    <td style="padding:24px 32px 4px 32px;color:#374151;font-size:14px;line-height:1.7;font-family:${FONT};">
      ${html}
    </td>
  </tr>`;
}

// แถวข้อมูลในการ์ด: label ซ้าย (ตัวพิมพ์ใหญ่ เทา) + value ขวา สลับสีพื้นเป็นลายม้าลาย
// ใช้ bgcolor attribute ตรงๆ บนทุก td เพื่อให้ Outlook ขึ้นสีจริง ไม่ใช่แค่ CSS
function detailRow(label, value, bg, isLast) {
  const border = isLast ? '' : 'border-bottom:1px solid #eef1f6;';
  return `
  <tr>
    <td bgcolor="${bg}" style="background-color:${bg};padding:12px 16px;width:38%;${border}vertical-align:top;">
      <span style="color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;font-family:${FONT};">${label}</span>
    </td>
    <td bgcolor="${bg}" style="background-color:${bg};padding:12px 16px;${border}vertical-align:top;">
      <span style="color:#111827;font-size:13.5px;font-family:${FONT};">${value}</span>
    </td>
  </tr>`;
}

// การ์ดรวมแถวข้อมูล มีเส้นขอบรอบชัดเจน (border ใช้ได้ปกติใน Outlook ต่างจาก border-radius/shadow)
// items: array ของ { label, value } ค่าว่าง/undefined จะถูกข้ามไป
function detailCard(items) {
  const visible = (items || []).filter(it => it && it.value !== undefined && it.value !== null && it.value !== '');
  const rowsHtml = visible.map((it, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : '#f8f9fb';
    return detailRow(it.label, it.value, bg, i === visible.length - 1);
  }).join('');
  return `
  <tr>
    <td style="padding:22px 32px 8px 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e9f2;border-radius:10px;">
        ${rowsHtml}
      </table>
    </td>
  </tr>`;
}

// ปุ่มพื้นทึบ (CTA หลัก) - เต็มความกว้างคอลัมน์ ใช้ bgcolor attribute เพื่อให้ Outlook ขึ้นสีปุ่มแน่นอน
function ctaButton(href, label, color) {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" bgcolor="${color}" style="background-color:${color};padding:14px 0;border-radius:8px;">
        <a href="${href}" style="display:block;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.2px;font-family:${FONT};mso-line-height-rule:exactly;">${label}</a>
      </td>
    </tr>
  </table>`;
}

// ปุ่มขอบ (secondary) - พื้นขาว ขอบสี ตัวหนังสือสี ใช้แทนลิงก์เปล่าเดิมเพื่อให้ดูเป็นปุ่มจริงมากขึ้น
function ctaOutlineButton(href, label, color) {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" bgcolor="#ffffff" style="background-color:#ffffff;border:1.5px solid ${color};padding:12px 0;border-radius:8px;">
        <a href="${href}" style="display:block;color:${color};text-decoration:none;font-weight:700;font-size:13.5px;font-family:${FONT};mso-line-height-rule:exactly;">${label}</a>
      </td>
    </tr>
  </table>`;
}

// footer มาตรฐานท้ายอีเมลทุกฉบับ
function emailFooter(noteText) {
  return `
  <tr>
    <td style="padding:26px 32px 30px 32px;">
      <hr style="border:none;border-top:1px solid #eef1f6;margin:0 0 16px 0;"/>
      <div style="color:#9aa4b2;font-size:11.5px;line-height:1.7;font-family:${FONT};">
        ${noteText}<br/>
        อีเมลนี้ส่งโดยระบบอัตโนมัติ TRISAK Visit Management — กรุณาอย่าตอบกลับอีเมลฉบับนี้
      </div>
    </td>
  </tr>`;
}

// โครงหลักของอีเมล (การ์ดขาวมุมโค้ง กลางพื้นหลังเทาอ่อน)
function emailShell(innerRowsHtml) {
  return `
  <body style="margin:0;padding:24px;background-color:#eef1f6;font-family:${FONT};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(17,24,39,0.06);">
      ${innerRowsHtml}
    </table>
  </body>`;
}

// อีเมลแจ้งผู้อนุมัติ: มีคำขอออกนอกสถานที่ใหม่รออนุมัติ พร้อมปุ่มอนุมัติ/ไม่อนุมัติผ่านอีเมลได้ทันที
// emailRows: array ของ { label, value } ที่ประกอบมาแล้วจากภายนอก (ฟิลด์พื้นฐาน + Field เดิม + Field ที่สร้างเอง ตามที่ Admin ติ๊กว่า "แสดงใน Email")
// showDocCode: true/false - จะแสดงเลขที่เอกสาร #VR-code ทั้งใน subject และเนื้อหาหรือไม่ (มาจากค่าตั้งค่าที่ Admin ปรับได้)
async function sendNewRequestEmail({ to, approverName, requesterName, vr, approveToken, rejectToken, emailRows, showDocCode }) {
  const detailUrl = `${APP_BASE_URL}/approve-requests?id=${vr.id}`;
  const approveUrl = `${APP_BASE_URL}/api/visit-requests/email-action/${approveToken}`;
  const rejectUrl = `${APP_BASE_URL}/api/visit-requests/email-action/${rejectToken}`;
  const codeSuffix = showDocCode ? ` #${vr.code}` : '';
  const accentColor = '#2f5bff';

  const html = emailShell(`
    ${brandBar()}
    ${hero({ accentColor, icon: '!', title: 'คำขอออกนอกสถานที่รออนุมัติ', codeText: showDocCode ? `#${vr.code}` : '' })}
    ${introText(`เรียนคุณ ${approverName},<br/><b>${requesterName}</b> ได้ส่งคำขอออกนอกสถานที่นี้เพื่อรอการอนุมัติจากท่าน`)}
    ${detailCard(emailRows)}
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
      <td style="padding:12px 32px 4px 32px;">${ctaOutlineButton(detailUrl, 'ดูรายละเอียด / อนุมัติผ่านเว็บแอปพลิเคชัน', accentColor)}</td>
    </tr>
    ${emailFooter('ลิงก์อนุมัติในอีเมลนี้ใช้ได้ครั้งเดียวและหมดอายุใน 7 วัน')}
  `);

  return sendMail({ to, subject: `[รออนุมัติ] คำขอออกนอกสถานที่${codeSuffix} จาก ${requesterName}`, html });
}

// อีเมลแจ้งผู้ขอ: ผลการอนุมัติ/ไม่อนุมัติ
async function sendDecisionEmail({ to, requesterName, vr, status, approverName, note, viaChannel, showDocCode }) {
  const approved = status === 'approved';
  const detailUrl = `${APP_BASE_URL}/my-requests?id=${vr.id}`;
  const accentColor = approved ? '#16a34a' : '#dc2626';
  const showCode = showDocCode !== false; // undefined = true เพื่อคงพฤติกรรมเดิมถ้าผู้เรียกไม่ได้ส่งค่ามา
  const codeSuffix = showCode ? ` #${vr.code}` : '';
  const badge = approved ? 'อนุมัติแล้ว' : 'ไม่อนุมัติ';

  const rows = [
    { label: 'วันที่', value: toThaiDate(vr.visit_date) },
    { label: 'เวลา', value: `${vr.time_from} - ${vr.time_to}` },
    { label: 'ผู้อนุมัติ', value: approverName },
    { label: 'ช่องทาง', value: viaChannel === 'email' ? 'อีเมล' : 'เว็บแอปพลิเคชัน' },
    { label: 'หมายเหตุ', value: note }
  ];

  const html = emailShell(`
    ${brandBar()}
    ${hero({
      accentColor,
      icon: approved ? '✓' : '✕',
      title: `คำขอออกนอกสถานที่${approved ? 'ได้รับการอนุมัติ' : 'ไม่ได้รับการอนุมัติ'}`,
      codeText: showCode ? `#${vr.code}` : ''
    })}
    ${introText(`เรียนคุณ ${requesterName},<br/>คำขอออกนอกสถานที่ของท่าน${approved ? 'ได้รับการอนุมัติ' : 'ไม่ได้รับการอนุมัติ'}เรียบร้อยแล้ว`)}
    ${detailCard(rows)}
    <tr>
      <td style="padding:22px 32px 6px 32px;">${ctaButton(detailUrl, 'ดูรายละเอียดคำขอของฉัน &rarr;', '#2f5bff')}</td>
    </tr>
    ${emailFooter('ท่านสามารถดูประวัติคำขอทั้งหมดได้ในเมนู My Requests')}
  `);

  return sendMail({ to, subject: `[${badge}] คำขอออกนอกสถานที่${codeSuffix}`, html });
}

// อีเมลแจ้งผู้ขอ: ผู้อนุมัติส่งคำขอกลับมาให้แก้ไข (revision)
async function sendRevisionEmail({ to, requesterName, vr, approverName, note, showDocCode }) {
  const editUrl = `${APP_BASE_URL}/visit-request?id=${vr.id}`;
  const accentColor = '#d97706';
  const showCode = showDocCode !== false; // undefined = true เพื่อคงพฤติกรรมเดิมถ้าผู้เรียกไม่ได้ส่งค่ามา
  const codeSuffix = showCode ? ` #${vr.code}` : '';

  const rows = [
    { label: 'วันที่', value: toThaiDate(vr.visit_date) },
    { label: 'เวลา', value: `${vr.time_from} - ${vr.time_to}` },
    { label: 'ส่งกลับโดย', value: approverName },
    { label: 'หมายเหตุจากผู้อนุมัติ', value: note }
  ];

  const html = emailShell(`
    ${brandBar()}
    ${hero({ accentColor, icon: '✎', title: 'คำขอออกนอกสถานที่ถูกส่งกลับให้แก้ไข', codeText: showCode ? `#${vr.code}` : '' })}
    ${introText(`เรียนคุณ ${requesterName},<br/>คำขอออกนอกสถานที่ของท่านถูกส่งกลับให้แก้ไขโดย <b>${approverName}</b>`)}
    ${detailCard(rows)}
    <tr>
      <td style="padding:22px 32px 6px 32px;">${ctaButton(editUrl, 'แก้ไขคำขอ &rarr;', '#2f5bff')}</td>
    </tr>
    ${emailFooter('หลังแก้ไขแล้วกรุณาส่งคำขออีกครั้งเพื่อรอการอนุมัติ')}
  `);

  return sendMail({ to, subject: `[ส่งกลับแก้ไข] คำขอออกนอกสถานที่${codeSuffix}`, html });
}

module.exports = { sendMail, sendNewRequestEmail, sendDecisionEmail, sendRevisionEmail, APP_BASE_URL };
