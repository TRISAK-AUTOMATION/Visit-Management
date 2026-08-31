// client/src/pages/Dashboard.jsx - เทียบเท่า public/dashboard.html
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { usePageContent } from '../lib/PageContentContext';
import { useAuth } from '../lib/AuthContext';
import { api, fmtDate, statusLabel } from '../lib/api';

export default function Dashboard() {
  const { pc } = usePageContent();
  const { me } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => { api.get('/api/dashboard/stats').then(setData); }, []);

  const scopeLabel = me.role === 'Employee' ? 'คำขอทั้งหมดของฉัน' : 'คำขอทั้งหมดในระบบ';

  return (
    <Layout title={pc('dashboard.title', 'Dashboard')}>
      {!data ? <p className="muted">กำลังโหลดข้อมูล...</p> : (
        <>
          <div className="stat-grid">
            <div className="stat-card blue">
              <div className="label">{scopeLabel}</div>
              <div className="value">{data.stats.total}<span className="unit">คำขอ</span></div>
              <Link className="more" to="/my-requests">ดูทั้งหมด &rarr;</Link>
            </div>
            <div className="stat-card green">
              <div className="label">อนุมัติแล้ว</div>
              <div className="value">{data.stats.approved}<span className="unit">คำขอ</span></div>
              <Link className="more" to="/my-requests">ดูทั้งหมด &rarr;</Link>
            </div>
            <div className="stat-card orange">
              <div className="label">รออนุมัติ</div>
              <div className="value">{data.stats.pending}<span className="unit">คำขอ</span></div>
              <Link className="more" to={me.role === 'Employee' ? '/my-requests' : '/approve-requests'}>ดูทั้งหมด &rarr;</Link>
            </div>
            <div className="stat-card red">
              <div className="label">ไม่อนุมัติ</div>
              <div className="value">{data.stats.rejected}<span className="unit">คำขอ</span></div>
              <Link className="more" to="/my-requests">ดูทั้งหมด &rarr;</Link>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-head">
                <h3>คำขอล่าสุด</h3>
                <Link to="/my-requests">ดูทั้งหมด &rarr;</Link>
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                <table>
                  <thead><tr><th>วันที่</th><th>ลูกค้า/บริษัท</th><th>เวลา</th><th>สถานะ</th></tr></thead>
                  <tbody>
                    {data.latest.length ? data.latest.map(v => (
                      <tr key={v.id}>
                        <td>{fmtDate(v.visit_date)}</td>
                        <td>{v.customer_name}</td>
                        <td>{v.time_from} - {v.time_to}</td>
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
                {data.upcoming.length ? data.upcoming.map(v => (
                  <div className="flex gap-12" key={v.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div className="pill-avatar">{fmtDate(v.visit_date).slice(0, 2)}</div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{v.customer_name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{fmtDate(v.visit_date)} · {v.time_from} - {v.time_to}</div>
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
