// client/src/lib/api.js - ตัวช่วยเรียก API กลาง (เทียบเท่า public/js/api.js เดิม)
async function _fetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'เกิดข้อผิดพลาด');
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get(url) { return _fetch(url); },
  post(url, body) { return _fetch(url, { method: 'POST', body: JSON.stringify(body || {}) }); },
  put(url, body) { return _fetch(url, { method: 'PUT', body: JSON.stringify(body || {}) }); },
  patch(url, body) { return _fetch(url, { method: 'PATCH', body: JSON.stringify(body || {}) }); },
  del(url) { return _fetch(url, { method: 'DELETE' }); }
};

export function fmtDate(d) {
  if (!d) return '-';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

// แปลง datetime แบบ SQLite ("YYYY-MM-DD HH:MM:SS") ให้เป็นรูปแบบไทย วัน/เดือน/ปี เวลา (เช่น 03/09/2026 09:31)
export function fmtDateTime(s) {
  if (!s) return '-';
  const [datePart, timePart] = s.split(' ');
  const [y, m, day] = (datePart || '').split('-');
  if (!y || !m || !day) return s; // เผื่อรูปแบบไม่ตรงที่คาดไว้ แสดงค่าดิบแทนดีกว่า error
  const hm = (timePart || '').slice(0, 5);
  return hm ? `${day}/${m}/${y} ${hm}` : `${day}/${m}/${y}`;
}

export function statusLabel(status) {
  return {
    pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิกแล้ว',
    draft: 'ฉบับร่าง', revision: 'รอแก้ไข'
  }[status] || status;
}

export function channelLabel(channel) {
  return { web: 'เว็บแอปพลิเคชัน', email: 'อีเมล' }[channel] || channel || '-';
}

export function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

export const ROLE_TH = { Employee: 'พนักงาน', Approver: 'ผู้อนุมัติ', Admin: 'ผู้ดูแลระบบ' };
