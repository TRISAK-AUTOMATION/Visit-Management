// client/src/pages/ReportList.jsx - หน้ารายงาน Visit / OT / Leave (โครงเดียวกัน กำหนดต่างกันด้วย CFG)
// ตาราง/ตัวเลขสรุป/Export ใช้ชุดตัวกรองเดียวกัน กรองและแบ่งหน้าที่ Backend (/api/report/list/:type)
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import RIcon from '../components/report/ReportIcons';
import ExportPanel from '../components/report/ExportPanel';
import ReportDetailModal from '../components/report/ReportDetailModal';
import useReportOptions from '../components/report/useReportOptions';
import CountUp from '../components/profile/CountUp';
import { api, fmtDate } from '../lib/api';
import { useToast } from '../lib/ToastContext';
import { periodRange } from '../components/ReportParts';
import '../components/report/report-ui.css';

const dash = (v) => (v === null || v === undefined || v === '' ? '-' : v);
const hrs = (v) => (v === null || v === undefined ? '-' : (Number.isInteger(Number(v)) ? String(Number(v)) : Number(v).toFixed(1)));

const CFG = {
  visit: {
    title: 'Visit Report', th: 'รายงานการออกพบลูกค้า', icon: 'car', tone: 'blue', sort: { key: 'visit_date', dir: 'desc' },
    filters: ['dept', 'employee', 'customer', 'accompanied', 'status'],
    cards: (s) => [
      { label: 'Total Visits', hint: 'จำนวนรายการ Visit', value: s.total, unit: 'ครั้ง', icon: 'car', tone: 'blue' },
      { label: 'Employees Visited', hint: 'พนักงานที่มีรายการ Visit', value: s.employees, unit: 'คน', icon: 'users', tone: 'green' },
      { label: 'Companies Visited', hint: 'บริษัทลูกค้าที่เข้าพบ', value: s.companies, unit: 'บริษัท', icon: 'building', tone: 'purple' },
      { label: 'Pending Approval', hint: 'รอการอนุมัติ', value: s.pending, unit: 'รายการ', icon: 'clock', tone: 'orange' }
    ],
    cols: [
      { k: 'visit_date', label: 'Visit Date', sort: 'visit_date', r: (r) => fmtDate(r.visit_date), cls: 'nowrap' },
      { k: 'employee', label: 'Employee', sort: 'employee', r: (r) => <b>{r.employee}</b> },
      { k: 'department', label: 'Department', sort: 'department', r: (r) => dash(r.department) },
      { k: 'customer', label: 'Customer / Company', sort: 'customer', r: (r) => dash(r.customer), cls: 'wrap' },
      { k: 'participants', label: 'Accompanied By', r: (r) => dash(r.participants), cls: 'wrap' },
      { k: 'purpose', label: 'Purpose', r: (r) => dash(r.purpose), cls: 'wrap clamp' },
      { k: 'time_from', label: 'Time Out', sort: 'time_from', r: (r) => dash(r.time_from), cls: 'center' },
      { k: 'time_to', label: 'Time In', sort: 'time_to', r: (r) => dash(r.time_to), cls: 'center' }
    ],
    searchPh: 'ค้นหา ชื่อพนักงาน / บริษัทลูกค้า / รายละเอียด'
  },
  ot: {
    title: 'OT Report', th: 'รายงานการทำงานล่วงเวลา', icon: 'clock', tone: 'orange', sort: { key: 'ot_date', dir: 'desc' },
    filters: ['dept', 'employee', 'status'],
    cards: (s) => [
      { label: 'Total OT Requests', hint: 'จำนวนรายการ OT', value: s.total, unit: 'รายการ', icon: 'clock', tone: 'orange' },
      { label: 'Approved OT Hours', hint: 'เฉพาะที่อนุมัติแล้ว', value: s.approved_hours, unit: 'ชม.', icon: 'check', tone: 'green' },
      { label: 'Pending Approval', hint: `${hrs(s.pending_hours)} ชม. ที่รออนุมัติ`, value: s.pending, unit: 'รายการ', icon: 'refresh', tone: 'blue' },
      { label: 'Employees with OT', hint: 'พนักงานที่มีรายการ OT', value: s.employees, unit: 'คน', icon: 'users', tone: 'purple' }
    ],
    cols: [
      { k: 'ot_date', label: 'OT Date', sort: 'ot_date', r: (r) => fmtDate(r.ot_date), cls: 'nowrap' },
      { k: 'request_date', label: 'Request Date', sort: 'request_date', r: (r) => fmtDate(r.request_date), cls: 'nowrap' },
      { k: 'employee', label: 'Employee', sort: 'employee', r: (r) => <b>{r.employee}</b> },
      { k: 'department', label: 'Department', sort: 'department', r: (r) => dash(r.department) },
      { k: 'time_from', label: 'Start', sort: 'time_from', r: (r) => dash(r.time_from), cls: 'center' },
      { k: 'time_to', label: 'End', r: (r) => dash(r.time_to), cls: 'center' },
      { k: 'hours', label: 'OT Hours', sort: 'hours', r: (r) => hrs(r.hours), cls: 'num' },
      { k: 'reason', label: 'Reason', r: (r) => dash(r.reason), cls: 'wrap clamp' }
    ],
    searchPh: 'ค้นหา ชื่อพนักงาน / เหตุผล / Job No.'
  },
  leave: {
    title: 'Leave Report', th: 'รายงานการลา', icon: 'calendar', tone: 'green', sort: { key: 'date_from', dir: 'desc' },
    filters: ['dept', 'employee', 'leaveType', 'status'],
    cards: (s) => [
      { label: 'Total Leave Requests', hint: 'จำนวนรายการลา', value: s.total, unit: 'รายการ', icon: 'calendar', tone: 'green' },
      { label: 'Approved Leave Days', hint: 'เฉพาะที่อนุมัติแล้ว', value: s.approved_days, unit: 'วัน', icon: 'check', tone: 'blue' },
      { label: 'Pending Approval', hint: `${hrs(s.pending_days)} วัน ที่รออนุมัติ`, value: s.pending, unit: 'รายการ', icon: 'clock', tone: 'orange' },
      { label: 'Employees on Leave', hint: 'พนักงานที่มีรายการลา', value: s.employees, unit: 'คน', icon: 'users', tone: 'purple' }
    ],
    cols: [
      { k: 'request_date', label: 'Request Date', sort: 'request_date', r: (r) => fmtDate(r.request_date), cls: 'nowrap' },
      { k: 'employee', label: 'Employee', sort: 'employee', r: (r) => <b>{r.employee}</b> },
      { k: 'department', label: 'Department', sort: 'department', r: (r) => dash(r.department) },
      { k: 'leave_type', label: 'Leave Type', sort: 'leave_type', r: (r) => dash(r.leave_type) },
      { k: 'date_from', label: 'Start Date', sort: 'date_from', r: (r) => fmtDate(r.date_from), cls: 'nowrap' },
      { k: 'date_to', label: 'End Date', sort: 'date_to', r: (r) => fmtDate(r.date_to), cls: 'nowrap' },
      { k: 'days', label: 'Leave Days', sort: 'days', r: (r) => hrs(r.days), cls: 'num' },
      { k: 'reason', label: 'Reason', r: (r) => dash(r.reason), cls: 'wrap clamp' }
    ],
    searchPh: 'ค้นหา ชื่อพนักงาน / เหตุผลการลา'
  }
};

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monthDefaults = () => { const [from, to] = periodRange('month'); return { from, to }; };
const blank = () => ({ ...monthDefaults(), department: '', user_id: '', customer_id: '', accompanied: '', status: '', leave_type: '', q: '' });

