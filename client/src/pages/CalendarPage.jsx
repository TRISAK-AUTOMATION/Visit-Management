// client/src/pages/CalendarPage.jsx - เทียบเท่า public/calendar.html
// อัปเดต: คลิกวันที่ดู Visit ทั้งหมดของวันนั้น + คลิก Visit เพื่อดูรายละเอียดเต็ม (ใช้ RequestModal mode="calendar" เดิม)
// และเพิ่มช่องค้นหาชื่อลูกค้า/บริษัท (กรองฝั่ง client จากข้อมูลที่โหลดมาแล้ว ไม่มีการเรียก API เพิ่ม)
import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import RequestModal from '../components/RequestModal';
import { useAuth } from '../lib/AuthContext';
import { api, fmtDate, statusLabel } from '../lib/api';
import { useToast } from '../lib/ToastContext';

const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

export default function CalendarPage() {
  const { me } = useAuth();
  const toast = useToast();
  const [events, setEvents] = useState([]);
  const [viewDate, setViewDate] = useState(new Date());
  const [search, setSearch] = useState('');
  const [dayList, setDayList] = useState(null); // { dateStr, events: [...] } - รายการ Visit ของวันที่ถูกคลิก
  const [modalData, setModalData] = useState(null); // { request, history } - รายละเอียดเต็มของ Visit ที่ถูกคลิก

  useEffect(() => {
    const scope = me.role === 'Employee' ? 'mine' : 'pending';
    api.get(`/api/visit-requests?scope=${scope}`).then(({ requests }) => {
      setEvents(requests.filter(r => r.status !== 'cancelled'));
    });
  }, [me.role]);

  // กรองตามชื่อลูกค้า/บริษัทที่ค้นหา (ถ้ามี)
  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events;
    return events.filter(e => (e.customer_name || '').toLowerCase().includes(q));
  }, [events, search]);

  const cells = useMemo(() => {
    const y = viewDate.getFullYear();
    const m = viewDate.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const prevDays = new Date(y, m, 0).getDate();
    const list = [];
    for (let i = firstDay - 1; i >= 0; i--) list.push({ day: prevDays - i, other: true });
    for (let d = 1; d <= daysInMonth; d++) list.push({ day: d, other: false });
    while (list.length % 7 !== 0) list.push({ day: list.length, other: true });
    return list;
  }, [viewDate]);

  const y = viewDate.getFullYear();
  const m = viewDate.getMonth();
  const todayStr = new Date().toISOString().slice(0, 10);

  // เปิด modal รายละเอียดเต็มของ Visit หนึ่งรายการ (ดึงข้อมูล + ประวัติจาก API เดิมที่มีอยู่แล้ว)
  const viewRequest = async (id) => {
    try {
      const data = await api.get(`/api/visit-requests/${id}`);
      setDayList(null);
      setModalData(data);
    } catch (err) { toast(err.message, 'error'); }
  };

  const openDay = (dateStr, evts) => {
    if (!dateStr) return;
    setDayList({ dateStr, events: evts });
  };

  return (
    <Layout title="ปฏิทิน">
      <div className="card">
        <div className="card-head">
          <button className="btn btn-outline btn-sm" onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>&larr;</button>
          <h3>{THAI_MONTHS[m]} {y}</h3>
          <button className="btn btn-outline btn-sm" onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>&rarr;</button>
        </div>
        <div className="card-body">
          <div className="flex between mb-16" style={{ flexWrap: 'wrap', gap: 8 }}>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อลูกค้า/บริษัท..."
              style={{ width: 260, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 9 }} />
            <span className="muted" style={{ fontSize: 12.5 }}>คลิกวันที่หรือรายการเพื่อดูรายละเอียด</span>
          </div>
          <div className="cal-grid">
            {DOW.map(d => <div key={d} className="cal-head">{d}</div>)}
            {cells.map((c, i) => {
              const dateStr = c.other ? null : `${y}-${String(m + 1).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`;
              const isToday = dateStr === todayStr;
              const evts = dateStr ? filteredEvents.filter(e => e.visit_date === dateStr) : [];
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
                      key={e.id}
                      className="cal-evt"
                      style={{ cursor: 'pointer' }}
                      title={`${e.customer_name} ${e.time_from}-${e.time_to}`}
                      onClick={(ev) => { ev.stopPropagation(); viewRequest(e.id); }}
                    >
                      {e.customer_name}
                    </div>
                  ))}
                  {evts.length > 3 && <div className="muted" style={{ fontSize: 10 }}>+{evts.length - 3} เพิ่มเติม</div>}
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
              <h3>Visit วันที่ {fmtDate(dayList.dateStr)}</h3>
              <button className="modal-close" onClick={() => setDayList(null)}>&times;</button>
            </div>
            <div className="modal-body">
              {dayList.events.length ? dayList.events
                .slice()
                .sort((a, b) => a.time_from.localeCompare(b.time_from))
                .map(e => (
                  <div
                    key={e.id}
                    style={{ padding: '10px 0', borderBottom: '1px dashed var(--border)', cursor: 'pointer' }}
                    onClick={() => viewRequest(e.id)}
                  >
                    <div className="flex between">
                      <b>{e.time_from} - {e.time_to}</b>
                      <span className={`badge ${e.status}`}>{statusLabel(e.status)}</span>
                    </div>
                    <div>{e.customer_name || '-'}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{e.purpose || '-'}</div>
                  </div>
                )) : <p className="muted">ไม่มี Visit ในวันนี้</p>}
            </div>
          </div>
        </div>
      )}

      {modalData && (
        <RequestModal
          request={modalData.request}
          history={modalData.history}
          customFields={modalData.customFields}
          mode="calendar"
          onClose={() => setModalData(null)}
        />
      )}
    </Layout>
  );
}
