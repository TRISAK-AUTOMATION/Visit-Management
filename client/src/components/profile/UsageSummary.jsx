// 4 การ์ดสรุป: ข้อมูลจริงของฉัน กดแล้วไปหน้ารายการที่กรองไว้
import React from 'react';
import { Link } from 'react-router-dom';
import CountUp from './CountUp';

const PATH = { visit: '/my-requests', leave: '/my-leave', ot: '/my-ot' };
const NAME = { visit: 'Visit', leave: 'ลา', ot: 'OT' };
// หน้าอนุมัติของแต่ละประเภท (ลิงก์ "รอคุณอนุมัติ" ต้องไปหน้าอนุมัติ ไม่ใช่หน้า Dashboard)
const APPROVE = { visit: '/approve-requests?status=pending', leave: '/approve-leave?status=pending', ot: '/approve-ot?status=pending' };

function Card({ icon, color, label, value, note, parts, status, kinds, waiting, waitingBy = {} }) {
  return (
    <div className="pd-card pd-stat">
      <div className="pd-stat-icon" style={{ background: color + '1a', color }} aria-hidden="true">{icon}</div>
      <div className="pd-stat-body">
        <div className="pd-stat-label">{label}</div>
        <div className="pd-stat-value"><CountUp value={value} /></div>
        <div className="pd-stat-parts">
          {kinds.map(k => (
            <Link key={k} to={`${PATH[k]}${status ? `?status=${status}` : ''}`} title={`ดูรายการ ${NAME[k]}`}>{NAME[k]} {parts[k]}</Link>
          ))}
        </div>
        {note && <div className="pd-stat-note">{note}</div>}
        {waiting > 0 && (
          <div className="pd-stat-wait">
            <span>รอคุณอนุมัติ:</span>
            {Object.keys(APPROVE).filter(k => waitingBy[k] > 0).map(k => (
              <Link key={k} to={APPROVE[k]}>{NAME[k]} {waitingBy[k]} รายการ →</Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function UsageSummary({ counts, canVisit }) {
  const kinds = canVisit ? ['visit', 'leave', 'ot'] : ['leave', 'ot'];
  const sum = (o) => kinds.reduce((s, k) => s + (o[k] || 0), 0);
  return (
    <div className="pd-stats">
      <Card icon="🗂" color="#2f5bff" label="คำขอทั้งหมดปีนี้" value={sum(counts.total)} parts={counts.total} kinds={kinds} />
      <Card icon="⏳" color="#f5a524" label="รออนุมัติ (ของฉัน)" value={sum(counts.pending)} parts={counts.pending} kinds={kinds} status="pending" waiting={counts.waiting_me} waitingBy={counts.waiting_by} />
      <Card icon="✅" color="#1fae62" label="อนุมัติแล้ว/กำลังดำเนินการ" value={sum(counts.active)} parts={counts.active} kinds={kinds} status="approved" note={canVisit ? 'Visit ที่ยังไม่แจ้งเสร็จสิ้น · ลา/OT ที่ยังไม่ถึงกำหนด' : 'ลา/OT ที่ยังไม่ถึงกำหนด'} />
      <Card icon="📍" color="#7b3fe4" label={canVisit ? 'Visit วันนี้' : 'ลา/OT วันนี้'} value={canVisit ? counts.today.visit : counts.today.leave + counts.today.ot}
        parts={counts.today} kinds={canVisit ? ['visit'] : ['leave', 'ot']} status="approved" />
    </div>
  );
}
