// client/src/pages/ReportSummary.jsx - Employee Summary Report (เฉพาะ Approver / Admin)
// ตารางสรุปรายพนักงานมาจาก /api/report/list/summary (กรอง/เรียง/แบ่งหน้าที่ Backend) ; กราฟรายเดือนใช้ /api/report/overview เดิม
// ไม่รวม Visit + OT + Leave เป็นคะแนนเดียว เพราะหน่วยต่างกัน (ครั้ง / ชม. / วัน) แสดงแยกกันชัดเจน
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import RIcon from '../components/report/ReportIcons';
import ExportPanel from '../components/report/ExportPanel';
import useReportOptions from '../components/report/useReportOptions';
import CountUp from '../components/profile/CountUp';
import { api } from '../lib/api';
import { useToast } from '../lib/ToastContext';
import { ActivityOverview, periodRange } from '../components/ReportParts';
import '../components/report/report-ui.css';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const blank = () => { const [from, to] = periodRange('month'); return { from, to, department: '', user_id: '', q: '' }; };
const KEY = 'trisak_rx_filters_summary';
const load = () => { try { const r = sessionStorage.getItem(KEY); if (r) return { ...blank(), ...JSON.parse(r) }; } catch (e) { /* ค่าเริ่มต้น */ } return blank(); };
const save = (f) => { try { sessionStorage.setItem(KEY, JSON.stringify(f)); } catch (e) { /* ไม่เป็นไร */ } };
const toQuery = (f) => { const qs = new URLSearchParams(); ['from', 'to', 'department', 'user_id', 'q'].forEach(k => { if (f[k]) qs.set(k, f[k]); }); return qs.toString(); };
const n1 = (v) => (Number.isInteger(Number(v)) ? String(Number(v)) : Number(v).toFixed(1));

const COLS = [
  { k: 'username', label: 'Employee ID', sort: 'username' },
  { k: 'full_name', label: 'Employee', sort: 'full_name' },
  { k: 'department', label: 'Department', sort: 'department' },
  { k: 'position', label: 'Position', sort: 'position' },
  { k: 'visits', label: 'Approved Visits', sort: 'visits', num: true },
  { k: 'ot_hours', label: 'Approved OT (ชม.)', sort: 'ot_hours', num: true },
  { k: 'leave_days', label: 'Approved Leave (วัน)', sort: 'leave_days', num: true },
  { k: 'late', label: 'Late', sort: 'late', num: true },
  { k: 'absent', label: 'Absent', sort: 'absent', num: true },
  { k: 'pending', label: 'Pending', sort: 'pending', num: true }
];

