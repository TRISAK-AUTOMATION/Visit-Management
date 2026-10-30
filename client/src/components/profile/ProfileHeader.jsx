import React, { useState, useEffect } from 'react';
import { initials, ROLE_TH } from '../../lib/api';
import StarRating, { kpiLevel } from './StarRating';
import CountUp from './CountUp';

export default function ProfileHeader({ user, kpi, onEdit, onPassword, onOpenKpi }) {
  const depts = (user.departments && user.departments.length ? user.departments : (user.department ? [user.department] : [])).join(', ');
  const active = user.is_active !== 0;
  const [imgBad, setImgBad] = useState(false);
  useEffect(() => setImgBad(false), [user.avatar_url]);
  return (
    <section className="pd-banner" aria-label="ข้อมูลโปรไฟล์">
      {user.avatar_url && !imgBad
        ? <img className="pd-avatar" src={user.avatar_url} alt="รูปโปรไฟล์" onError={() => setImgBad(true)} />
        : <div className="pd-avatar pd-avatar-ph" aria-hidden="true">{initials(user.full_name)}</div>}
      <div className="pd-who">
        <h2>{user.full_name}</h2>
        <div className="pd-sub">{user.position || '-'} · {depts || 'ไม่ระบุแผนก'} · {ROLE_TH[user.role]}</div>
        <div className="pd-meta">
          <span className={`pd-status ${active ? 'on' : 'off'}`}>{active ? '● ใช้งานอยู่' : '● ปิดใช้งาน'}</span>
          <span>✉ {user.email || '-'}</span>
          <span>☎ {user.phone || '-'}</span>
        </div>
      </div>
      <button type="button" className="pd-rating" onClick={onOpenKpi} title="ดูรายละเอียด KPI" aria-label="ดูรายละเอียดคะแนน KPI">
        <span className="pd-rating-label">คะแนน KPI</span>
        <StarRating score100={kpi ? kpi.overall : 0} />
        {kpi ? (
          <span className="pd-rating-score"><b><CountUp value={Math.round(kpi.overall / 2) / 10} /></b> / 5 <em>{kpiLevel(kpi.overall)}</em></span>
        ) : (
          <span className="pd-rating-score pd-rating-none">ยังไม่มีผลประเมิน</span>
        )}
      </button>
      <div className="pd-banner-actions">
        <button type="button" className="btn btn-primary" onClick={onEdit}>✎ แก้ไขโปรไฟล์</button>
        <button type="button" className="btn pd-btn-pw" onClick={onPassword}>เปลี่ยนรหัสผ่าน</button>
      </div>
    </section>
  );
}
