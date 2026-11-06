// client/src/components/PageHero.jsx — ส่วนหัวหน้าแบบเดียวกับ Dashboard/Report (gradient + orbs ลอย + ไอคอนลอย)
// ใช้ซ้ำได้ทุกหน้า: <PageHero icon="layers" title="..." desc="..." tone="blue|green|orange|purple|red|slate" stats={[{label,value}]}>ปุ่ม/แท็บทางขวา</PageHero>
import React from 'react';
import RIcon from './report/ReportIcons';
import './report/report-ui.css';
import './ui-kit.css';

export default function PageHero({ icon = 'layers', title, desc, tone = 'blue', stats = [], children, index = 0 }) {
  return (
    <section className={`rx-hero ux-hero tone-${tone} rx-rise`} style={{ '--i': index }}>
      <span className="rx-orbs"><i className="rx-orb o1" /><i className="rx-orb o2" /><i className="rx-orb o3" /></span>
      <div className="ux-hero-main">
        <span className="ux-hero-ico"><RIcon name={icon} size={28} /></span>
        <div>
          <h2>{title}</h2>
          {desc ? <p>{desc}</p> : null}
        </div>
      </div>
      {(stats.length > 0 || children) && (
        <div className="ux-hero-side">
          {stats.map(s => <span key={s.label} className="ux-hero-stat"><b>{s.value}</b>{s.label}</span>)}
          {children}
        </div>
      )}
    </section>
  );
}
