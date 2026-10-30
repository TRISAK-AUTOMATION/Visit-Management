// client/src/pages/Dashboard.jsx
// อัปเดต: แสดงข้อมูล Visit + ลา + OT (แท็บสลับประเภท) และส่วน "สิ่งที่ต้องทำ" ของผู้อนุมัติ/ผู้ขอ
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { usePageContent } from '../lib/PageContentContext';
import { useAuth } from '../lib/AuthContext';
import { api, fmtDate, statusLabel, canAccessVisit } from '../lib/api';
import CountUp from '../components/profile/CountUp';
import RIcon from '../components/report/ReportIcons';
import ReportHubCards, { PERIODS } from '../components/report/ReportHubCards';
import './dashboard-ui.css';

const KIND_TH = { visit: 'Visit', leave: 'ลา', ot: 'OT' };
const ZERO = { total: 0, pending: 0, approved: 0, rejected: 0 };
const MY_PATH = { visit: '/my-requests', leave: '/my-leave', ot: '/my-ot' };
const APPROVE_PATH = { visit: '/approve-requests', leave: '/approve-leave', ot: '/approve-ot' };

export default function Dashboard() {
  const { pc } = usePageContent();
  const { me } = useAuth();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('all'); // all | visit | leave | ot
  const [period, setPeriod] = useState('month'); // ช่วงเวลาของตัวเลขบนการ์ดรายงาน

  useEffect(() => { api.get('/api/dashboard/stats').then(setData); }, []);

  const showVisit = canAccessVisit(me);
  const kinds = showVisit ? ['visit', 'leave', 'ot'] : ['leave', 'ot'];
  const isEmployee = me.role === 'Employee' && !me.can_approve; // พนักงานที่ถูกตั้งเป็นผู้อนุมัติใน Template นับเป็นฝั่งผู้อนุมัติ

  const stats = useMemo(() => {
    if (!data) return ZERO;
    const by = { visit: data.stats || ZERO, leave: data.leave_stats || ZERO, ot: data.ot_stats || ZERO };
    if (tab !== 'all') return by[tab];
    return kinds.reduce((a, k) => ({
      total: a.total + by[k].total, pending: a.pending + by[k].pending,
      approved: a.approved + by[k].approved, rejected: a.rejected + by[k].rejected
    }), { ...ZERO });
  }, [data, tab, showVisit]); // eslint-disable-line react-hooks/exhaustive-deps

  const inTab = (e) => (tab === 'all' ? kinds.includes(e.kind) : e.kind === tab);
  const latest = useMemo(() => (data?.latest_all || []).filter(inTab).slice(0, 5), [data, tab, showVisit]); // eslint-disable-line
  const upcoming = useMemo(() => (data?.upcoming_all || []).filter(inTab).slice(0, 5), [data, tab, showVisit]); // eslint-disable-line

  // ลิงก์ของการ์ด: แท็บเฉพาะประเภท -> ไปหน้าของประเภทนั้นพร้อมกรองสถานะ
  // แท็บ "ทั้งหมด" -> ไปประเภทแรกที่มีรายการในสถานะนั้นจริง (ไม่ใช่ Visit เสมอ ไม่งั้นจะเจอหน้าว่างทั้งที่ตัวเลขไม่ใช่ 0)
  const byKind = { visit: data?.stats || ZERO, leave: data?.leave_stats || ZERO, ot: data?.ot_stats || ZERO };
  const linkFor = (status) => {
    const kind = tab !== 'all' ? tab : (kinds.find(k => (status ? byKind[k][status] : byKind[k].total) > 0) || kinds[0]);
    // ผู้มีสิทธิ์อนุมัติเห็นของทุกคน -> พาไปหน้าอนุมัติ (มีแท็บ รออนุมัติ/อนุมัติแล้ว/ไม่อนุมัติ) ให้ตรงกับตัวเลข
    // ผู้ใช้ทั่วไปเห็นเฉพาะของตัวเอง -> พาไปหน้า "ของฉัน" พร้อมกรองสถานะ
    const isApprover = !isEmployee;
    if (isApprover) return `${APPROVE_PATH[kind]}?status=${status && status !== 'total' ? status : 'pending'}`;
    // Visit: การ์ด "อนุมัติแล้ว" นับรวมที่เสร็จสิ้นแล้วด้วย จึงใช้ approved_all (หน้า My Requests จะแสดงทั้งกำลังดำเนินการ + เสร็จสิ้น)
    if (kind === 'visit' && status === 'approved') return `${MY_PATH.visit}?status=approved_all`;
    return status ? `${MY_PATH[kind]}?status=${status}` : MY_PATH[kind];
  };

  const scopeLabel = tab === 'all'
    ? (isEmployee ? 'คำขอทั้งหมดของฉัน' : 'คำขอทั้งหมดในระบบ')
    : `${KIND_TH[tab]}ทั้งหมด${isEmployee ? 'ของฉัน' : ''}`;

  // งานที่ต้องทำ: รอฉันอนุมัติ / ถูกส่งกลับแก้ไข / แบบร่าง
  const todo = data?.todo;
  const todoRows = todo ? [
    { key: 'waiting', label: 'รอคุณอนุมัติ', cls: 'orange', to: APPROVE_PATH },
    { key: 'revision', label: 'ถูกส่งกลับให้แก้ไข', cls: 'red', to: MY_PATH },
    { key: 'draft', label: 'แบบร่างที่ยังไม่ได้ส่ง', cls: '', to: MY_PATH }
  ].map(r => ({ ...r, items: kinds.filter(k => (todo[r.key]?.[k] || 0) > 0 && (r.key !== 'waiting' || !isEmployee)) }))
    .filter(r => r.items.length) : [];

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'สวัสดีตอนเช้า' : hour < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';
  const firstName = (me.full_name || '').split(' ')[0];
  const todayText = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const pendingTotal = data ? (isEmployee ? 0 : (data.stats?.pending || 0) + (data.leave_stats?.pending || 0) + (data.ot_stats?.pending || 0)) : 0;
  const quick = [
    ...(showVisit ? [{ to: '/visit-request', label: 'สร้างคำขอ Visit', icon: 'car' }] : []),
    { to: '/leave-request', label: 'ขอลา', icon: 'calendar' },
    { to: '/ot-request', label: 'ขอ OT', icon: 'clock' }
  ];
  const STAT = [
    { k: 'total', label: scopeLabel, tone: 'blue', icon: 'sheet', val: stats.total, link: linkFor() },
    { k: 'approved', label: 'อนุมัติแล้ว', tone: 'green', icon: 'check', val: stats.approved, link: linkFor('approved') },
    { k: 'pending', label: 'รออนุมัติ', tone: 'orange', icon: 'clock', val: stats.pending, link: linkFor('pending') },
    { k: 'rejected', label: 'ไม่อนุมัติ', tone: 'red', icon: 'x', val: stats.rejected, link: linkFor('rejected') }
  ];

  return (
    <Layout title={pc('dashboard.title', 'Dashboard')}>
      <section className="rx-hero rx-rise" style={{ '--i': 0 }}>
        <span className="rx-orbs"><i className="rx-orb o1" /><i className="rx-orb o2" /><i className="rx-orb o3" /></span>
        <div className="rx-hero-text">
          <h2>{greet}, {firstName}</h2>
          <p>{todayText}{pendingTotal > 0 ? ` · มี ${pendingTotal} รายการรอการอนุมัติ` : ''}</p>
        </div>
        <div className="dx-quick">
          {quick.map(q => <Link key={q.to} to={q.to} className="dx-quick-btn"><RIcon name={q.icon} size={16} />{q.label}</Link>)}
        </div>
      </section>

      {!data ? (
        <div className="dx-skel-row"><span className="rx-skel" /><span className="rx-skel" /><span className="rx-skel" /><span className="rx-skel" /></div>
      ) : (
        <>
          <div className="dx-sechead rx-rise" style={{ '--i': 1 }}>
            <h3>ภาพรวมคำขอ</h3>
            <div className="dx-tabs">
              {['all', ...kinds].map(t => (
                <button key={t} type="button" className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'all' ? 'ทั้งหมด' : KIND_TH[t]}</button>
              ))}
            </div>
          </div>

          <div className="dx-stats">
            {STAT.map((c, i) => (
              <Link key={c.k} to={c.link} className={`dx-stat tone-${c.tone} rx-rise`} style={{ '--i': i + 2 }}>
                <span className="dx-stat-ico"><RIcon name={c.icon} size={22} /></span>
                <div>
                  <div className="dx-stat-label">{c.label}</div>
                  <div className="dx-stat-value"><b><CountUp key={`${tab}-${c.k}-${c.val}`} value={c.val} /></b><small>คำขอ</small></div>
                </div>
                <span className="dx-stat-go">ดูทั้งหมด &rarr;</span>
              </Link>
            ))}
          </div>

          {todoRows.length > 0 && (
            <div className="dx-card rx-rise" style={{ '--i': 6 }}>
              <div className="dx-card-head"><h3>สิ่งที่ต้องทำ</h3></div>
              <div className="dx-todo">
                {todoRows.map(r => (
                  <div key={r.key} className="dx-todo-row">
                    <span className={`dx-dot ${r.cls}`} /><b>{r.label}</b>
                    <div className="dx-todo-chips">
                      {r.items.map(k => (
                        <Link key={k} to={r.to[k]} className="dx-chip">{KIND_TH[k]} <b>{todo[r.key][k]}</b></Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="dx-sechead rx-rise" style={{ '--i': 7 }}>
            <h3>รายงาน <span className="muted">Reports</span></h3>
            <div className="dx-tabs" role="tablist" aria-label="ช่วงเวลาของตัวเลขบนการ์ดรายงาน">
              {PERIODS.map(p => <button key={p.v} type="button" role="tab" aria-selected={period === p.v} className={period === p.v ? 'on' : ''} onClick={() => setPeriod(p.v)}>{p.label}</button>)}
            </div>
          </div>
          <ReportHubCards period={period} baseDelay={8} />

          <div className="dx-two">
            <div className="dx-card rx-rise" style={{ '--i': 14 }}>
              <div className="dx-card-head">
                <h3>คำขอล่าสุด</h3>
                {tab !== 'all' && <Link to={MY_PATH[tab]}>ดูทั้งหมด &rarr;</Link>}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr><th>วันที่</th><th>รายการ</th><th>เวลา</th><th>สถานะ</th></tr></thead>
                  <tbody>
                    {latest.length ? latest.map(v => (
                      <tr key={`${v.kind}-${v.id}`}>
                        <td>{fmtDate(v.date)}</td>
                        <td><span className={`dx-kind k-${v.kind}`}>{KIND_TH[v.kind]}</span>{v.title}</td>
                        <td>{v.time}</td>
                        <td><span className={`badge ${v.status}`}>{statusLabel(v.status)}</span></td>
                      </tr>
                    )) : <tr><td colSpan={4} className="empty">ยังไม่มีคำขอ</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="dx-card rx-rise" style={{ '--i': 15 }}>
              <div className="dx-card-head"><h3>กำหนดการที่จะถึง</h3></div>
              <div className="dx-upcoming">
                {upcoming.length ? upcoming.map(v => (
                  <div className="dx-up" key={`${v.kind}-${v.id}`}>
                    <div className="dx-up-date"><b>{fmtDate(v.date).slice(0, 2)}</b><small>{fmtDate(v.date).slice(3, 5)}</small></div>
                    <div>
                      <div className="dx-up-title"><span className={`dx-kind k-${v.kind}`}>{KIND_TH[v.kind]}</span>{v.title}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{fmtDate(v.date)} · {v.time}</div>
                    </div>
                  </div>
                )) : <div className="empty">ยังไม่มีกำหนดการ</div>}
              </div>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
