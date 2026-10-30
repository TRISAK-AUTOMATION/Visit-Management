// client/src/components/ReportParts.jsx - ส่วนประกอบที่ใช้ร่วมกันของหน้า Report (ภาพรวม + รายบุคคล)
import React from 'react';
import { todayLocal } from '../lib/api';

export const TH_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

export const PERIODS = [
  { v: 'today', label: 'วันนี้' },
  { v: 'week', label: 'สัปดาห์นี้' },
  { v: 'month', label: 'เดือนนี้' },
  { v: 'quarter', label: 'ไตรมาสนี้' },
  { v: 'year', label: 'ปีนี้' },
  { v: 'custom', label: 'กำหนดช่วงเวลาเอง' }
];

export const TYPES = [
  { v: 'all', label: 'ทั้งหมด' },
  { v: 'visit', label: 'Visit' },
  { v: 'leave', label: 'Leave' },
  { v: 'attendance', label: 'Attendance (มาสาย/ขาดงาน)' },
  { v: 'ot', label: 'OT' }
];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// แปลง preset เป็นช่วงวันที่ [from, to] (วันนี้ตามเวลาเครื่องผู้ใช้, สัปดาห์เริ่มวันจันทร์)
export function periodRange(period, customFrom, customTo) {
  const [y, m, d] = todayLocal().split('-').map(Number);
  const today = new Date(y, m - 1, d);
  if (period === 'today') return [iso(today), iso(today)];
  if (period === 'week') {
    const dow = (today.getDay() + 6) % 7; // จันทร์ = 0
    const start = new Date(y, m - 1, d - dow);
    const end = new Date(y, m - 1, d - dow + 6);
    return [iso(start), iso(end)];
  }
  if (period === 'month') return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
  if (period === 'quarter') {
    const q = Math.floor((m - 1) / 3);
    return [iso(new Date(y, q * 3, 1)), iso(new Date(y, q * 3 + 3, 0))];
  }
  if (period === 'year') return [`${y}-01-01`, `${y}-12-31`];
  return [customFrom || '', customTo || ''];
}

export function periodLabel(f) {
  const p = PERIODS.find(x => x.v === f.period);
  if (f.period !== 'custom') return p ? p.label : '';
  return `${f.from || '…'} ถึง ${f.to || '…'}`;
}

export const DEFAULT_FILTERS = { period: 'month', from: '', to: '', department: '', user_id: '', type: 'all' };

const STORE_KEY = 'trisak_report_filters';
export function loadFilters() {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (raw) return { ...DEFAULT_FILTERS, ...JSON.parse(raw) };
  } catch (e) { /* ใช้ค่าเริ่มต้น */ }
  return { ...DEFAULT_FILTERS };
}
export function saveFilters(f) {
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify(f)); } catch (e) { /* ไม่เป็นไร */ }
}

export function filtersToQuery(f, { withEmployee = true } = {}) {
  const [from, to] = periodRange(f.period, f.from, f.to);
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  if (withEmployee && f.department) qs.set('department', f.department);
  if (withEmployee && f.user_id) qs.set('user_id', f.user_id);
  return qs.toString();
}

// แสดงส่วนไหนบ้างตามประเภทรายงานที่เลือก
export function visibleSections(type) {
  const all = type === 'all';
  return { visit: all || type === 'visit', leave: all || type === 'leave', attendance: all || type === 'attendance', ot: all || type === 'ot' };
}

export const fmtNum = (n) => (Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(1));

// ---------- กราฟแท่งเรียบง่าย (SVG) ----------
export function MiniBarChart({ data, color = '#2f5bff', unit = '', height = 170 }) {
  const n = data.length;
  // ปรับขนาดแท่งตามจำนวนเดือน ให้พอดีกับความกว้างการ์ด (เดือนเยอะมาก = เลื่อนแนวนอนได้)
  const barW = n <= 6 ? 34 : n <= 12 ? 18 : 12;
  const gap = n <= 6 ? 14 : n <= 12 ? 8 : 5;
  const showValues = n <= 12;
  const padL = 8, padR = 8, padT = 20, padB = 26;
  const width = padL + padR + n * barW + Math.max(0, n - 1) * gap;
  const max = Math.max(1, ...data.map(d => d.value));
  const ch = height - padT - padB;
  const hasAny = data.some(d => d.value > 0);
  const labelEvery = n <= 12 ? 1 : 2;
  return (
    <div className="rp-chart-scroll">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: 'block', minWidth: Math.min(width, 300), maxHeight: height * 1.5 }} role="img" aria-label="กราฟรายเดือน">
        <line x1={padL} x2={width - padR} y1={padT + ch} y2={padT + ch} stroke="#e6e9f2" />
        {data.map((d, i) => {
          const h = d.value > 0 ? Math.max(3, (d.value / max) * ch) : 0;
          const x = padL + i * (barW + gap);
          return (
            <g key={d.label + i}>
              <title>{`${d.label}: ${fmtNum(d.value)}${unit ? ' ' + unit : ''}`}</title>
              {h > 0 && <rect x={x} y={padT + ch - h} width={barW} height={h} rx={Math.min(5, barW / 3)} fill={color} opacity="0.9" />}
              {showValues && d.value > 0 && <text x={x + barW / 2} y={padT + ch - h - 5} textAnchor="middle" fontSize="10" fontWeight="600" fill="#5b6479">{fmtNum(d.value)}</text>}
              {i % labelEvery === 0 && <text x={x + barW / 2} y={height - 8} textAnchor="middle" fontSize={barW < 20 ? 8.5 : 10.5} fill="#9aa2b4">{d.label}</text>}
            </g>
          );
        })}
        {!hasAny && <text x={width / 2} y={padT + ch / 2} textAnchor="middle" fontSize="12" fill="#9aa2b4">ไม่มีข้อมูลในช่วงนี้</text>}
      </svg>
    </div>
  );
}

