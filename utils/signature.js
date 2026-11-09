// utils/signature.js - ลายเซ็นผู้ใช้ (เก็บในตาราง user_signatures เป็น data URL PNG/JPEG)
const path = require('path');
const db = require('../db/database');

// ฟอนต์ลายมือ (Charm, SIL OFL - ดู fonts/OFL-Charm.txt) ใช้เขียนชื่อแทนลายเซ็นเมื่อผู้ใช้ยังไม่ได้ตั้งลายเซ็น
const SCRIPT_FONT = path.join(__dirname, '..', 'fonts', 'Charm-Regular.ttf');

const MAX_BYTES = 400 * 1024;

// ตรวจ data URL + magic bytes จริงของไฟล์ (กันส่งไฟล์อื่นมาปลอมเป็นภาพ) -> { buffer, mime } หรือ { error }
function parseDataUrl(dataUrl) {
  const m = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return { error: 'ไฟล์ลายเซ็นต้องเป็นภาพ PNG หรือ JPEG' };
  const buffer = Buffer.from(m[2], 'base64');
  if (!buffer.length || buffer.length > MAX_BYTES) return { error: 'ไฟล์ลายเซ็นใหญ่เกินไป (สูงสุด 400 KB)' };
  const isPng = buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if ((m[1] === 'image/png' && !isPng) || (m[1] === 'image/jpeg' && !isJpg)) return { error: 'ไฟล์ลายเซ็นไม่ใช่ภาพที่ถูกต้อง' };
  return { buffer, mime: m[1] };
}

function getDataUrl(userId) {
  const r = db.prepare('SELECT data_url FROM user_signatures WHERE user_id = ?').get(userId);
  return r ? r.data_url : null;
}

function save(userId, dataUrl) {
  const p = parseDataUrl(dataUrl);
  if (p.error) return p;
  db.prepare(`INSERT INTO user_signatures (user_id, data_url, updated_at) VALUES (?, ?, datetime('now'))
              ON CONFLICT(user_id) DO UPDATE SET data_url = excluded.data_url, updated_at = datetime('now')`).run(userId, dataUrl);
  return { ok: true };
}

function remove(userId) { db.prepare('DELETE FROM user_signatures WHERE user_id = ?').run(userId); }

// Buffer สำหรับ pdfkit (null ถ้าผู้ใช้ยังไม่อัปโหลด/ไฟล์เสีย)
function getBuffer(userId) {
  if (!userId) return null;
  const p = parseDataUrl(getDataUrl(userId));
  return p.error ? null : p.buffer;
}

// วางภาพลายเซ็นให้ "ก้นภาพ" นั่งอยู่เหนือเส้นประ (lineY) กึ่งกลางช่องกว้าง colW ที่เริ่มที่ x
// ไม่มีภาพ (ยังไม่ได้ตั้งลายเซ็น) แต่ส่ง stamp = { name, at, label } มา -> เขียนชื่อด้วยฟอนต์ลายมือ + "อนุมัติผ่านระบบ วันเวลา" แทน
// (ช่องลงนามของคนที่ลงนามผ่านระบบแล้วจะไม่ว่าง) — ผู้เรียกต้องตั้ง font ใหม่เองหลังเรียก (ฟังก์ชันนี้เปลี่ยน font ปัจจุบัน)
function draw(doc, buf, x, colW, lineY, maxH = 40, stamp = null) {
  if (buf) {
    try {
      const w = Math.min(colW - 40, 130);
      doc.image(buf, x + (colW - w) / 2, lineY - maxH - 1, { fit: [w, maxH], align: 'center', valign: 'bottom' });
      return true;
    } catch (e) { /* ภาพเสีย -> ใช้ชื่อแทนด้านล่าง ไม่ให้ PDF พัง */ }
  }
  if (!stamp || !stamp.name) return false;
  try {
    if (!doc._registeredFonts || !doc._registeredFonts.sigscript) doc.registerFont('sigscript', SCRIPT_FONT);
    const small = maxH < 30 ? 5.5 : 6.5;
    const size = Math.max(10, Math.min(19, maxH * 0.5));
    const note = stamp.at ? `${stamp.label || 'ลงนามผ่านระบบ'} ${stamp.at}` : '';
    const noteTop = lineY - small * 1.95;
    // Charm มีช่องเหนือตัวอักษรสูง: วางให้ฐานตัวอักษรอยู่เหนือบรรทัดวันเวลา
    const nameTop = (note ? noteTop : lineY - 1) - size * 1.2;
    doc.font('sigscript').fontSize(size).fillColor('#1b2a6b')
      .text(stamp.name, x + 6, nameTop, { width: colW - 12, align: 'center', lineBreak: false, ellipsis: true });
    if (note) {
      doc.font(doc._registeredFonts.regular ? 'regular' : 'sigscript').fontSize(small).fillColor('#6b7280')
        .text(note, x + 2, noteTop, { width: colW - 4, align: 'center', lineBreak: false, ellipsis: true });
    }
    doc.fillColor('#111111');
    return true;
  } catch (e) { return false; }
}

module.exports = { parseDataUrl, getDataUrl, save, remove, getBuffer, draw };