const storeKey = (t) => `trisak_rx_filters_${t}`;
function loadF(t) {
  try { const raw = sessionStorage.getItem(storeKey(t)); if (raw) return { ...blank(), ...JSON.parse(raw) }; } catch (e) { /* ใช้ค่าเริ่มต้น */ }
  return blank();
}
function saveF(t, f) { try { sessionStorage.setItem(storeKey(t), JSON.stringify(f)); } catch (e) { /* ไม่เป็นไร */ } }

function toQuery(f) {
  const qs = new URLSearchParams();
  ['from', 'to', 'department', 'user_id', 'customer_id', 'accompanied', 'status', 'leave_type', 'q'].forEach(k => { if (f[k]) qs.set(k, f[k]); });
  return qs.toString();
}

function Pager({ page, pages, onGo }) {
  if (pages <= 1) return null;
  const set = new Set([1, pages, page, page - 1, page + 1, page - 2, page + 2].filter(n => n >= 1 && n <= pages));
  const list = [...set].sort((a, b) => a - b);
  const out = [];
  list.forEach((n, i) => { if (i && n - list[i - 1] > 1) out.push('gap' + n); out.push(n); });
  return (
    <nav className="rx-pager" aria-label="เปลี่ยนหน้า">
      <button type="button" disabled={page <= 1} onClick={() => onGo(page - 1)} aria-label="ก่อนหน้า"><RIcon name="chevron" size={15} className="flip" /></button>
      {out.map(n => (typeof n === 'string'
        ? <span key={n} className="gap">…</span>
        : <button key={n} type="button" className={n === page ? 'on' : ''} aria-current={n === page ? 'page' : undefined} onClick={() => onGo(n)}>{n}</button>))}
      <button type="button" disabled={page >= pages} onClick={() => onGo(page + 1)} aria-label="ถัดไป"><RIcon name="chevron" size={15} /></button>
    </nav>
  );
}

