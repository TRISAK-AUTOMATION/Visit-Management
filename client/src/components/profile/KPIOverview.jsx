import React from 'react';
import { fmtDateTime } from '../../lib/api';

export default function KPIOverview({ kpi, onOpen }) {
  return (
    <section className="pd-card" aria-label="KPI">
      <div className="pd-card-head"><h3>KPI ภาพรวม</h3></div>
      {!kpi ? (
        <div className="pd-empty">ยังไม่มีผลประเมิน KPI</div>
      ) : (
        <>
          <div className="pd-kpi-top">
            <div className="pd-donut" style={{ '--p': kpi.overall }} role="img" aria-label={`คะแนนรวม ${kpi.overall} จาก 100`}><b>{kpi.overall}</b><small>/100</small></div>
            <div>
              <div className="pd-kpi-status">{kpi.work_status}</div>
              <div className="muted" style={{ fontSize: 12 }}>อัปเดตล่าสุด {fmtDateTime(kpi.updated_at)}</div>
            </div>
          </div>
          <ul className="pd-kpi-cats">
            {kpi.categories.map(c => (
              <li key={c.key}><span>{c.label}</span><div className="pd-bar"><span style={{ width: `${c.score}%` }} /></div><b>{c.score}</b></li>
            ))}
          </ul>
        </>
      )}
      <button type="button" className="btn btn-ghost btn-sm" onClick={onOpen}>ดูรายละเอียด KPI</button>
    </section>
  );
}
