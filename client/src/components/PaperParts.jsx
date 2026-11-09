// client/src/components/PaperParts.jsx - ชิ้นส่วนที่ใช้ร่วมกันของ "ใบ OT / ใบลา แบบกระดาษ" ในหน้าต่างรายละเอียด
import React, { useLayoutEffect, useRef, useState } from 'react';

export const PAPER_W = 640; // ความกว้างจริงของแบบฟอร์ม (ตรงกับ .otp ใน style.css)

// ย่อทั้งใบตามความกว้างที่มี (จอแคบกว่า PAPER_W เช่นมือถือ จะเห็นทั้งแผ่นโดยไม่ต้องเลื่อนซ้ายขวา)
export function PaperFit({ label, deps, children }) {
  const boxRef = useRef(null), paperRef = useRef(null);
  const [fit, setFit] = useState({ scale: 1, height: 'auto' });
  useLayoutEffect(() => {
    const box = boxRef.current, pp = paperRef.current;
    if (!box || !pp) return undefined;
    const measure = () => {
      const scale = Math.min(1, box.clientWidth / PAPER_W);
      setFit({ scale, height: pp.offsetHeight * scale });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box); ro.observe(pp);
    return () => ro.disconnect();
  }, [deps]);
  return (
    <div className="otp-fit" ref={boxRef} style={{ height: fit.height }}>
      <div className="otp" ref={paperRef} style={{ transform: fit.scale < 1 ? `scale(${fit.scale})` : undefined }} aria-label={label}>
        {children}
      </div>
    </div>
  );
}

// ช่องลงนาม 3 ช่อง: ลายเซ็น (หรือชื่อลายมือ+เวลา ถ้ายังไม่ได้ตั้งลายเซ็น) / เส้นประ / ตำแหน่ง / (ชื่อ) หรือ "รอ ..." ถ้ายังไม่ได้อนุมัติ
export function PaperSigners({ signers }) {
  return (
    <div className="otp-signs">
      {signers.map((s) => (
        <div className="otp-sign" key={s.role}>
          <div className="otp-sig">
            {s.sig ? <img src={s.sig} alt={`ลายเซ็น${s.role}`} />
              : s.stamp ? (
                // ยังไม่ได้ตั้งลายเซ็น -> ชื่อลายมือ + วันเวลาที่ลงนามผ่านระบบ (แบบเดียวกับใน PDF)
                <div className="otp-stamp" title="ยังไม่ได้ตั้งลายเซ็น — แสดงชื่อและเวลาที่ลงนามผ่านระบบแทน">
                  <span className="otp-stamp-name">{s.stamp.name}</span>
                  {s.stamp.at && <span className="otp-stamp-at">{s.stamp.label} {s.stamp.at}</span>}
                </div>
              ) : null}
          </div>
          <div className="otp-dots" />
          <div className="otp-role">{s.role}</div>
          {s.name ? <div className="otp-who">({s.name})</div>
            : s.waiting ? <div className="otp-who otp-wait">รอ {s.waiting}</div>
              : <div className="otp-who">&nbsp;</div>}
        </div>
      ))}
    </div>
  );
}
