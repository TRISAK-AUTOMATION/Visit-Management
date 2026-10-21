// client/src/pages/CalendarPage.jsx - ปฏิทินรวม Visit / การลา / OT
// ดีไซน์: ตารางรายเดือน + ค้นหา + ตัวกรอง (ทั้งหมด/Visit/การลา/OT) + ป๊อปอัปรายวัน 3 คอลัมน์ + การ์ดรายละเอียดแยกตามประเภท
import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { usePageContent } from '../lib/PageContentContext';
import { api, fmtDate, statusLabel, todayLocal } from '../lib/api';
import { useToast } from '../lib/ToastContext';

const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const KINDS = [
  { k: 'leave', label: 'การลา' },
  { k: 'visit', label: 'Visit' },
  { k: 'ot', label: 'OT' }
];
const KIND_LABEL = { leave: 'การลา', visit: 'Visit', ot: 'OT' };
const LEAVE_MODE_TH = { full_day: 'เต็มวัน', half_day_morning: 'ครึ่งวัน (เช้า)', half_day_afternoon: 'ครึ่งวัน (บ่าย)', hours: 'รายชั่วโมง' };

function leaveDuration(r) {
  if (r.leave_mode === 'full_day') return `${r.duration_days} วัน`;
  if (r.leave_mode === 'half_day_morning') return 'ครึ่งวัน (เช้า)';
  if (r.leave_mode === 'half_day_afternoon') return 'ครึ่งวัน (บ่าย)';
  return `${r.duration_hours} ชม. (${r.time_from}-${r.time_to})`;
}
function leaveRange(r) {
  return r.date_to && r.date_to !== r.date_from ? `${fmtDate(r.date_from)} - ${fmtDate(r.date_to)}` : fmtDate(r.date_from);
}
function initials(name) {
  const s = String(name || '?').trim();
  return s ? Array.from(s)[0].toUpperCase() : '?';
}

// ข้อความหลัก/รองของแต่ละรายการ
function evtText(e) {
  const r = e.raw;
  if (e.kind === 'visit') return { name: r.requester_name || '-', tag: r.customer_name || 'Visit', sub: `${r.time_from || ''}${r.time_to ? ` - ${r.time_to}` : ''}${r.purpose ? ` · ${r.purpose}` : ''}` };
  if (e.kind === 'leave') return { name: r.requester_name || '-', tag: r.leave_type || 'ลา', sub: leaveDuration(r) };
  return { name: r.requester_name || '-', tag: 'OT', sub: `${r.time_from || ''}${r.time_to ? ` - ${r.time_to}` : ''}${r.hours ? ` · ${r.hours} ชม.` : ''}` };
}
function chipLabel(e) {
  const t = evtText(e);
  return e.kind === 'visit' ? `Visit: ${t.tag}` : e.kind === 'leave' ? `${t.tag}: ${t.name}` : `OT: ${t.name}`;
}

