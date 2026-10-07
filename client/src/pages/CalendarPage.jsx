// client/src/pages/CalendarPage.jsx - เทียบเท่า public/calendar.html
// อัปเดต: แสดงทั้ง Visit และ การลา (Leave) แยกสี + ตัวกรองประเภท
// อัปเดต: คลิกวันที่ดู Visit ทั้งหมดของวันนั้น + คลิก Visit เพื่อดูรายละเอียดเต็ม (ใช้ RequestModal mode="calendar" เดิม)
// และเพิ่มช่องค้นหาชื่อลูกค้า/บริษัท (กรองฝั่ง client จากข้อมูลที่โหลดมาแล้ว ไม่มีการเรียก API เพิ่ม)
import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { usePageContent } from '../lib/PageContentContext';
import RequestModal from '../components/RequestModal';
import { useAuth } from '../lib/AuthContext';
import { api, fmtDate, statusLabel, todayLocal } from '../lib/api';
import { useToast } from '../lib/ToastContext';

const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

const LEAVE_MODE_TH = { full_day: 'เต็มวัน', half_day_morning: 'ครึ่งวัน (เช้า)', half_day_afternoon: 'ครึ่งวัน (บ่าย)', hours: 'รายชั่วโมง' };
function leaveDuration(r) {
  if (r.leave_mode === 'full_day') return `${r.duration_days} วัน`;
  if (r.leave_mode === 'half_day_morning') return 'ครึ่งวัน (เช้า)';
  if (r.leave_mode === 'half_day_afternoon') return 'ครึ่งวัน (บ่าย)';
  return `${r.duration_hours} ชม. (${r.time_from}-${r.time_to})`;
}
// ป้ายข้อความบนช่องวันที่
function evtLabel(e) {
  return e.kind === 'visit' ? e.raw.customer_name : `ลา: ${e.raw.requester_name || '-'}`;
}
function evtTitle(e) {
  const r = e.raw;
  if (e.kind === 'visit') return `${r.customer_name} ${r.time_from}-${r.time_to} · ผู้ขอ: ${r.requester_name || '-'}${r.participants ? ` · ผู้ร่วมงาน: ${r.participants}` : ''}`;
  return `${r.leave_type} · ${r.requester_name || '-'} · ${leaveDuration(r)}`;
}
// เวลาที่ใช้เรียงในรายการรายวัน (ลาเต็มวัน/ครึ่งวันไม่มีเวลา -> ขึ้นก่อน)
function evtSortKey(e) {
  return e.kind === 'visit' ? `1${e.raw.time_from || ''}` : `0${e.raw.time_from || ''}`;
}

