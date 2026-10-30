// ตัวเลขนับขึ้นจาก 0 ตอนเปิดหน้า (ปิดอัตโนมัติถ้าผู้ใช้ตั้งค่าลดการเคลื่อนไหว)
import React, { useEffect, useState } from 'react';

const fmtFinal = (n) => (Math.round((n || 0) * 100) / 100).toString();

export default function CountUp({ value, duration = 800 }) {
  const to = Number(value) || 0;
  const [v, setV] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDone(false);
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || to === 0) { setV(to); setDone(true); return undefined; }
    let raf, t0;
    const step = (t) => {
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / duration);
      setV(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step); else setDone(true);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  if (done) return <>{fmtFinal(to)}</>;
  return <>{Number.isInteger(to) ? Math.round(v) : v.toFixed(1)}</>;
}
