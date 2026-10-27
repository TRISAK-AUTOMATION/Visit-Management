import React from 'react';
import { Link } from 'react-router-dom';
import { fmtDate, statusLabel } from '../../lib/api';

const PATH = { visit: '/my-requests', leave: '/my-leave', ot: '/my-ot' };
const KIND = { visit: 'Visit', leave: 'ลา', ot: 'OT' };

export default function RecentRequests({ rows }) {
  return (
    <section className="pd-card" aria-label="คำขอล่าสุด">
      <div className="pd-card-head"><h3>คำขอล่าสุดของฉัน</h3></div>
      {rows.length === 0 ? <div className="pd-empty">ยังไม่มีคำขอ</div> : (
        <div className="pd-table-wrap">
          <table className="pd-table">
            <thead><tr><th>ประเภท</th><th>รายการ</th><th>วันที่</th><th>สถานะ</th><th><span className="sr-only">รายละเอียด</span></th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={`${r.kind}-${r.id}`}>
                  <td><span className={`pd-kind k-${r.kind}`}>{KIND[r.kind]}</span></td>
                  <td><div className="pd-ttl">{r.title || '-'}</div><div className="muted" style={{ fontSize: 11 }}>{r.code}</div></td>
                  <td>{fmtDate(r.d)}{r.d2 && r.d2 !== r.d ? ` – ${fmtDate(r.d2)}` : ''}</td>
                  <td><span className={`badge ${r.status}`}>{r.status === 'completed' ? 'Visit Completed' : statusLabel(r.status)}</span></td>
                  <td><Link to={`${PATH[r.kind]}?status=${r.status === 'completed' ? 'completed' : r.status}`}>ดู</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="pd-viewall">
        <Link to="/my-leave">ลาทั้งหมด</Link> · <Link to="/my-ot">OT ทั้งหมด</Link>
      </div>
    </section>
  );
}