export default function ReportSummary() {
  const toast = useToast();
  const { opts, error: optErr } = useReportOptions();
  const [draft, setDraft] = useState(load);
  const [applied, setApplied] = useState(load);
  const [sort, setSort] = useState({ key: 'full_name', dir: 'asc' });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [data, setData] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const reqId = useRef(0);

  const query = useMemo(() => toQuery(applied), [applied]);
  const fetchData = useCallback(() => {
    const id = ++reqId.current;
    setLoading(true); setError('');
    const qs = new URLSearchParams(query);
    qs.set('page', page); qs.set('page_size', size); qs.set('sort', sort.key); qs.set('dir', sort.dir);
    api.get(`/api/report/list/summary?${qs.toString()}`)
      .then(d => { if (id === reqId.current) setData(d); })
      .catch(e => { if (id === reqId.current) setError(e.message || 'Unable to load report data.'); })
      .finally(() => { if (id === reqId.current) setLoading(false); });
  }, [query, page, size, sort]);
  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const qs = new URLSearchParams(query); qs.delete('q');
    api.get(`/api/report/overview?${qs.toString()}`).then(d => setMonthly(d.monthly)).catch(() => setMonthly([]));
  }, [query]);

  const employees = useMemo(() => (opts ? opts.employees.filter(e => !draft.department || e.department === draft.department) : []), [opts, draft.department]);
  const set = (k, v) => setDraft(d => {
    const n = { ...d, [k]: v };
    if (k === 'department' && n.user_id && opts) { const u = opts.employees.find(e => String(e.id) === String(n.user_id)); if (u && v && u.department !== v) n.user_id = ''; }
    return n;
  });
  const apply = () => {
    if (draft.from && draft.to && draft.from > draft.to) { toast('วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด', 'error'); return; }
    save(draft); setApplied(draft); setPage(1); setFiltersOpen(false);
  };
  const reset = () => { const f = blank(); save(f); setDraft(f); setApplied(f); setPage(1); };
  const preset = (p) => {
    let from, to;
    if (p === 'last') { const t = new Date(); from = iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)); to = iso(new Date(t.getFullYear(), t.getMonth(), 0)); } else [from, to] = periodRange(p);
    setDraft(d => ({ ...d, from, to }));
  };
  const onSort = (key) => { setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: ['full_name', 'username', 'department', 'position'].includes(key) ? 'asc' : 'desc' })); setPage(1); };

  const total = data ? data.total : 0;
  const pages = Math.max(1, Math.ceil(total / size));
  const sm = data ? data.summary : null;
  const cards = [
    { label: 'Employees', hint: 'พนักงานตามตัวกรอง', value: sm && sm.employees, unit: 'คน', icon: 'users', tone: 'purple' },
    { label: 'Approved Visits', hint: 'Visit ที่อนุมัติแล้ว', value: sm && sm.visits, unit: 'ครั้ง', icon: 'car', tone: 'blue' },
    { label: 'Approved OT Hours', hint: 'ชั่วโมง OT ที่อนุมัติแล้ว', value: sm && sm.ot_hours, unit: 'ชม.', icon: 'clock', tone: 'orange' },
    { label: 'Approved Leave Days', hint: 'วันลาที่อนุมัติแล้ว', value: sm && sm.leave_days, unit: 'วัน', icon: 'calendar', tone: 'green' }
  ];

  return (
    <Layout title="Employee Summary">
      <div className="rx-crumbs rx-rise" style={{ '--i': 0 }}>
        <Link to="/report"><RIcon name="home" size={15} /> Report</Link><RIcon name="chevron" size={13} /><span>Employee Summary</span>
      </div>
      <div className="rx-pagehead rx-rise" style={{ '--i': 1 }}>
        <span className="rx-orbs"><i className="rx-orb o1" /><i className="rx-orb o2" /></span>
        <span className="rx-headicon"><RIcon name="users" size={26} /></span>
        <div className="rx-headtext"><h2>Employee Summary</h2><p>รายงานสรุปพนักงานทั้งหมดตามสิทธิ์ของคุณ · คลิกชื่อเพื่อดูรายงานรายบุคคล</p></div>
        <ExportPanel type="summary" query={query} sort={sort} appliedUserId={applied.user_id} />
      </div>

      <div className="rx-panel rx-rise" style={{ '--i': 2 }}>
        <button type="button" className="rx-filter-toggle" onClick={() => setFiltersOpen(o => !o)} aria-expanded={filtersOpen}>
          <span><RIcon name="filter" size={16} /> ตัวกรอง</span><RIcon name="chevronDown" size={16} className={filtersOpen ? 'flip' : ''} />
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
          <div className="rx-f"><label>แผนก</label>
            <select value={draft.department} onChange={e => set('department', e.target.value)}>
              <option value="">ทั้งหมด</option>{opts && opts.departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select></div>
          <div className="rx-f"><label>พนักงาน</label>
            <select value={draft.user_id} onChange={e => set('user_id', e.target.value)}>
              <option value="">ทั้งหมด</option>{employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select></div>
          <div className="rx-f rx-f-search"><label>ค้นหา</label>
            <div className="rx-searchbox"><RIcon name="search" size={16} />
              <input type="search" value={draft.q} placeholder="ค้นหา ชื่อ / แผนก / ตำแหน่ง" onChange={e => set('q', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') apply(); }} maxLength={100} /></div></div>
          <div className="rx-f-actions">
            <button type="button" className="rx-btn ghost" onClick={reset}><RIcon name="refresh" size={15} /> ล้างค่า</button>
            <button type="button" className="rx-btn primary" onClick={apply}><RIcon name="search" size={15} /> ค้นหา</button>
          </div>
        </div>
      </div>

      {(optErr || error) && <div className="rx-err rx-block" role="alert">{error || optErr}<button type="button" className="rx-btn ghost sm" onClick={() => { setError(''); fetchData(); }}>ลองใหม่</button></div>}

      <div className="rx-stats">
        {cards.map((c, i) => (
          <div key={c.label} className={`rx-stat tone-${c.tone} rx-rise`} style={{ '--i': i + 3 }}>
            <span className="rx-staticon"><RIcon name={c.icon} size={22} /></span>
            <div><div className="rx-statlabel">{c.label}</div>
              <div className="rx-statvalue">{sm ? <><CountUp key={`${c.label}-${c.value}`} value={c.value} /><small>{c.unit}</small></> : <span className="rx-skel" style={{ width: 70, height: 26 }} />}</div>
              <div className="rx-stathint">{sm ? c.hint : ''}</div></div>
          </div>
        ))}
      </div>

      <div className="rx-panel rx-rise" style={{ '--i': 7 }}>
        <div className="rx-tablehead"><h3>Activity Overview <em>แนวโน้มรายเดือน แยกตามหน่วย</em></h3></div>
        <div style={{ padding: '0 18px 18px' }}>
          {monthly ? <ActivityOverview monthly={monthly} sections={{ visit: true, leave: true, ot: true }} /> : <div className="rx-skel" style={{ height: 140 }} />}
        </div>
      </div>

      <div className={`rx-panel rx-tablecard rx-rise ${loading ? 'is-loading' : ''}`} style={{ '--i': 8 }}>
        <div className="rx-loadbar" aria-hidden="true" />
        <div className="rx-tablehead">
          <h3>Employees <em>({total.toLocaleString('en-US')})</em></h3>
          <label className="rx-size">แสดง
            <select value={size} onChange={e => { setSize(Number(e.target.value)); setPage(1); }}>{[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}</select> แถว</label>
        </div>
        <div className="rx-tablewrap">
          <table className="rx-table">
            <thead><tr>
              {COLS.map(c => (
                <th key={c.k} className={c.num ? 'num' : ''} aria-sort={sort.key === c.sort ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  <button type="button" onClick={() => onSort(c.sort)} className={sort.key === c.sort ? 'on' : ''}>{c.label}<i className="rx-sorti">{sort.key === c.sort ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</i></button>
                </th>
              ))}
              <th className="center">Report</th>
            </tr></thead>
            <tbody>
              {!data && loading && Array.from({ length: 6 }).map((_, i) => <tr key={i} className="rx-skelrow">{Array.from({ length: COLS.length + 1 }).map((__, j) => <td key={j}><span className="rx-skel" /></td>)}</tr>)}
              {data && data.rows.map((e, i) => (
                <tr key={e.id} className="rx-row" style={{ '--i': Math.min(i, 14) }}>
                  <td data-label="Employee ID">{e.username}</td>
                  <td data-label="Employee"><Link className="rp-link" to={`/report/employee/${e.id}`}><b>{e.full_name}</b></Link></td>
                  <td data-label="Department">{e.department || '-'}</td>
                  <td data-label="Position">{e.position || '-'}</td>
                  <td className="num" data-label="Approved Visits">{e.visits}</td>
                  <td className="num" data-label="Approved OT">{n1(e.ot_hours)}</td>
                  <td className="num" data-label="Approved Leave">{n1(e.leave_days)}</td>
                  <td className="num" data-label="Late">{e.late}</td>
                  <td className="num" data-label="Absent">{e.absent}</td>
                  <td className="num" data-label="Pending">{e.pending > 0 ? <span className="rx-badge s-pending">{e.pending}</span> : 0}</td>
                  <td className="center" data-label="Report"><Link className="rx-view" to={`/report/employee/${e.id}`}><RIcon name="eye" size={15} /> ดูรายงาน</Link></td>
                </tr>
              ))}
              {data && !data.rows.length && (
                <tr className="rx-emptyrow"><td colSpan={COLS.length + 1}><div className="rx-empty"><span><RIcon name="search" size={30} /></span><b>No records found.</b><small>ไม่พบพนักงานตามเงื่อนไขที่เลือก</small></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="rx-tablefoot">
          <span className="muted">{total ? `แสดง ${((page - 1) * size + 1).toLocaleString('en-US')} - ${Math.min(total, page * size).toLocaleString('en-US')} จาก ${total.toLocaleString('en-US')} คน` : ''}</span>
          {pages > 1 && (
            <nav className="rx-pager" aria-label="เปลี่ยนหน้า">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="ก่อนหน้า"><RIcon name="chevron" size={15} className="flip" /></button>
              <span className="muted" style={{ padding: '0 8px' }}>หน้า {page} / {pages}</span>
              <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="ถัดไป"><RIcon name="chevron" size={15} /></button>
            </nav>
          )}
        </div>
        {data && <p className="rx-note-foot">{data.note}</p>}
      </div>
    </Layout>
  );
}