export default function CalendarPage() {
  const { pc } = usePageContent();
  const { me } = useAuth();
  const toast = useToast();
  const [visits, setVisits] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [typeFilter, setTypeFilter] = useState('all'); // all | visit | leave
  const [viewDate, setViewDate] = useState(new Date());
  const [search, setSearch] = useState('');
  const [dayList, setDayList] = useState(null); // { dateStr, events: [...] } - รายการ Visit/ลา ของวันที่ถูกคลิก
  const [modalData, setModalData] = useState(null); // { request, history } - รายละเอียดเต็มของ Visit ที่ถูกคลิก
  const [leaveDetail, setLeaveDetail] = useState(null); // รายละเอียดการลาที่ถูกคลิก

  useEffect(() => {
    const scope = me.role === 'Employee' ? 'mine' : 'pending';
    // โหลดแยกกัน: ถ้าฝั่งใดฝั่งหนึ่งพัง อีกฝั่งยังแสดงได้
    api.get(`/api/visit-requests?scope=${scope}`)
      .then(({ requests }) => setVisits(requests.filter(r => r.status !== 'cancelled')))
      .catch(() => setVisits([]));
    api.get('/api/leave-requests/calendar/events')
      .then(({ requests }) => setLeaves(requests))
      .catch(() => setLeaves([]));
  }, [me.role]);

  // รวมเป็นรายการเดียวกัน: kind = 'visit' | 'leave' / covers(dateStr) = วันนั้นมีรายการนี้หรือไม่
  const allEvents = useMemo(() => [
    ...visits.map(v => ({ kind: 'visit', key: `v${v.id}`, id: v.id, raw: v, covers: d => v.visit_date === d })),
    ...leaves.map(l => ({ kind: 'leave', key: `l${l.id}`, id: l.id, raw: l, covers: d => d >= l.date_from && d <= (l.date_to || l.date_from) }))
  ], [visits, leaves]);

  // กรองตามประเภท + คำค้น (Visit: ชื่อลูกค้า/บริษัท | ลา: ชื่อพนักงาน/ประเภทการลา)
  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allEvents.filter(e => {
      if (typeFilter !== 'all' && e.kind !== typeFilter) return false;
      if (!q) return true;
      if (e.kind === 'visit') return (e.raw.customer_name || '').toLowerCase().includes(q);
      return (e.raw.requester_name || '').toLowerCase().includes(q) || (e.raw.leave_type || '').toLowerCase().includes(q);
    });
  }, [allEvents, typeFilter, search]);

  const cells = useMemo(() => {
    const y = viewDate.getFullYear();
    const m = viewDate.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const prevDays = new Date(y, m, 0).getDate();
    const list = [];
    for (let i = firstDay - 1; i >= 0; i--) list.push({ day: prevDays - i, other: true });
    for (let d = 1; d <= daysInMonth; d++) list.push({ day: d, other: false });
    let nextDay = 1;
    while (list.length % 7 !== 0) list.push({ day: nextDay++, other: true });
    return list;
  }, [viewDate]);

  const y = viewDate.getFullYear();
  const m = viewDate.getMonth();
  const todayStr = todayLocal();

  // เปิด modal รายละเอียดเต็มของ Visit หนึ่งรายการ (ดึงข้อมูล + ประวัติจาก API เดิมที่มีอยู่แล้ว)
  const viewRequest = async (id) => {
    try {
      const data = await api.get(`/api/visit-requests/${id}`);
      setDayList(null);
      setModalData(data);
    } catch (err) { toast(err.message, 'error'); }
  };

  const openEvent = (e) => {
    if (e.kind === 'visit') return viewRequest(e.id);
    setDayList(null);
    setLeaveDetail(e.raw);
  };

  const openDay = (dateStr, evts) => {
    if (!dateStr) return;
    setDayList({ dateStr, events: evts });
  };

  return (
    <Layout title={pc('calendar.title', 'ปฏิทิน')}>
      <div className="card">
        <div className="card-head">
          <button className="btn btn-outline btn-sm" onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>&larr;</button>
          <h3>{THAI_MONTHS[m]} {y}</h3>
          <button className="btn btn-outline btn-sm" onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>&rarr;</button>
        </div>
        <div className="card-body">
          <div className="flex between mb-16" style={{ flexWrap: 'wrap', gap: 8 }}>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อลูกค้า/บริษัท/พนักงาน..."
              style={{ width: '100%', maxWidth: 260, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 9 }} />
            <div className="cal-filter">
              {[['all', 'ทั้งหมด'], ['visit', 'Visit'], ['leave', 'การลา']].map(([k, label]) => (
                <button key={k} type="button" className={`cal-filter-btn ${typeFilter === k ? 'active' : ''} ${k}`} onClick={() => setTypeFilter(k)}>
                  {k !== 'all' && <span className={`cal-legend-dot ${k}`} />}{label}
                </button>
              ))}
            </div>
          </div>
          <div className="muted mb-16" style={{ fontSize: 12.5 }}>คลิกวันที่หรือรายการเพื่อดูรายละเอียด</div>
          <div className="cal-grid">
            {DOW.map(d => <div key={d} className="cal-head">{d}</div>)}
            {cells.map((c, i) => {
              const dateStr = c.other ? null : `${y}-${String(m + 1).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`;
              const isToday = dateStr === todayStr;
              const evts = dateStr ? filteredEvents.filter(e => e.covers(dateStr)) : [];
              return (
                <div
                  key={i}
                  className={`cal-cell ${c.other ? 'other' : ''} ${isToday ? 'today' : ''}`}
                  style={{ cursor: dateStr ? 'pointer' : 'default' }}
                  onClick={() => openDay(dateStr, evts)}
                >
                  <div className="d">{c.day}</div>
                  {evts.slice(0, 3).map(e => (
                    <div
                      key={e.key}
                      className={`cal-evt ${e.kind === 'leave' ? 'leave' : ''}`}
                      style={{ cursor: 'pointer' }}
                      title={evtTitle(e)}
                      onClick={(ev) => { ev.stopPropagation(); openEvent(e); }}
                    >
                      {evtLabel(e)}
                    </div>
                  ))}
                  {evts.length > 3 && <div className="muted" style={{ fontSize: 10 }}>+{evts.length - 3} เพิ่มเติม</div>}
                  {evts.length > 0 && (
                    <div className="cal-evt-dots">
                      {evts.slice(0, 4).map(e => <span key={e.key} className={`cal-evt-dot ${e.kind === 'leave' ? 'leave' : ''}`} />)}
                      {evts.length > 4 && <span className="cal-evt-more">+{evts.length - 4}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {dayList && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setDayList(null); }}>
          <div className="modal">
            <div className="modal-head">
              <h3>รายการวันที่ {fmtDate(dayList.dateStr)}</h3>
              <button className="modal-close" onClick={() => setDayList(null)}>&times;</button>
            </div>
            <div className="modal-body">
              {dayList.events.length ? dayList.events
                .slice()
                .sort((a, b) => evtSortKey(a).localeCompare(evtSortKey(b)))
                .map(e => (
                  <div
                    key={e.key}
                    style={{ padding: '10px 0', borderBottom: '1px dashed var(--border)', cursor: 'pointer' }}
                    onClick={() => openEvent(e)}
                  >
                    {e.kind === 'visit' ? (
                      <>
                        <div className="flex between">
                          <b><span className="cal-legend-dot visit" /> {e.raw.time_from} - {e.raw.time_to}</b>
                          <span className={`badge ${e.raw.status}`}>{statusLabel(e.raw.status)}</span>
                        </div>
                        <div>{e.raw.customer_name || '-'}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{e.raw.purpose || '-'}</div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                          ผู้ขอ: {e.raw.requester_name || '-'}{e.raw.participants ? ` · ผู้ร่วมงาน: ${e.raw.participants}` : ''}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex between">
                          <b><span className="cal-legend-dot leave" /> {e.raw.leave_type} · {leaveDuration(e.raw)}</b>
                          <span className={`badge ${e.raw.status}`}>{statusLabel(e.raw.status)}</span>
                        </div>
                        <div>{e.raw.requester_name || '-'}{e.raw.requester_department ? ` (${e.raw.requester_department})` : ''}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {e.raw.date_to && e.raw.date_to !== e.raw.date_from ? `${fmtDate(e.raw.date_from)} - ${fmtDate(e.raw.date_to)}` : fmtDate(e.raw.date_from)}
                        </div>
                      </>
                    )}
                  </div>
                )) : <p className="muted">ไม่มีรายการในวันนี้</p>}
            </div>
          </div>
        </div>
      )}

      {leaveDetail && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setLeaveDetail(null); }}>
          <div className="modal">
            <div className="modal-head">
              <h3>คำขอลา #{leaveDetail.code}</h3>
              <button className="modal-close" onClick={() => setLeaveDetail(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="flex between" style={{ marginBottom: 10 }}>
                <b>{leaveDetail.requester_name || '-'}{leaveDetail.requester_department ? ` (${leaveDetail.requester_department})` : ''}</b>
                <span className={`badge ${leaveDetail.status}`}>{statusLabel(leaveDetail.status)}</span>
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.9 }}>
                <div><span className="muted">ประเภทการลา: </span>{leaveDetail.leave_type}</div>
                <div><span className="muted">รูปแบบ: </span>{LEAVE_MODE_TH[leaveDetail.leave_mode] || leaveDetail.leave_mode}</div>
                <div><span className="muted">วันที่: </span>{fmtDate(leaveDetail.date_from)}{leaveDetail.date_to && leaveDetail.date_to !== leaveDetail.date_from ? ` - ${fmtDate(leaveDetail.date_to)}` : ''}</div>
                <div><span className="muted">ระยะเวลา: </span>{leaveDuration(leaveDetail)}</div>
                <div><span className="muted">เหตุผล: </span>{leaveDetail.reason || '-'}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalData && (
        <RequestModal
          request={modalData.request}
          history={modalData.history}
          customFields={modalData.customFields}
          workflow={modalData.workflow}
          mode="calendar"
          onClose={() => setModalData(null)}
        />
      )}
    </Layout>
  );
}
