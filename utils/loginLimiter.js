// utils/loginLimiter.js - จำกัดจำนวนครั้งที่ล็อกอินผิด (กันการเดารหัสผ่าน) โดยไม่ต้องติดตั้งแพ็กเกจเพิ่ม
// เก็บในหน่วยความจำ: รีสตาร์ท server แล้วตัวนับเริ่มใหม่ (เพียงพอสำหรับกันเดารหัสผ่านทั่วไป)
//   - ต่อ "IP + ชื่อผู้ใช้": ผิดได้ไม่เกิน MAX_PER_USER ครั้งใน WINDOW_MS
//   - ต่อ "IP": ผิดได้ไม่เกิน MAX_PER_IP ครั้งใน WINDOW_MS (กันการไล่เดาหลายชื่อผู้ใช้จากเครื่องเดียว)
// ล็อกอินสำเร็จจะล้างตัวนับของคู่ IP+ชื่อผู้ใช้นั้น

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_USER = 8;
const MAX_PER_IP = 40;

const buckets = new Map(); // key -> { count, resetAt }

function keyUser(ip, username) { return `u|${ip}|${String(username || '').toLowerCase().slice(0, 100)}`; }
function keyIp(ip) { return `i|${ip}`; }

function getBucket(key, now) {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) return null;
  return b;
}

// คืนจำนวนวินาทีที่ต้องรอ ถ้าถูกบล็อกอยู่ / คืน 0 ถ้าล็อกอินได้
function checkBlocked(ip, username, now = Date.now()) {
  const bu = getBucket(keyUser(ip, username), now);
  const bi = getBucket(keyIp(ip), now);
  let wait = 0;
  if (bu && bu.count >= MAX_PER_USER) wait = Math.max(wait, bu.resetAt - now);
  if (bi && bi.count >= MAX_PER_IP) wait = Math.max(wait, bi.resetAt - now);
  return wait > 0 ? Math.ceil(wait / 1000) : 0;
}

function bump(key, now) {
  const b = getBucket(key, now);
  if (b) { b.count += 1; return; }
  buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
}

function recordFailure(ip, username, now = Date.now()) {
  bump(keyUser(ip, username), now);
  bump(keyIp(ip), now);
}

function recordSuccess(ip, username) {
  buckets.delete(keyUser(ip, username));
}

// ล้างตัวนับที่หมดอายุเป็นระยะ ไม่ให้ Map โตไม่จำกัด
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}, 10 * 60 * 1000).unref();

module.exports = { checkBlocked, recordFailure, recordSuccess, WINDOW_MS, MAX_PER_USER, MAX_PER_IP };
