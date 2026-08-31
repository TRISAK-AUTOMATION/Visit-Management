// client/src/pages/Report.jsx - เทียบเท่า public/report.html
import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { usePageContent } from '../lib/PageContentContext';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';

function pct(v, total) { return total ? Math.round((v / total) * 100) : 0; }

function DonutSVG({ data }) {
  const total = data.reduce((a, b) => a + b.value, 0) || 1;
  let cum = 0;
  const r = 60, cx = 80, cy = 80, sw = 22;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="flex gap-12" style={{ alignItems: 'center' }}>
      <svg width="160" height="160" viewBox="0 0 160 160">
        {data.map(d => {
          const frac = d.value / total;
          const dash = frac * circumference;
          const el = (
            <circle key={d.label} cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth={sw}
              strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-cum * circumference}
              transform={`rotate(-90 ${cx} ${cy})`} />
          );
          cum += frac;
          return el;
        })}
        <circle cx={cx} cy={cy} r={r - sw / 2 - 2} fill="#fff" />
      </svg>
      <div>
        {data.map(d => (
          <div key={d.label} className="flex gap-8" style={{ marginBottom: 6, fontSize: 12.5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: d.color, display: 'inline-block' }} />
            {d.label} <b style={{ marginLeft: 'auto' }}>{d.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Report() {
  const { pc } = usePageContent();
  const { me } = useAuth();
  const [requests, setRequests] = useState(null);

  useEffect(() => {
    const scope = me.role === 'Employee' ? 'mine' : 'pending';
    api.get(`/api/visit-requests?scope=${scope}`).then(r => setRequests(r.requests));
  }, [me.role]);

  if (!requests) return <Layout title={pc('report.title', 'Report')}><p className="muted">กำลังโหลดข้อมูล...</p></Layout>;

  const total = requests.length;
  const approved = requests.filter(r => r.status === 'approved').length;
  const pending = requests.filter(r => r.status === 'pending').length;
  const rejected = requests.filter(r => r.status === 'rejected').length;
  const cancelled = requests.filter(r => r.status === 'cancelled').length;

  const byCustomer = {};
  requests.forEach(r => { byCustomer[r.customer_name] = (byCustomer[r.customer_name] || 0) + 1; });
  const custEntries = Object.entries(byCustomer).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxCount = Math.max(1, ...custEntries.map(e => e[1]));

  return (
    <Layout title={pc('report.title', 'Report')}>
      <div className="stat-grid">
        <div className="stat-card blue"><div className="label">คำขอทั้งหมด</div><div className="value">{total}<span className="unit">คำขอ</span></div></div>
        <div className="stat-card green"><div className="label">อนุมัติแล้ว</div><div className="value">{approved}<span className="unit">{pct(approved, total)}%</span></div></div>
        <div className="stat-card orange"><div className="label">รออนุมัติ</div><div className="value">{pending}<span className="unit">{pct(pending, total)}%</span></div></div>
        <div className="stat-card red"><div className="label">ไม่อนุมัติ</div><div className="value">{rejected}<span className="unit">{pct(rejected, total)}%</span></div></div>
      </div>
      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>จำนวนคำขอแยกตามลูกค้า</h3></div>
          <div className="card-body">
            {custEntries.length ? custEntries.map(([name, count]) => (
              <div key={name} style={{ marginBottom: 10 }}>
                <div className="flex between" style={{ fontSize: 12.5, marginBottom: 4 }}><span>{name}</span><b>{count}</b></div>
                <div style={{ background: 'var(--bg)', borderRadius: 6, height: 10, overflow: 'hidden' }}>
                  <div style={{ width: `${(count / maxCount) * 100}%`, background: 'var(--blue-600)', height: '100%', borderRadius: 6 }} />
                </div>
              </div>
            )) : <div className="empty">ไม่มีข้อมูล</div>}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>สัดส่วนสถานะ</h3></div>
          <div className="card-body">
            <DonutSVG data={[
              { label: 'อนุมัติแล้ว', value: approved, color: '#1fae62' },
              { label: 'รออนุมัติ', value: pending, color: '#f5a524' },
              { label: 'ไม่อนุมัติ', value: rejected, color: '#f0483e' },
              { label: 'ยกเลิก', value: cancelled, color: '#9aa2b4' },
            ]} />
          </div>
        </div>
      </div>
    </Layout>
  );
}