// กราฟ 3 ชุด (Visit / Leave / OT) แยกสเกลกัน เพราะหน่วยต่างกัน (ครั้ง / วัน / ชม.)
export function ActivityOverview({ monthly, sections }) {
  const label = (m) => {
    const [y, mm] = m.split('-');
    return `${TH_MONTHS_SHORT[Number(mm) - 1]}${monthly.length > 12 ? ' ' + String(y).slice(2) : ''}`;
  };
  const panels = [
    { key: 'visit', title: 'Customer Visit', unit: 'ครั้ง', color: '#2f5bff', field: 'visits' },
    { key: 'leave', title: 'Leave', unit: 'วัน', color: '#7c8aa5', field: 'leave_days' },
    { key: 'ot', title: 'OT', unit: 'ชม.', color: '#f5a524', field: 'ot_hours' }
  ].filter(p => sections[p.key]);
  if (!panels.length) return <div className="empty">ประเภทรายงานนี้ไม่มีกราฟรายเดือน</div>;
  return (
    <div className="rp-overview" style={{ gridTemplateColumns: `repeat(${panels.length}, minmax(0, 1fr))` }}>
      {panels.map(p => (
        <div key={p.key} className="rp-overview-panel">
          <div className="rp-overview-title"><span className="rp-dot" style={{ background: p.color }} />{p.title} <span className="muted">({p.unit}/เดือน)</span></div>
          <MiniBarChart data={monthly.map(m => ({ label: label(m.month), value: m[p.field] }))} color={p.color} unit={p.unit} />
        </div>
      ))}
    </div>
  );
}

export function SummaryCard({ icon, label, value, unit, hint, tone = 'blue' }) {
  return (
    <div className="rp-card">
      <div className={`rp-icon ${tone}`}>{icon}</div>
      <div className="rp-card-body">
        <div className="rp-card-label">{label}</div>
        <div className="rp-card-value">{value}{unit && <span className="rp-card-unit">{unit}</span>}</div>
        {hint && <div className="rp-card-hint">{hint}</div>}
      </div>
    </div>
  );
}

export function FilterFields({ f, set, departments = [], employees = [], showEmployee = true }) {
  const empOptions = f.department ? employees.filter(e => e.department === f.department) : employees;
  return (
    <>
      <label className="rp-field">
        <span>ช่วงเวลา</span>
        <select value={f.period} onChange={e => set({ ...f, period: e.target.value })}>
          {PERIODS.map(p => <option key={p.v} value={p.v}>{p.label}</option>)}
        </select>
      </label>
      {f.period === 'custom' && (
        <>
          <label className="rp-field"><span>ตั้งแต่</span><input type="date" value={f.from} onChange={e => set({ ...f, from: e.target.value })} /></label>
          <label className="rp-field"><span>ถึง</span><input type="date" value={f.to} onChange={e => set({ ...f, to: e.target.value })} /></label>
        </>
      )}
      {showEmployee && (
        <>
          <label className="rp-field">
            <span>Department</span>
            <select value={f.department} onChange={e => set({ ...f, department: e.target.value, user_id: '' })}>
              <option value="">ทั้งหมด</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="rp-field">
            <span>Employee</span>
            <select value={f.user_id} onChange={e => set({ ...f, user_id: e.target.value })}>
              <option value="">ทั้งหมด</option>
              {empOptions.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </label>
        </>
      )}
      <label className="rp-field">
        <span>ประเภทข้อมูล</span>
        <select value={f.type} onChange={e => set({ ...f, type: e.target.value })}>
          {TYPES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
        </select>
      </label>
    </>
  );
}
