// client/src/pages/ReportEmployee.jsx - Employee Report (รายงานรายบุคคล) สำหรับ Approver / Admin
// ข้อมูลมาจาก /api/report/employee/:id ; กดรายการ Visit เพื่อดูรายละเอียดเต็ม (ใช้ RequestModal เดิม)
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import RequestModal from '../components/RequestModal';
import { api, fmtDate, statusLabel } from '../lib/api';
import { useToast } from '../lib/ToastContext';
import { useAuth } from '../lib/AuthContext';
import {
  ActivityOverview, MiniBarChart, SummaryCard, FilterFields, DEFAULT_FILTERS, loadFilters, saveFilters,
  filtersToQuery, periodLabel, visibleSections, fmtNum, TH_MONTHS, TH_MONTHS_SHORT
} from '../components/ReportParts';
import Loading from '../components/Loading';

const LEAVE_MODE_TH = { full_day: 'เต็มวัน', half_day_morning: 'ครึ่งวัน (เช้า)', half_day_afternoon: 'ครึ่งวัน (บ่าย)', hours: 'รายชั่วโมง' };
const DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

function leaveDuration(r) {
  if (r.leave_mode === 'hours') return `${fmtNum(r.duration_hours)} ชม.`;
  return `${fmtNum(r.duration_days)} วัน`;
}

