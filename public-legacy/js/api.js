// public/js/api.js - ตัวช่วยเรียก API กลาง
const api = {
  async _fetch(url, options = {}) {
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
  },
  get(url) { return this._fetch(url); },
  post(url, body) { return this._fetch(url, { method: 'POST', body: JSON.stringify(body || {}) }); },
  put(url, body) { return this._fetch(url, { method: 'PUT', body: JSON.stringify(body || {}) }); },
  del(url) { return this._fetch(url, { method: 'DELETE' }); }
};

function toast(message, type = 'default') {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.className = `toast show ${type}`;
  el.textContent = message;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3000);
}

function fmtDate(d) {
  if (!d) return '-';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function statusLabel(status) {
  return { pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิกแล้ว' }[status] || status;
}

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}