export default function ReportList({ type }) {
  const cfg = CFG[type];
  const toast = useToast();
  const { opts, error: optErr } = useReportOptions();
  const [draft, setDraft] = useState(() => loadF(type));
  const [applied, setApplied] = useState(() => loadF(type));
  const [sort, setSort] = useState(cfg.sort);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const reqId = useRef(0);

  // เปลี่ยนประเภทรายงาน (เช่นกดเมนูอื่น) -> รีเซ็ตสถานะหน้า
  useEffect(() => { const f = loadF(type); setDraft(f); setApplied(f); setSort(CFG[type].sort); setPage(1); setData(null); }, [type]);

  const query = useMemo(() => toQuery(applied), [applied]);
  const fetchData = useCallback(() => {
    const id = ++reqId.current;
    setLoading(true); setError('');
    const qs = new URLSearchParams(query);
    qs.set('page', page); qs.set('page_size', size); qs.set('sort', sort.key); qs.set('dir', sort.dir);
    api.get(`/api/report/list/${type}?${qs.toString()}`)
      .then(d => { if (id === reqId.current) setData(d); })
      .catch(e => { if (id === reqId.current) setError(e.message || 'Unable to load report data.'); })
      .finally(() => { if (id === reqId.current) setLoading(false); });
  }, [type, query, page, size, sort]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const canAll = !!(opts && opts.can_view_all);
  const employees = useMemo(() => (opts ? opts.employees.filter(e => !draft.department || e.department === draft.department) : []), [opts, draft.department]);
  const has = (k) => cfg.filters.includes(k) && (canAll || !['dept', 'employee'].includes(k));

  const set = (k, v) => setDraft(d => {
    const n = { ...d, [k]: v };
    // เปลี่ยนแผนก -> ถ้าพนักงานที่เลือกอยู่ไม่ได้อยู่แผนกนั้น ให้ล้างออก (รายชื่อพนักงานสัมพันธ์กับแผนก)
    if (k === 'department' && n.user_id && opts) {
      const u = opts.employees.find(e => String(e.id) === String(n.user_id));
      if (u && v && u.department !== v) n.user_id = '';
    }
    return n;
  });

  const apply = () => {
    if (draft.from && draft.to && draft.from > draft.to) { toast('วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด', 'error'); return; }
    saveF(type, draft); setApplied(draft); setPage(1); setFiltersOpen(false);
  };
  const reset = () => { const f = blank(); saveF(type, f); setDraft(f); setApplied(f); setPage(1); };
  const preset = (p) => {
    let from, to;
    if (p === 'last') { const t = new Date(); from = iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)); to = iso(new Date(t.getFullYear(), t.getMonth(), 0)); }
    else [from, to] = periodRange(p);
    setDraft(d => ({ ...d, from, to }));
  };
  const onSort = (key) => { setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })); setPage(1); };

  const total = data ? data.total : 0;
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total ? (page - 1) * size + 1 : 0;
  const to = Math.min(total, page * size);
  const statusOpts = opts ? opts.statuses[type] : [];
  const chips = [
    applied.department && `แผนก ${applied.department}`,
    applied.user_id && opts && `พนักงาน ${(opts.employees.find(e => String(e.id) === String(applied.user_id)) || {}).full_name || ''}`,
    applied.customer_id && opts && `ลูกค้า ${(opts.customers.find(c => String(c.id) === String(applied.customer_id)) || {}).name || ''}`,
    applied.accompanied && `ผู้ร่วมเดินทาง ${applied.accompanied}`,
    applied.leave_type && applied.leave_type,
    applied.status && statusOpts.length && (statusOpts.find(s => s.v === applied.status) || {}).label,
    applied.q && `"${applied.q}"`
  ].filter(Boolean);

  return (
    <Layout title={cfg.title}>
      <div className="rx-crumbs rx-rise" style={{ '--i': 0 }}>
        <Link to="/report"><RIcon name="home" size={15} /> Report</Link><RIcon name="chevron" size={13} /><span>{cfg.title}</span>
      </div>

      <div className={`rx-pagehead tone-${cfg.tone} rx-rise`} style={{ '--i': 1 }}>
        <span className="rx-orbs"><i className="rx-orb o1" /><i className="rx-orb o2" /></span>
        <span className="rx-headicon"><RIcon name={cfg.icon} size={26} /></span>
        <div className="rx-headtext"><h2>{cfg.title}</h2><p>{cfg.th}{!canAll && opts ? ' · เฉพาะข้อมูลของคุณ' : ''}</p></div>
        <ExportPanel type={type} query={query} sort={sort} appliedUserId={applied.user_id} />
      </div>

      {/* ตัวกรอง */}
      <div className="rx-panel rx-rise" style={{ '--i': 2 }}>
        <button type="button" className="rx-filter-toggle" onClick={() => setFiltersOpen(o => !o)} aria-expanded={filtersOpen}>
          <span><RIcon name="filter" size={16} /> ตัวกรอง{chips.length ? ` (${chips.length})` : ''}</span><RIcon name="chevronDown" size={16} className={filtersOpen ? 'flip' : ''} />
        </button>
        <div className={`rx-filters ${filtersOpen ? 'open' : ''}`}>
          <div className="rx-f rx-f-date">
            <label>ช่วงเวลา</label>
            <div className="rx-daterow">
              <input type="date" value={draft.from} max={draft.to || undefined} onChange={e => set('from', e.target.value)} aria-label="วันที่เริ่มต้น" />
              <span>–</span>
              <input type="date" value={draft.to} min={draft.from || undefined} onChange={e => set('to', e.target.value)} aria-label="วันที่สิ้นสุด" />
            </div>
            <div className="rx-presets">
              <button type="button" onClick={() => preset('month')}>เดือนนี้</button>
              <button type="button" onClick={() => preset('last')}>เดือนที่แล้ว</button>
              <button type="button" onClick={() => preset('quarter')}>ไตรมาส</button>
              <button type="button" onClick={() => preset('year')}>ปีนี้</button>
              <button type="button" onClick={() => setDraft(d => ({ ...d, from: '', to: '' }))}>ทั้งหมด</button>
            </div>
          </div>
          {has('dept') && (
            <div className="rx-f"><label>แผนก</label>
              <select value={draft.department} onChange={e => set('department', e.target.value)}>
                <option value="">ทั้งหมด</option>{opts && opts.departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select></div>
          )}
          {has('employee') && (
            <div className="rx-f"><label>{type === 'visit' ? 'พนักงาน / Engineer' : 'พนักงาน'}</label>
              <select value={draft.user_id} onChange={e => set('user_id', e.target.value)}>
                <option value="">ทั้งหมด</option>{employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select></div>
          )}
          {has('customer') && (
            <div className="rx-f"><label>ลูกค้า / บริษัท</label>
              <select value={draft.customer_id} onChange={e => set('customer_id', e.target.value)}>
                <option value="">ทั้งหมด</option>{opts && opts.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
          )}
          {has('accompanied') && (
            <div className="rx-f"><label>ผู้ร่วมเดินทาง</label>
              <select value={draft.accompanied} onChange={e => set('accompanied', e.target.value)}>
                <option value="">ทั้งหมด</option>{opts && opts.people.map(p => <option key={p.id} value={p.full_name}>{p.full_name}</option>)}
              </select></div>
          )}
          {has('leaveType') && (
            <div className="rx-f"><label>ประเภทการลา</label>
              <select value={draft.leave_type} onChange={e => set('leave_type', e.target.value)}>
                <option value="">ทั้งหมด</option>{opts && opts.leave_types.map(t => <option key={t} value={t}>{t}</option>)}
              </select></div>
          )}
          {has('status') && (
            <div className="rx-f"><label>สถานะ</label>
              <select value={draft.status} onChange={e => set('status', e.target.value)}>
                <option value="">ทั้งหมด</option>{statusOpts.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
              </select></div>
          )}
          <div className="rx-f rx-f-search"><label>ค้นหา</label>
            <div className="rx-searchbox"><RIcon name="search" size={16} />
              <input type="search" value={draft.q} placeholder={cfg.searchPh} onChange={e => set('q', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') apply(); }} maxLength={100} /></div>
          </div>
          <div className="rx-f-actions">
            <button type="button" className="rx-btn ghost" onClick={reset}><RIcon name="refresh" size={15} /> ล้างค่า</button>
            <button type="button" className="rx-btn primary" onClick={apply}><RIcon name="search" size={15} /> ค้นหา</button>
          </div>
        </div>
        {chips.length > 0 && <div className="rx-chips">{chips.map((c, i) => <span key={i} className="rx-chip">{c}</span>)}</div>}
      </div>

      {(optErr || error) && (
        <div className="rx-err rx-block" role="alert">{error || optErr}
          <button type="button" className="rx-btn ghost sm" onClick={() => { setError(''); fetchData(); }}>ลองใหม่</button></div>
      )}

      {/* ตัวเลขสรุป */}
      <div className="rx-stats">
        {cfg.cards(data ? data.summary : {}).map((c, i) => (
          <div key={c.label} className={`rx-stat tone-${c.tone} rx-rise`} style={{ '--i': i + 3 }}>
            <span className="rx-staticon"><RIcon name={c.icon} size={22} /></span>
            <div>
              <div className="rx-statlabel">{c.label}</div>
              <div className="rx-statvalue">
                {data ? <><CountUp key={`${c.label}-${c.value}`} value={c.value} /><small>{c.unit}</small></> : <span className="rx-skel" style={{ width: 70, height: 26 }} />}
              </div>
              <div className="rx-stathint">{data ? c.hint : ''}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ตาราง */}
      <div className={`rx-panel rx-tablecard rx-rise ${loading ? 'is-loading' : ''}`} style={{ '--i': 7 }}>
        <div className="rx-loadbar" aria-hidden="true" />
        <div className="rx-tablehead">
          <h3>{cfg.title.replace(' Report', '')} Records <em>({total.toLocaleString('en-US')})</em></h3>
          <label className="rx-size">แสดง
            <select value={size} onChange={e => { setSize(Number(e.target.value)); setPage(1); }}>{[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}</select> แถว</label>
        </div>
        <div className="rx-tablewrap">
          <table className="rx-table">
            <thead>
              <tr>
                {cfg.cols.map(c => (
                  <th key={c.k} className={c.cls && c.cls.includes('num') ? 'num' : c.cls && c.cls.includes('center') ? 'center' : ''}
                    aria-sort={sort.key === c.sort ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {c.sort ? (
                      <button type="button" onClick={() => onSort(c.sort)} className={sort.key === c.sort ? 'on' : ''}>{c.label}
                        <i className="rx-sorti">{sort.key === c.sort ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</i></button>
                    ) : c.label}
                  </th>
                ))}
                <th>Status</th><th className="center">Details</th>
              </tr>
            </thead>
            <tbody>
              {!data && loading && Array.from({ length: 6 }).map((_, i) => (
                <tr key={'s' + i} className="rx-skelrow">{Array.from({ length: cfg.cols.length + 2 }).map((__, j) => <td key={j}><span className="rx-skel" /></td>)}</tr>
              ))}
              {data && data.rows.map((r, i) => (
                <tr key={r.id} style={{ '--i': Math.min(i, 14) }} className="rx-row">
                  {cfg.cols.map(c => <td key={c.k} data-label={c.label} className={c.cls || ''}>{c.r(r)}</td>)}
                  <td data-label="Status"><span className={`rx-badge s-${r.status}`}>{r.status_label}</span></td>
                  <td data-label="Details" className="center">
                    <button type="button" className="rx-view" onClick={() => setDetail(r.id)} aria-label={`ดูรายละเอียด ${r.code}`}><RIcon name="eye" size={15} /> ดูรายละเอียด</button>
                  </td>
                </tr>
              ))}
              {data && !data.rows.length && (
                <tr className="rx-emptyrow"><td colSpan={cfg.cols.length + 2}>
                  <div className="rx-empty"><span><RIcon name="search" size={30} /></span><b>No records found.</b><small>ไม่พบข้อมูลตามเงื่อนไขที่เลือก ลองปรับตัวกรองหรือกด “ล้างค่า”</small></div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="rx-tablefoot">
          <span className="muted">{total ? `แสดง ${from.toLocaleString('en-US')} - ${to.toLocaleString('en-US')} จาก ${total.toLocaleString('en-US')} รายการ` : ''}</span>
          <Pager page={page} pages={pages} onGo={setPage} />
        </div>
      </div>

      {detail && <ReportDetailModal type={type} id={detail} onClose={() => setDetail(null)} />}
    </Layout>
  );
}