// ปฏิทินการลารายเดือน (เฉพาะวันที่มีการลา: อนุมัติแล้ว = เขียว, รออนุมัติ = ส้ม)
function LeaveCalendar({ leaves }) {
  const [view, setView] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const y = view.getFullYear(), m = view.getMonth();
  const byDate = useMemo(() => {
    const map = {};
    leaves.filter(l => l.status === 'approved' || l.status === 'pending').forEach(l => {
      const [fy, fm, fd] = l.date_from.split('-').map(Number);
      const [ty, tm, td] = (l.date_to || l.date_from).split('-').map(Number);
      let n = 0;
      for (let d = new Date(fy, fm - 1, fd); d <= new Date(ty, tm - 1, td) && n < 400; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1), n++) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        (map[key] = map[key] || []).push(l);
      }
    });
    return map;
  }, [leaves]);
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return (
    <div className="rp-leave-cal">
      <div className="rp-cal-head">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setView(new Date(y, m - 1, 1))}>&larr;</button>
        <b>{TH_MONTHS[m]} {y}</b>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setView(new Date(y, m + 1, 1))}>&rarr;</button>
      </div>
      <div className="rp-cal-grid">
        {DOW.map(d => <div key={d} className="rp-cal-dow">{d}</div>)}
        {cells.map((d, i) => {
          const key = d ? `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
          const list = key ? byDate[key] : null;
          const cls = list ? (list.some(l => l.status === 'approved') ? 'approved' : 'pending') : '';
          return (
            <div key={i} className={`rp-cal-cell ${d ? '' : 'blank'} ${cls}`} title={list ? list.map(l => `${l.leave_type} (${statusLabel(l.status)})`).join(', ') : undefined}>
              {d && <span>{d}</span>}
              {list && <em>{list[0].leave_type}</em>}
            </div>
          );
        })}
      </div>
      <div className="rp-legend"><span><i className="approved" />อนุมัติแล้ว</span><span><i className="pending" />รออนุมัติ</span></div>
    </div>
  );
}

export default function ReportEmployee() {
  const { id } = useParams();
  const { me } = useAuth();
  const isManager = me && (me.role === 'Approver' || me.role === 'Admin');
  const toast = useToast();
  const [draft, setDraft] = useState(loadFilters);
  const [applied, setApplied] = useState(loadFilters);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    setData(null); setError('');
    api.get(`/api/report/employee/${id}?${filtersToQuery(applied, { withEmployee: false })}`)
      .then(setData)
      .catch(e => setError(e.message || 'ไม่สามารถโหลดรายงานได้'));
  }, [id, applied]);

  const apply = () => {
    if (draft.period === 'custom' && draft.from && draft.to && draft.from > draft.to) { toast('วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด', 'error'); return; }
    saveFilters(draft); setApplied(draft); setFiltersOpen(false);
  };
  const reset = () => { saveFilters(DEFAULT_FILTERS); setDraft(DEFAULT_FILTERS); setApplied(DEFAULT_FILTERS); };

  const openVisit = async (vid) => {
    try { setModal(await api.get(`/api/visit-requests/${vid}`)); } catch (e) { toast(e.message, 'error'); }
  };

  const sec = visibleSections(applied.type);
  const u = data?.user;
  const otMonthly = data ? data.monthly.map(m => ({ label: `${TH_MONTHS_SHORT[Number(m.month.split('-')[1]) - 1]}${data.monthly.length > 12 ? ' ' + m.month.slice(2, 4) : ''}`, value: m.ot_hours })) : [];
  const approvedLeaveDays = data ? data.summary.leave_days : 0;

  return (
    <Layout title="Employee Report">
      <div className="rp-head rp-head-row">
        <div>
          <h2 className="rp-title">{isManager ? 'Employee Report' : 'My Report'}</h2>
          <p className="rp-sub">{u ? `${u.full_name}` : 'รายงานรายบุคคล'}</p>
        </div>
        {isManager && <Link to="/report" className="btn btn-outline">← Back to Report</Link>}
      </div>

      {error && <div className="card"><div className="card-body"><span style={{ color: 'var(--red-600)' }}>{error}</span></div></div>}
      {!data && !error && <Loading />}

      {data && (
        <>
          {/* ข้อมูลพนักงาน */}
          <div className="card rp-profile">
            <div className="rp-avatar">{u.avatar_url ? <img src={u.avatar_url} alt="" onError={e => { e.target.style.display = 'none'; }} /> : null}<span>{(u.full_name || '?').slice(0, 1)}</span></div>
            <div className="rp-profile-info">
              <div className="rp-profile-name">{u.full_name}</div>
              <div className="muted">{u.position || '-'}</div>
            </div>
            <dl className="rp-profile-meta">
              <div><dt>Department</dt><dd>{u.department || '-'}</dd></div>
              <div><dt>Employee ID</dt><dd>{u.username}</dd></div>
              <div><dt>สถานะ</dt><dd><span className={`badge ${u.is_active ? 'approved' : 'cancelled'}`}>{u.is_active ? 'ใช้งาน' : 'ระงับ'}</span></dd></div>
            </dl>
          </div>

          {/* ตัวกรองช่วงเวลา */}
          <div className="card rp-filters-card">
            <button type="button" className="rp-filter-toggle btn btn-outline" onClick={() => setFiltersOpen(o => !o)}>
              ตัวกรอง · {periodLabel(applied)} {filtersOpen ? '▲' : '▼'}
            </button>
            <div className={`rp-filters ${filtersOpen ? 'open' : ''}`}>
              <FilterFields f={draft} set={setDraft} showEmployee={false} />
              <div className="rp-filter-actions">
                <button type="button" className="btn btn-primary" onClick={apply}>Apply Filter</button>
                <button type="button" className="btn btn-outline" onClick={reset}>Reset</button>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="rp-cards rp-cards-5">
            {sec.visit && <SummaryCard icon="🚗" tone="blue" label="Customer Visit" value={data.summary.visits} unit="ครั้ง" hint="ที่อนุมัติแล้ว" />}
            {sec.leave && <SummaryCard icon="🏖" tone="gray" label="Leave" value={fmtNum(data.summary.leave_days)} unit="วัน" hint="วันลาที่อนุมัติแล้ว" />}
            {sec.attendance && <SummaryCard icon="⏱" tone="red" label="Late" value={data.summary.late} unit="ครั้ง" hint="ยอดสะสมจาก KPI" />}
            {sec.attendance && <SummaryCard icon="⛔" tone="red" label="Absent" value={data.summary.absent} unit="ครั้ง" hint="ยอดสะสมจาก KPI" />}
            {sec.ot && <SummaryCard icon="⏰" tone="orange" label="OT" value={fmtNum(data.summary.ot_hours)} unit="ชม." hint="ชั่วโมง OT ที่อนุมัติแล้ว" />}
          </div>

          {/* Activity Overview */}
          <div className="card rp-section">
            <div className="card-head"><h3>Activity Overview</h3><span className="muted rp-small">แนวโน้มรายเดือน</span></div>
            <div className="card-body"><ActivityOverview monthly={data.monthly} sections={sec} /></div>
          </div>

          {/* Visit history */}
          {sec.visit && (
            <div className="card rp-section">
              <div className="card-head"><h3>Customer Visit History</h3><span className="muted rp-small">{data.visits.length} รายการ · กดแถวเพื่อดูรายละเอียด</span></div>
              <div className="card-body">
                <table className="rp-table rp-desktop-only">
                  <thead><tr><th>วันที่</th><th>เวลาออก</th><th>เวลากลับ</th><th>บริษัทลูกค้า</th><th>วัตถุประสงค์</th><th>ไปกับใคร</th><th>สถานะ</th><th>ผู้อนุมัติ</th></tr></thead>
                  <tbody>
                    {data.visits.length ? data.visits.map(v => (
                      <tr key={v.id} className="rp-click" onClick={() => openVisit(v.id)}>
                        <td>{fmtDate(v.visit_date)}</td><td>{v.time_from}</td><td>{v.time_to}</td>
                        <td>{v.customer_name}</td><td>{v.purpose || '-'}</td><td>{v.participants || '-'}</td>
                        <td><span className={`badge ${v.status}`}>{statusLabel(v.status)}</span></td><td>{v.approver_name || '-'}</td>
                      </tr>
                    )) : <tr><td colSpan={8} className="empty">ไม่มีรายการ Visit ในช่วงเวลานี้</td></tr>}
                  </tbody>
                </table>
                <div className="rp-mobile-only">
                  {data.visits.length ? data.visits.map(v => (
                    <div className="rp-emp-card rp-click" key={v.id} onClick={() => openVisit(v.id)}>
                      <div className="rp-emp-top"><div><b>{v.customer_name}</b><div className="muted rp-small">{fmtDate(v.visit_date)} · {v.time_from}-{v.time_to}</div></div><span className={`badge ${v.status}`}>{statusLabel(v.status)}</span></div>
                      <div className="rp-small">{v.purpose || '-'}</div>
                      <div className="muted rp-small">ไปกับ: {v.participants || '-'} · ผู้อนุมัติ: {v.approver_name || '-'}</div>
                    </div>
                  )) : <div className="empty">ไม่มีรายการ Visit ในช่วงเวลานี้</div>}
                </div>
              </div>
            </div>
          )}

          {/* Attendance & Leave */}
          {(sec.leave || sec.attendance) && (
            <div className="card rp-section">
              <div className="card-head"><h3>Attendance &amp; Leave</h3><span className="muted rp-small">{data.leaves.length} รายการ</span></div>
              <div className="card-body">
                {sec.attendance && (
                  <div className="rp-info">
                    <b>มาสาย {data.summary.late} ครั้ง · ขาดงาน {data.summary.absent} ครั้ง</b> (ยอดสะสม)<br />
                    <span>{data.attendance_note}</span>
                  </div>
                )}
                {sec.leave && (
                  <>
                    <div className="rp-two">
                      <div>
                        <table className="rp-table rp-desktop-only">
                          <thead><tr><th>วันที่</th><th>ประเภท</th><th>เวลา</th><th className="num">จำนวน</th><th>เหตุผล</th><th>สถานะ</th></tr></thead>
                          <tbody>
                            {data.leaves.length ? data.leaves.map(l => (
                              <tr key={l.id}>
                                <td>{fmtDate(l.date_from)}{l.date_to !== l.date_from ? ` - ${fmtDate(l.date_to)}` : ''}</td>
                                <td>{l.leave_type}</td>
                                <td>{l.leave_mode === 'hours' ? `${l.time_from}-${l.time_to}` : (LEAVE_MODE_TH[l.leave_mode] || '-')}</td>
                                <td className="num">{leaveDuration(l)}</td>
                                <td>{l.reason || '-'}</td>
                                <td><span className={`badge ${l.status}`}>{statusLabel(l.status)}</span></td>
                              </tr>
                            )) : <tr><td colSpan={6} className="empty">ไม่มีรายการลาในช่วงเวลานี้</td></tr>}
                          </tbody>
                        </table>
                        <div className="rp-mobile-only">
                          {data.leaves.length ? data.leaves.map(l => (
                            <div className="rp-emp-card" key={l.id}>
                              <div className="rp-emp-top"><div><b>{l.leave_type}</b> · {leaveDuration(l)}<div className="muted rp-small">{fmtDate(l.date_from)}{l.date_to !== l.date_from ? ` - ${fmtDate(l.date_to)}` : ''}</div></div><span className={`badge ${l.status}`}>{statusLabel(l.status)}</span></div>
                              <div className="rp-small">{l.reason || '-'}</div>
                            </div>
                          )) : <div className="empty">ไม่มีรายการลาในช่วงเวลานี้</div>}
                        </div>
                      </div>
                      <LeaveCalendar leaves={data.leaves} />
                    </div>
                    <p className="rp-note">วันลารวมที่อนุมัติแล้วในช่วงนี้: <b>{fmtNum(approvedLeaveDays)} วัน</b> (ลารายชั่วโมงคิด 8 ชม. = 1 วัน)</p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* OT */}
          {sec.ot && (
            <div className="card rp-section">
              <div className="card-head"><h3>Overtime Report</h3><span className="muted rp-small">Total OT Hours: <b>{fmtNum(data.summary.ot_hours)} ชม.</b> (อนุมัติแล้ว)</span></div>
              <div className="card-body">
                <div className="rp-two">
                  <div>
                    <table className="rp-table rp-desktop-only">
                      <thead><tr><th>วันที่</th><th>เริ่ม</th><th>สิ้นสุด</th><th className="num">ชั่วโมง</th><th>เหตุผล</th><th>สถานะ Approval</th></tr></thead>
                      <tbody>
                        {data.ots.length ? data.ots.map(o => (
                          <tr key={o.id}>
                            <td>{fmtDate(o.ot_date)}</td><td>{o.time_from}</td><td>{o.time_to}</td><td className="num">{fmtNum(o.hours)}</td>
                            <td>{o.reason || o.work_detail || '-'}</td>
                            <td><span className={`badge ${o.status}`}>{statusLabel(o.status)}</span></td>
                          </tr>
                        )) : <tr><td colSpan={6} className="empty">ไม่มีรายการ OT ในช่วงเวลานี้</td></tr>}
                      </tbody>
                    </table>
                    <div className="rp-mobile-only">
                      {data.ots.length ? data.ots.map(o => (
                        <div className="rp-emp-card" key={o.id}>
                          <div className="rp-emp-top"><div><b>{fmtDate(o.ot_date)}</b> · {o.time_from}-{o.time_to}<div className="muted rp-small">{fmtNum(o.hours)} ชม.</div></div><span className={`badge ${o.status}`}>{statusLabel(o.status)}</span></div>
                          <div className="rp-small">{o.reason || o.work_detail || '-'}</div>
                        </div>
                      )) : <div className="empty">ไม่มีรายการ OT ในช่วงเวลานี้</div>}
                    </div>
                  </div>
                  <div>
                    <div className="rp-overview-title"><span className="rp-dot" style={{ background: '#f5a524' }} />OT รายเดือน <span className="muted">(ชม.)</span></div>
                    <MiniBarChart data={otMonthly} color="#f5a524" unit="ชม." />
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {modal && (
        <RequestModal request={modal.request} history={modal.history} customFields={modal.customFields} workflow={modal.workflow} customerSignature={modal.customer_signature} mode="calendar" onClose={() => setModal(null)} />
      )}
    </Layout>
  );
}
