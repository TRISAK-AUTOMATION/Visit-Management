// utils/backup.js - สำรองฐานข้อมูล SQLite อัตโนมัติ (ใช้ API backup ของ better-sqlite3 ปลอดภัยแม้ระบบกำลังใช้งานอยู่)
// เก็บไฟล์ที่ db/backups/trisak-YYYYMMDD-HHMM.db และลบไฟล์เก่าเกิน KEEP ชุด
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'db', 'backups');
const KEEP = Math.max(1, parseInt(process.env.BACKUP_KEEP, 10) || 14);   // เก็บกี่ชุดล่าสุด (ค่าเริ่มต้น 14 วัน)
const PREFIX = 'trisak-';

const pad = (n) => String(n).padStart(2, '0');
function stamp(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// เลือกไฟล์ที่ต้องลบ (เก่าสุดก่อน) - แยกเป็นฟังก์ชันล้วนเพื่อทดสอบได้
function pickToDelete(names, keep = KEEP) {
  const list = names.filter((n) => n.startsWith(PREFIX) && n.endsWith('.db')).sort();
  return list.slice(0, Math.max(0, list.length - keep));
}

async function runBackup(db) {
  fs.mkdirSync(DIR, { recursive: true });
  const file = path.join(DIR, `${PREFIX}${stamp()}.db`);
  await db.backup(file);
  pickToDelete(fs.readdirSync(DIR)).forEach((n) => { try { fs.unlinkSync(path.join(DIR, n)); } catch (e) { /* ข้าม */ } });
  return file;
}

// เรียกตอนสตาร์ท server: สำรองหลังเปิด 1 นาที แล้วซ้ำทุก 24 ชม.
function startBackupSchedule(db) {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const once = () => runBackup(db).then((f) => console.log('[backup] สำรองฐานข้อมูลแล้ว:', f)).catch((e) => console.error('[backup] ไม่สำเร็จ:', e.message));
  setTimeout(() => { once(); setInterval(once, DAY_MS); }, 60 * 1000);
}

module.exports = { runBackup, startBackupSchedule, pickToDelete, stamp };
