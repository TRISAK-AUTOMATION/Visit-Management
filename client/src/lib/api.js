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
    err.data = data; // เก็บ body ทั้งก้อนไว้ให้ผู้เรียกใช้ข้อมูลเพิ่มเติมได้ (เช่น duplicate ตอนเพิ่มลูกค้าซ้ำ)
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
// หมายเหตุ: SQLite เก็บเวลา (CURRENT_TIMESTAMP) เป็น UTC -> แปลงเป็นเวลาไทย (Asia/Bangkok, UTC+7) ก่อนแสดง
export function fmtDateTime(s) {
  if (!s) return '-';
  const [datePart, timePart] = s.split(' ');
  const [y, m, day] = (datePart || '').split('-');
  if (!y || !m || !day) return s; // เผื่อรูปแบบไม่ตรงที่คาดไว้ แสดงค่าดิบแทนดีกว่า error
  if (!timePart) return `${day}/${m}/${y}`;
  const utc = new Date(`${datePart}T${timePart.slice(0, 8)}Z`);
  if (isNaN(utc.getTime())) return `${day}/${m}/${y} ${timePart.slice(0, 5)}`;
  const t = new Date(utc.getTime() + 7 * 3600 * 1000); // +7 ชม. (ไทยไม่มี DST)
  const p = (n) => String(n).padStart(2, '0');
  return `${p(t.getUTCDate())}/${p(t.getUTCMonth() + 1)}/${t.getUTCFullYear()} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

// วันที่ "วันนี้" ตามเวลาเครื่องผู้ใช้ รูปแบบ YYYY-MM-DD (toISOString ใช้ UTC ทำให้ช่วงเที่ยงคืน-7 โมงเช้าได้วันที่เมื่อวาน)
export function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

// การไป Visit ลูกค้า: อนุญาตเฉพาะพนักงานแผนก Engineer หรือระดับหัวหน้าขึ้นไป (Approver/Admin)
// พนักงานแผนกอื่นที่ไม่ใช่หัวหน้า จะไม่เห็นเมนู/เข้าหน้าสร้างคำขอ Visit และ My Requests
export function canAccessVisit(me) {
  if (!me) return false;
  if (me.role !== 'Employee') return true; // Approver/Admin = ระดับหัวหน้า เข้าได้เสมอไม่ว่าแผนกไหน
  const depts = (Array.isArray(me.departments) && me.departments.length) ? me.departments : (me.department ? [me.department] : []);
  return depts.includes('Engineer');
}
