// utils/signature.js - ลายเซ็นผู้ใช้ (เก็บในตาราง user_signatures เป็น data URL PNG/JPEG)
const db = require('../db/database');

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
function draw(doc, buf, x, colW, lineY, maxH = 40) {
  if (!buf) return false;
  try {
    const w = Math.min(colW - 40, 130);
    doc.image(buf, x + (colW - w) / 2, lineY - maxH - 1, { fit: [w, maxH], align: 'center', valign: 'bottom' });
    return true;
  } catch (e) { return false; } // ภาพเสีย -> ข้าม ไม่ให้ PDF พัง
}

module.exports = { parseDataUrl, getDataUrl, save, remove, getBuffer, draw };
