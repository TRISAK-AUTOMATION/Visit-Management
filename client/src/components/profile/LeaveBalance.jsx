import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from './Modal';
import CountUp from './CountUp';

const fmt = (n) => (Math.round((n || 0) * 100) / 100).toString();
const TONE = { 'ลาพักร้อน': 'blue', 'ลากิจ': 'orange', 'ลาป่วย': 'red' };

export default function LeaveBalance({ leave, totals, startDate }) {
  const [detail, setDetail] = useState(null);
  const hasAny = leave.some(l => l.total > 0 || l.used > 0 || l.pending_days > 0);
  const t = totals || { days: 0, hours: 0, counts: {} };
  const c = t.counts || {};
  return (
    <section className="pd-card" aria-label="สิทธิ์วันลา">
      <div className="pd-card-head">
        <h3>สรุปวันลา (ปีนี้)</h3>
        <Link to="/my-leave">ประวัติการลา →</Link>
      </div>
      {!hasAny && <div className="pd-empty">ยังไม่มีสิทธิ์วันลา{startDate ? '' : ' (ยังไม่ได้ตั้งวันเริ่มงาน) — โปรดติดต่อผู้ดูแลระบบ'}</div>}
      <div className="pd-lt-grid">
        {leave.map(l => (
          <button type="button" key={l.type} className={`pd-lt ${TONE[l.type]}`} onClick={() => setDetail(l)} aria-label={`ดูรายละเอียด ${l.type}`}>
            <span className="pd-lt-label">{l.type}คงเหลือ</span>
            <span className="pd-lt-val"><b><CountUp value={l.remaining} /></b> / {fmt(l.total)} วัน</span>
            {l.pending_days > 0 && <span className="pd-lt-sub">รออนุมัติ {fmt(l.pending_days)} วัน</span>}
          </button>
        ))}
        <div className="pd-lt teal"><span className="pd-lt-label">รวมวันลาสะสม</span><span className="pd-lt-val"><b><CountUp value={t.days} /></b> วัน</span></div>
        <div className="pd-lt purple"><span className="pd-lt-label">รวมชั่วโมงลาสะสม</span><span className="pd-lt-val"><b><CountUp value={t.hours} /></b> ชม.</span></div>
        <div className="pd-lt slate"><span className="pd-lt-label">ครั้งที่ลา (ปีนี้)</span><span className="pd-lt-val sm">กิจ <b>{c.personal || 0}</b> · ป่วย <b>{c.sick || 0}</b></span></div>
      </div>
      {detail && (
        <Modal title={`รายละเอียด ${detail.type}`} onClose={() => setDetail(null)} width={400} labelId="pd-leave-title">
          <table className="pd-kv"><tbody>
            <tr><td>สิทธิ์ทั้งหมด</td><td>{fmt(detail.total)} วัน</td></tr>
            <tr><td>ใช้แล้ว (อนุมัติ)</td><td>{fmt(detail.used)} วัน</td></tr>
            <tr><td>รออนุมัติ</td><td>{fmt(detail.pending_days)} วัน ({detail.pending_count} คำขอ)</td></tr>
            <tr><td>คงเหลือ</td><td><b>{fmt(detail.remaining)} วัน</b></td></tr>
          </tbody></table>
          {!detail.enforced && <p className="muted" style={{ fontSize: 12 }}>ลาป่วยไม่ตัดสิทธิ์: ลาเกินสิทธิ์ได้ ส่วนเกินเป็นลาไม่รับค่าจ้าง</p>}
          <div className="form-actions"><Link className="btn btn-primary" to="/my-leave" onClick={() => setDetail(null)}>ดูประวัติการลา</Link></div>
        </Modal>
      )}
    </section>
  );
}
