// lib/loadingBus.js - นับจำนวนคำขอ API ที่กำลังรอผลอยู่ (ใช้แสดงแถบ/สัญลักษณ์ "กำลังโหลด" ทั่วทั้งเว็บ)
let count = 0;
const subs = new Set();
const emit = () => subs.forEach(fn => fn(count));
export const loadingBus = {
  start() { count += 1; emit(); },
  end() { count = Math.max(0, count - 1); emit(); },
  subscribe(fn) { subs.add(fn); fn(count); return () => subs.delete(fn); }
};
