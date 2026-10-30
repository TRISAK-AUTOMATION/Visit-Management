// client/src/pages/ReportDashboard.jsx - Report Dashboard (ภาพรวมการทำงานของพนักงาน) สำหรับ Approver / Admin
// ข้อมูลทั้งหมดมาจาก /api/report/overview (คำนวณจากคำขอ Visit/ลา/OT จริงในระบบ)
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { api } from '../lib/api';
import { useToast } from '../lib/ToastContext';
import {
  ActivityOverview, SummaryCard, FilterFields, DEFAULT_FILTERS, loadFilters, saveFilters,
  filtersToQuery, periodLabel, visibleSections, fmtNum, TYPES
} from '../components/ReportParts';

const SORTS = {
  full_name: (a, b) => a.full_name.localeCompare(b.full_name, 'th'),
  department: (a, b) => (a.department || '').localeCompare(b.department || '', 'th'),
  visits: (a, b) => a.visits - b.visits,
  leave_days: (a, b) => a.leave_days - b.leave_days,
  late: (a, b) => a.late - b.late,
  absent: (a, b) => a.absent - b.absent,
  ot_hours: (a, b) => a.ot_hours - b.ot_hours
};

export default function ReportDashboard() {
  const toast = useToast();
  const [draft, setDraft] = useState(loadFilters);
  const [applied, setApplied] = useState(loadFilters);
  const [data, setData] = useState(null);
  const [options, setOptions] = useState({ departments: [], employees: [] }); // เก็บแยก ไม่ให้ dropdown ว่างระหว่างโหลดใหม่
  const [error, setError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'full_name', dir: 1 });

  useEffect(() => {
    setData(null); setError('');
    api.get(`/api/report/overview?${filtersToQuery(applied)}`)
      .then(d => { setData(d); setOptions(d.options); })
      .catch(e => setError(e.message || 'ไม่สามารถโหลดรายงานได้'));
  }, [applied]);

  const apply = () => {
    if (draft.period === 'custom' && draft.from && draft.to && draft.from > draft.to) {
      toast('วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด', 'error');
      return;
    }
    saveFilters(draft); setApplied(draft); setFiltersOpen(false);
  };
  const reset = () => { saveFilters(DEFAULT_FILTERS); setDraft(DEFAULT_FILTERS); setApplied(DEFAULT_FILTERS); };

  const sec = visibleSections(applied.type);
  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    let list = data.employees.filter(e => !q || [e.full_name, e.department, e.position].some(v => (v || '').toLowerCase().includes(q)));
    const cmp = SORTS[sort.key] || SORTS.full_name;
    return list.slice().sort((a, b) => cmp(a, b) * sort.dir);
  }, [data, search, sort]);

  const ranking = useMemo(() => (data ? data.employees.slice().sort((a, b) => b.total_activity - a.total_activity).slice(0, 10) : []), [data]);
  const maxActivity = Math.max(1, ...ranking.map(r => r.total_activity));

  const toggleSort = (key) => setSort(s => (s.key === key ? { key, dir: -s.dir } : { key, dir: key === 'full_name' || key === 'department' ? 1 : -1 }));
  const Th = ({ k, children, num }) => (
    <th className={num ? 'num' : ''} onClick={() => toggleSort(k)} style={{ cursor: 'pointer', userSelect: 'none' }}>
      {children}{sort.key === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
    </th>
  );
  const detailQuery = (id) => `/report/employee/${id}`;

  return (
    <Layout title="Report">
      <div className="rp-head">
        <div>
          <h2 className="rp-title">Report Dashboard</h2>
          <p className="rp-sub">ภาพรวมการทำงานของพนักงาน และสรุปข้อมูลการลา การเข้างาน การออกพบลูกค้า และ OT</p>
        </div>
      </div>

      {/* ตัวกรอง */}
      <div className="card rp-filters-card">
        <button type="button" className="rp-filter-toggle btn btn-outline" onClick={() => setFiltersOpen(o => !o)}>
          ตัวกรอง · {periodLabel(applied)} {filtersOpen ? '▲' : '▼'}
        </button>
        <div className={`rp-filters ${filtersOpen ? 'open' : ''}`}>
          <FilterFields f={draft} set={setDraft} departments={options.departments} employees={options.employees} />
          <div className="rp-filter-actions">
            <button type="button" className="btn btn-primary" onClick={apply}>Apply Filter</button>
            <button type="button" className="btn btn-outline" onClick={reset}>Reset</button>
          </div>
        </div>
      </div>

      {error && <div className="card"><div className="card-body"><span style={{ color: 'var(--red-600)' }}>{error}</span></div></div>}
      {!data && !error && <p className="muted">กำลังโหลดข้อมูล...</p>}

      {data && (
        <>
          <div className="rp-meta muted">
            ช่วงเวลา: <b>{periodLabel(applied)}</b>{applied.department ? ` · แผนก ${applied.department}` : ''}
            {applied.user_id ? ' · เฉพาะพนักงานที่เลือก' : ''}{applied.type !== 'all' ? ` · ประเภท: ${TYPES.find(t => t.v === applied.type)?.label}` : ''}
          </div>

          {/* Summary cards */}
          <div className="rp-cards">
            <SummaryCard icon="👥" tone="blue" label="พนักงานทั้งหมด" value={data.summary.employees} unit="คน" hint="บัญชีที่ใช้งานอยู่ตามตัวกรอง" />
            {sec.visit && <SummaryCard icon="🚗" tone="blue" label="Customer Visits" value={data.summary.visits} unit="ครั้ง" hint="ที่อนุมัติแล้ว ในช่วงเวลาที่เลือก" />}
            {sec.leave && <SummaryCard icon="🏖" tone="gray" label="Leave" value={fmtNum(data.summary.leave_days)} unit="วัน" hint="วันลาที่อนุมัติแล้ว" />}
            {sec.attendance && <SummaryCard icon="⏱" tone="red" label="Late / Absent" value={`${data.summary.late} / ${data.summary.absent}`} unit="ครั้ง" hint="ยอดสะสมจาก KPI (ไม่ขึ้นกับช่วงเวลา)" />}
            {sec.ot && <SummaryCard icon="⏰" tone="orange" label="OT" value={fmtNum(data.summary.ot_hours)} unit="ชม." hint="ชั่วโมง OT ที่อนุมัติแล้ว" />}
            <SummaryCard icon="🕓" tone="orange" label="Pending Approval" value={data.summary.pending} unit="รายการ" hint="Visit / ลา / OT ที่รออนุมัติ" />
          </div>

          {/* Activity Overview */}
          <div className="card rp-section">
            <div className="card-head"><h3>Activity Overview</h3><span className="muted rp-small">แนวโน้มรายเดือน</span></div>
            <div className="card-body"><ActivityOverview monthly={data.monthly} sections={sec} /></div>
          </div>

          {/* Employee Activity ranking */}
          <div className="card rp-section">
            <div className="card-head"><h3>Employee Activity</h3><span className="muted rp-small">10 อันดับกิจกรรมสูงสุด</span></div>
            <div className="card-body">
              {ranking.length ? (
                <table className="rp-table">
                  <thead>
                    <tr><th>Rank</th><th>Employee</th>
                      {sec.visit && <th className="num">Visits</th>}
                      {sec.ot && <th className="num">OT</th>}
                      {sec.leave && <th className="num">Leave</th>}
                      <th style={{ minWidth: 180 }}>Total Activity</th></tr>
                  </thead>
                  <tbody>
                    {ranking.map((r, i) => {
                      const total = (sec.visit ? r.visits : 0) + (sec.ot ? r.ot_hours : 0) + (sec.leave ? r.leave_days : 0);
                      return (
                        <tr key={r.id}>
                          <td data-label="Rank">{i + 1}</td>
                          <td data-label="Employee"><Link className="rp-link" to={detailQuery(r.id)}>{r.full_name}</Link></td>
                          {sec.visit && <td className="num" data-label="Visits">{r.visits}</td>}
                          {sec.ot && <td className="num" data-label="OT">{fmtNum(r.ot_hours)} ชม.</td>}
                          {sec.leave && <td className="num" data-label="Leave">{fmtNum(r.leave_days)}</td>}
                          <td data-label="Total Activity">
                            <div className="rp-bar-row"><div className="rp-bar"><i style={{ width: `${Math.round((total / maxActivity) * 100)}%` }} /></div><b>{fmtNum(total)}</b></div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : <div className="empty">ไม่มีพนักงานตามตัวกรองนี้</div>}
              <p className="rp-note">Total Activity = Visit (ครั้ง) + OT (ชม.) + Leave (วัน) เป็นเพียงภาพรวมปริมาณกิจกรรม ไม่ใช่คะแนนผลงาน — กิจกรรมมากไม่ได้แปลว่าทำงานดีกว่าเสมอไป</p>
            </div>
          </div>

          {/* Employees */}
          <div className="card rp-section">
            <div className="card-head">
              <h3>Employees <span className="muted" style={{ fontWeight: 400 }}>({rows.length})</span></h3>
              <input className="rp-search" type="search" placeholder="ค้นหา ชื่อ / Department / Position" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="card-body">
              {/* Desktop/Tablet: ตาราง */}
              <table className="rp-table rp-desktop-only">
                <thead>
                  <tr>
                    <Th k="full_name">Employee</Th><Th k="department">Department</Th><th>Position</th>
                    {sec.visit && <Th k="visits" num>Visit</Th>}
                    {sec.leave && <Th k="leave_days" num>Leave</Th>}
                    {sec.attendance && <Th k="late" num>Late</Th>}
                    {sec.attendance && <Th k="absent" num>Absent</Th>}
                    {sec.ot && <Th k="ot_hours" num>OT</Th>}
                    <th>Status</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? rows.map(e => (
                    <tr key={e.id}>
                      <td><b>{e.full_name}</b></td><td>{e.department || '-'}</td><td>{e.position || '-'}</td>
                      {sec.visit && <td className="num">{e.visits}</td>}
                      {sec.leave && <td className="num">{fmtNum(e.leave_days)}</td>}
                      {sec.attendance && <td className="num">{e.late}</td>}
                      {sec.attendance && <td className="num">{e.absent}</td>}
                      {sec.ot && <td className="num">{fmtNum(e.ot_hours)}h</td>}
                      <td>{e.pending > 0 ? <span className="badge pending">รออนุมัติ {e.pending}</span> : <span className="badge approved">ปกติ</span>}</td>
                      <td><Link className="btn btn-outline btn-sm" to={detailQuery(e.id)}>View Report</Link></td>
                    </tr>
                  )) : <tr><td colSpan={10} className="empty">ไม่พบพนักงาน</td></tr>}
                </tbody>
              </table>
              {/* Mobile: การ์ด */}
              <div className="rp-mobile-only">
                {rows.length ? rows.map(e => (
                  <div className="rp-emp-card" key={e.id}>
                    <div className="rp-emp-top">
                      <div><b>{e.full_name}</b><div className="muted rp-small">{[e.department, e.position].filter(Boolean).join(' · ') || '-'}</div></div>
                      {e.pending > 0 ? <span className="badge pending">รออนุมัติ {e.pending}</span> : <span className="badge approved">ปกติ</span>}
                    </div>
                    <div className="rp-emp-stats">
                      {sec.visit && <div><span>Visit</span><b>{e.visits}</b></div>}
                      {sec.leave && <div><span>Leave</span><b>{fmtNum(e.leave_days)}</b></div>}
                      {sec.attendance && <div><span>Late</span><b>{e.late}</b></div>}
                      {sec.attendance && <div><span>Absent</span><b>{e.absent}</b></div>}
                      {sec.ot && <div><span>OT</span><b>{fmtNum(e.ot_hours)}h</b></div>}
                    </div>
                    <Link className="btn btn-outline btn-sm" to={detailQuery(e.id)}>View Report</Link>
                  </div>
                )) : <div className="empty">ไม่พบพนักงาน</div>}
              </div>
              {sec.attendance && <p className="rp-note">{data.attendance_note}</p>}
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