export default function CalendarPage() {
  const { pc } = usePageContent();
  const toast = useToast();
  const [events, setEvents] = useState({ visit: [], leave: [], ot: [] });
  const [typeFilter, setTypeFilter] = useState('all');
  const [viewDate, setViewDate] = useState(new Date());
  const [search, setSearch] = useState('');
  const [dayList, setDayList] = useState(null); // { dateStr, events }
  const [detail, setDetail] = useState(null);   // event

  useEffect(() => {
    const load = (kind, url) => api.get(url)
      .then(({ requests }) => setEvents(s => ({ ...s, [kind]: requests || [] })))
      .catch(err => { setEvents(s => ({ ...s, [kind]: [] })); if (kind === 'visit') toast(err.message, 'error'); });
    load('visit', '/api/visit-requests/calendar/events');
    load('leave', '/api/leave-requests/calendar/events');
    load('ot', '/api/ot-requests/calendar/events');
    // eslint-disable-next-line
  }, []);

  const allEvents = useMemo(() => [
    ...events.visit.map(v => ({ kind: 'visit', key: `v${v.id}`, raw: v, covers: d => v.visit_date === d })),
    ...events.leave.map(l => ({ kind: 'leave', key: `l${l.id}`, raw: l, covers: d => d >= l.date_from && d <= (l.date_to || l.date_from) })),
    ...events.ot.map(o => ({ kind: 'ot', key: `o${o.id}`, raw: o, covers: d => o.ot_date === d }))
  ], [events]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allEvents.filter(e => {
      if (typeFilter !== 'all' && e.kind !== typeFilter) return false;
      if (!q) return true;
      const r = e.raw;
      return [r.requester_name, r.customer_name, r.leave_type, r.purpose, r.work_detail, r.code].some(x => String(x || '').toLowerCase().includes(q));
    });
  }, [allEvents, typeFilter, search]);

  const y = viewDate.getFullYear();
  const m = viewDate.getMonth();
  const todayStr = todayLocal();

  const cells = useMemo(() => {
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const prevDays = new Date(y, m, 0).getDate();
    const list = [];
    for (let i = firstDay - 1; i >= 0; i--) list.push({ day: prevDays - i, other: true });
    for (let d = 1; d <= daysInMonth; d++) list.push({ day: d, other: false });
    let n = 1;
    while (list.length % 7 !== 0) list.push({ day: n++, other: true });
    return list;
  }, [y, m]);

  const openEvent = (e) => setDetail(e); // เก็บ dayList ไว้ เพื่อให้ปุ่ม "กลับ" ย้อนมารายการของวันได้

  return (
    <Layout title={pc('calendar.title', 'ปฏิทิน')}>
      <div className="card cx-card">
        <div className="cx-toolbar">
          <div className="cx-nav">
            <button className="cx-navbtn" aria-label="เดือนก่อนหน้า" onClick={() => setViewDate(new Date(y, m - 1, 1))}>&lsaquo;</button>
            <h3>{THAI_MONTHS[m]} {y + 543}</h3>
            <button className="cx-navbtn" aria-label="เดือนถัดไป" onClick={() => setViewDate(new Date(y, m + 1, 1))}>&rsaquo;</button>
            <button className="cx-today" onClick={() => setViewDate(new Date())}>วันนี้</button>
          </div>
          <input className="cx-search" type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อ / ลูกค้า / ประเภทการลา..." />
          <div className="cx-pills">
            <button type="button" className={`cx-pill ${typeFilter === 'all' ? 'active' : ''}`} onClick={() => setTypeFilter('all')}>ทั้งหมด</button>
            {[['visit', 'Visit'], ['leave', 'การลา'], ['ot', 'OT']].map(([k, label]) => (
              <button key={k} type="button" className={`cx-pill ${typeFilter === k ? 'active' : ''}`} onClick={() => setTypeFilter(k)}>
                <span className={`cx-dot ${k}`} />{label}
              </button>
            ))}
          </div>
        </div>

        <div className="cx-scroll">
          <div className="cx-grid">
            {DOW.map(d => <div key={d} className="cx-dow">{d}</div>)}
            {cells.map((c, i) => {
              const dateStr = c.other ? null : `${y}-${String(m + 1).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`;
              const evts = dateStr ? filtered.filter(e => e.covers(dateStr)) : [];
              return (
                <div key={i} className={`cx-cell ${c.other ? 'other' : ''} ${dateStr === todayStr ? 'today' : ''}`}
                  onClick={() => dateStr && setDayList({ dateStr, events: evts })}>
                  <div className="cx-d">{c.day}</div>
                  {evts.slice(0, 3).map(e => (
                    <div key={e.key} className={`cx-chip ${e.kind}`} title={chipLabel(e)} onClick={(ev) => { ev.stopPropagation(); openEvent(e); }}>
                      {chipLabel(e)}
                    </div>
                  ))}
                  {evts.length > 3 && <div className="cx-more">+{evts.length - 3} เพิ่มเติม</div>}
                  {evts.length > 0 && (
                    <div className="cx-dots">
                      {evts.slice(0, 4).map(e => <span key={e.key} className={`cx-dot ${e.kind}`} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {dayList && !detail && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setDayList(null); }}>
          <div className="modal cx-modal-wide">
            <div className="modal-head">
              <h3>รายการวันที่ {fmtDate(dayList.dateStr)}</h3>
              <button className="modal-close" onClick={() => setDayList(null)}>&times;</button>
            </div>
            <div className="modal-body">
              {dayList.events.length === 0 ? <p className="muted" style={{ margin: 0 }}>ไม่มีรายการในวันนี้</p> : (
                <div className="cx-cols">
                  {KINDS.map(({ k, label }) => {
                    const list = dayList.events.filter(e => e.kind === k);
                    return (
                      <div key={k} className="cx-col">
                        <div className="cx-col-head"><span className={`cx-dot ${k}`} />{label}<span className="cx-count">{list.length}</span></div>
                        {list.length === 0 ? <div className="cx-empty">ไม่มี</div> : list.map(e => {
                          const t = evtText(e);
                          return (
                            <div key={e.key} className="cx-item" onClick={() => openEvent(e)}>
                              <span className={`cx-avatar ${k}`}>{initials(t.name)}</span>
                              <div className="cx-item-main">
                                <div className="cx-item-name">{t.name}</div>
                                <div className="cx-item-sub"><span className={`cx-tag ${k}`}>{t.tag}</span> {t.sub}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {detail && <DetailCard e={detail} onClose={() => { setDetail(null); setDayList(null); }} onBack={dayList ? () => setDetail(null) : null} />}
    </Layout>
  );
}

function Row({ label, children }) {
  return <div className="cx-row"><span className="cx-row-l">{label}</span><span className="cx-row-v">{children || '-'}</span></div>;
}

function DetailCard({ e, onClose, onBack }) {
  const r = e.raw;
  const note = e.kind === 'visit' ? (r.notes || r.purpose) : e.kind === 'leave' ? r.reason : (r.work_detail || r.reason || r.notes);
  const noteLabel = e.kind === 'leave' ? 'เหตุผล' : e.kind === 'ot' ? 'รายละเอียดงาน' : 'หมายเหตุ';
  return (
    <div className="modal-bg" onClick={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div className="modal cx-modal-detail">
        <div className="modal-head">
          <h3>
            {onBack && <button type="button" className="cx-back" onClick={onBack}>&lsaquo; กลับ</button>}
            <span className={`cx-dot ${e.kind}`} /> {KIND_LABEL[e.kind]} #{r.code}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="cx-who">
            <span className={`cx-avatar lg ${e.kind}`}>{initials(r.requester_name)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{r.requester_name || '-'}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>{r.requester_department || ''}</div>
            </div>
            <span className={`badge ${r.status}`}>{statusLabel(r.status)}</span>
          </div>
          <div className="cx-rows">
            {e.kind === 'visit' && (<>
              <Row label="ลูกค้า / บริษัท">{r.customer_name}</Row>
              <Row label="วันที่">{fmtDate(r.visit_date)}</Row>
              <Row label="เวลา">{r.time_from}{r.time_to ? ` - ${r.time_to}` : ''}</Row>
              <Row label="วัตถุประสงค์">{r.purpose}</Row>
              <Row label="สถานที่">{r.location}</Row>
              <Row label="ผู้ร่วมงาน">{r.participants}</Row>
            </>)}
            {e.kind === 'leave' && (<>
              <Row label="ประเภทการลา">{r.leave_type}</Row>
              <Row label="รูปแบบ">{LEAVE_MODE_TH[r.leave_mode] || r.leave_mode}</Row>
              <Row label="วันที่">{leaveRange(r)}</Row>
              <Row label="ระยะเวลา">{leaveDuration(r)}</Row>
              {r.has_attachment && <Row label="ไฟล์แนบ">มีไฟล์แนบ</Row>}
            </>)}
            {e.kind === 'ot' && (<>
              <Row label="วันที่">{fmtDate(r.ot_date)}</Row>
              <Row label="เวลา">{r.time_from}{r.time_to ? ` - ${r.time_to}` : ''}</Row>
              <Row label="จำนวนชั่วโมง">{r.hours ? `${r.hours} ชม.` : ''}</Row>
              <Row label="ประเภท OT">{r.ot_type}</Row>
              <Row label="สถานที่">{r.location}</Row>
            </>)}
            {r.status === 'approved'
              ? <Row label="ผู้อนุมัติ">{r.approver_name}</Row>
              : <Row label="สถานะ">{r.waiting_for ? `รอ ${r.waiting_for} อนุมัติ` : statusLabel(r.status)}</Row>}
          </div>
          <div className="cx-note">
            <div className="cx-note-l">{noteLabel}</div>
            <div>{note || '-'}</div>
            {e.kind === 'leave' && r.approval_note && <div className="muted" style={{ marginTop: 6, fontSize: 12.5 }}>หมายเหตุผู้อนุมัติ: {r.approval_note}</div>}
          </div>
          <div style={{ textAlign: 'right', marginTop: 14 }}>
            <button className="btn btn-primary" onClick={onClose}>ปิด</button>
          </div>
        </div>
      </div>
    </div>
  );
}
