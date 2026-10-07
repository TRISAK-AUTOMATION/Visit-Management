// client/src/pages/Dashboard.jsx
// อัปเดต: แสดงข้อมูล Visit + ลา + OT (แท็บสลับประเภท) และส่วน "สิ่งที่ต้องทำ" ของผู้อนุมัติ/ผู้ขอ
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { usePageContent } from '../lib/PageContentContext';
import { useAuth } from '../lib/AuthContext';
import { api, fmtDate, statusLabel, canAccessVisit } from '../lib/api';

const KIND_TH = { visit: 'Visit', leave: 'ลา', ot: 'OT' };
const ZERO = { total: 0, pending: 0, approved: 0, rejected: 0 };
const MY_PATH = { visit: '/my-requests', leave: '/my-leave', ot: '/my-ot' };
const APPROVE_PATH = { visit: '/approve-requests', leave: '/approve-leave', ot: '/approve-ot' };

export default function Dashboard() {
  const { pc } = usePageContent();
  const { me } = useAuth();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('all'); // all | visit | leave | ot

  useEffect(() => { api.get('/api/dashboard/stats').then(setData); }, []);

  const showVisit = canAccessVisit(me);
  const kinds = showVisit ? ['visit', 'leave', 'ot'] : ['leave', 'ot'];
  const isEmployee = me.role === 'Employee';

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
    const isApprover = !isEmployee || (kind === 'leave' && me.can_approve_leave);
    if (isApprover) return `${APPROVE_PATH[kind]}?status=${status && status !== 'total' ? status : 'pending'}`;
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
  ].map(r => ({ ...r, items: kinds.filter(k => (todo[r.key]?.[k] || 0) > 0 && (r.key !== 'waiting' || k !== 'leave' || me.can_approve_leave)) }))
    .filter(r => r.items.length) : [];

  return (
    <Layout title={pc('dashboard.title', 'Dashboard')}>
      {!data ? <p className="muted">กำลังโหลดข้อมูล...</p> : (
        <>
          <div className="tabs">
            {['all', ...kinds].map(t => (
              <div key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t === 'all' ? 'ทั้งหมด' : KIND_TH[t]}</div>
            ))}
          </div>

          <div className="stat-grid">
            <div className="stat-card blue">
              <div className="label">{scopeLabel}</div>
              <div className="value">{stats.total}<span className="unit">คำขอ</span></div>
              <Link className="more" to={linkFor()}>ดูทั้งหมด &rarr;</Link>
            </div>
            <div className="stat-card green">
              <div className="label">อนุมัติแล้ว</div>
              <div className="value">{stats.approved}<span className="unit">คำขอ</span></div>
              <Link className="more" to={linkFor('approved')}>ดูทั้งหมด &rarr;</Link>
            </div>
            <div className="stat-card orange">
              <div className="label">รออนุมัติ</div>
              <div className="value">{stats.pending}<span className="unit">คำขอ</span></div>
              <Link className="more" to={linkFor('pending')}>ดูทั้งหมด &rarr;</Link>
            </div>
            <div className="stat-card red">
              <div className="label">ไม่อนุมัติ</div>
              <div className="value">{stats.rejected}<span className="unit">คำขอ</span></div>
              <Link className="more" to={linkFor('rejected')}>ดูทั้งหมด &rarr;</Link>
            </div>
          </div>

          {todoRows.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-head"><h3>สิ่งที่ต้องทำ</h3></div>
              <div className="card-body">
                {todoRows.map(r => (
                  <div key={r.key} className="flex between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
                    <b>{r.label}</b>
                    <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
                      {r.items.map(k => (
                        <Link key={k} to={r.to[k]} className="tab" style={{ textDecoration: 'none' }}>
                          {KIND_TH[k]} <b>{todo[r.key][k]}</b>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid-2">
            <div className="card">
              <div className="card-head">
                <h3>คำขอล่าสุด</h3>
                {tab !== 'all' && <Link to={MY_PATH[tab]}>ดูทั้งหมด &rarr;</Link>}
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                <table>
                  <thead><tr><th>วันที่</th><th>รายการ</th><th>เวลา</th><th>สถานะ</th></tr></thead>
                  <tbody>
                    {latest.length ? latest.map(v => (
                      <tr key={`${v.kind}-${v.id}`}>
                        <td>{fmtDate(v.date)}</td>
                        <td><span className="muted" style={{ fontSize: 11, marginRight: 6 }}>{KIND_TH[v.kind]}</span>{v.title}</td>
                        <td>{v.time}</td>
                        <td><span className={`badge ${v.status}`}>{statusLabel(v.status)}</span></td>
                      </tr>
                    )) : <tr><td colSpan={4} className="empty">ยังไม่มีคำขอ</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h3>กำหนดการที่จะถึง</h3></div>
              <div className="card-body">
                {upcoming.length ? upcoming.map(v => (
                  <div className="flex gap-12" key={`${v.kind}-${v.id}`} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div className="pill-avatar">{fmtDate(v.date).slice(0, 2)}</div>
                    <div>
                      <div style={{ fontWeight: 600 }}><span className="muted" style={{ fontSize: 11, marginRight: 6 }}>{KIND_TH[v.kind]}</span>{v.title}</div>
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
