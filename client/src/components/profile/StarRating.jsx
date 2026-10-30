// ดาว 5 ดวงตามคะแนน KPI (0-100 → 0-5 ดาว) เติมสีทองไล่ทีละดวงตอนเปิดหน้า รองรับครึ่งดวงและเศษส่วน
import React, { useEffect, useState } from 'react';

const STAR = 'M12 2.5l2.94 6.1 6.56.9-4.8 4.62 1.2 6.58L12 17.5l-5.9 3.2 1.2-6.58L2.5 9.5l6.56-.9L12 2.5z';

function Star({ pct, index, show, size }) {
  return (
    <span className="pd-star" style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d={STAR} className="pd-star-bg" /></svg>
      <span className="pd-star-fill" style={{ width: show ? `${pct}%` : '0%', transitionDelay: `${250 + index * 140}ms` }}>
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d={STAR} className="pd-star-gold" /></svg>
      </span>
    </span>
  );
}

export default function StarRating({ score100, size = 30 }) {
  const [show, setShow] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setShow(true)); return () => cancelAnimationFrame(t); }, []);
  const stars = Math.max(0, Math.min(5, (Number(score100) || 0) / 20));
  return (
    <div className="pd-stars" role="img" aria-label={`คะแนน KPI ${stars.toFixed(1)} จาก 5 ดาว`}>
      {[0, 1, 2, 3, 4].map(i => <Star key={i} index={i} show={show} size={size} pct={Math.max(0, Math.min(1, stars - i)) * 100} />)}
    </div>
  );
}

export function kpiLevel(score) {
  if (score >= 90) return 'ยอดเยี่ยม';
  if (score >= 80) return 'ดีเยี่ยม';
  if (score >= 65) return 'ดี';
  if (score > 0) return 'ควรปรับปรุง';
  return 'ยังไม่ประเมิน';
}
