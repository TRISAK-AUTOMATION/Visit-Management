// client/src/components/AutomationScene.jsx
// ฉากเครื่องจักรออโตเมชั่นเคลื่อนไหวหลังบัตร (SVG + CSS ล้วน ไม่ใช้ WebGL): สายพานลำเลียง + แขนกลหยิบกล่อง + เฟืองหมุนขบกัน + ไฟสถานะ PLC + เซนเซอร์
// ใช้ transform/opacity/stroke-dashoffset เท่านั้น (เบา) — ถ้าผู้ใช้ปิดแอนิเมชันในเครื่อง (prefers-reduced-motion) Login.jsx จะหยุดทุกอย่างให้เอง
import React from 'react';

// สร้างเส้นขอบเฟือง: R = รัศมีปลายฟัน, r = รัศมีโคนฟัน, n = จำนวนฟัน
function gearPath(cx, cy, R, r, n) {
  const step = (Math.PI * 2) / n;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = i * step;
    [[a - step * 0.28, r], [a - step * 0.16, R], [a + step * 0.16, R], [a + step * 0.28, r]]
      .forEach(([ang, rad]) => pts.push(`${(cx + rad * Math.cos(ang)).toFixed(1)},${(cy + rad * Math.sin(ang)).toFixed(1)}`));
  }
  return `M${pts.join('L')}Z`;
}

function Gear({ cx, cy, R, r, n, cls }) {
  return (
    <g className={`as-gear ${cls}`} style={{ transformOrigin: `${cx}px ${cy}px` }}>
      <path d={gearPath(cx, cy, R, r, n)} />
      <circle cx={cx} cy={cy} r={r * 0.55} />
      <circle cx={cx} cy={cy} r={r * 0.17} className="hub" />
      {[0, 60, 120].map(a => (
        <line key={a} x1={cx - r * 0.55} y1={cy} x2={cx + r * 0.55} y2={cy} transform={`rotate(${a} ${cx} ${cy})`} />
      ))}
    </g>
  );
}

export default function AutomationScene() {
  return (
    <div className="as-root" aria-hidden="true">
      <div className="as-grid" />
      <i className="as-bus" style={{ top: '16%', '--t': '9s', '--dl': '-2s' }} />
      <i className="as-bus" style={{ top: '34%', '--t': '12s', '--dl': '-7s' }} />
      <i className="as-bus" style={{ top: '55%', '--t': '10s', '--dl': '-4s' }} />

      {/* เฟืองขบกันมุมขวาบน */}
      <svg className="as-gears" viewBox="0 0 340 270" focusable="false">
        <Gear cx={250} cy={90} R={78} r={64} n={16} cls="g-a" />
        <Gear cx={148} cy={149} R={52} r={40} n={11} cls="g-b" />
        <Gear cx={134} cy={226} R={36} r={27} n={8} cls="g-c" />
      </svg>

      {/* สายพาน + แขนกล + ตู้ควบคุม */}
      <svg className="as-bottom" viewBox="0 0 1000 300" preserveAspectRatio="xMidYMax meet" focusable="false">
        {/* สายพาน */}
        <rect className="as-belt-top" x="0" y="258" width="1000" height="10" />
        <rect className="as-belt-body" x="0" y="268" width="1000" height="22" />
        <line className="as-belt-marks" x1="0" y1="279" x2="1000" y2="279" />
        {[70, 500, 930].map(x => <rect key={x} className="as-leg" x={x} y="290" width="10" height="10" />)}

        {/* กล่องบนสายพาน */}
        {[0, -4, -8, -12].map((d, i) => (
          <g key={i} className="as-box" style={{ '--x': `${60 + i * 250}px`, animationDelay: `${d}s` }}>
            <rect x="0" y="222" width="44" height="36" rx="3" />
            <rect className="tape" x="19" y="222" width="6" height="36" />
          </g>
        ))}

        {/* เซนเซอร์ตรวจจับ */}
        <rect className="as-metal" x="636" y="170" width="6" height="88" />
        <rect className="as-metal" x="626" y="164" width="26" height="10" rx="2" />
        <line className="as-beam" x1="639" y1="176" x2="639" y2="258" />
        <circle className="as-led amber" cx="639" cy="169" r="2.6" style={{ animationDelay: '-.4s' }} />

        {/* ตู้ควบคุม PLC */}
        <rect className="as-cab" x="40" y="168" width="78" height="90" rx="4" />
        <rect className="as-screen" x="50" y="178" width="58" height="26" rx="2" />
        <polyline className="as-wave" points="54,196 66,188 78,196 90,184 104,192" />
        <circle className="as-led green" cx="58" cy="222" r="4" />
        <circle className="as-led amber" cx="74" cy="222" r="4" style={{ animationDelay: '-.7s' }} />
        <circle className="as-led blue" cx="90" cy="222" r="4" style={{ animationDelay: '-1.2s' }} />
        <rect className="as-metal" x="52" y="236" width="54" height="6" rx="2" />
        <path className="as-cable" d="M118 246 C150 246 160 252 196 252" />

        {/* แขนกล: pivot ที่ (210,232) ข้อศอกที่ (210,160) */}
        <rect className="as-metal" x="180" y="250" width="60" height="10" rx="2" />
        <rect className="as-metal" x="195" y="232" width="30" height="20" rx="3" />
        <g className="as-arm1">
          <rect className="as-link" x="204" y="152" width="12" height="86" rx="6" />
          <circle className="as-joint" cx="210" cy="232" r="8" />
          <g className="as-arm2">
            <rect className="as-link" x="205" y="96" width="10" height="68" rx="5" />
            <circle className="as-joint" cx="210" cy="160" r="8" />
            <g className="as-grip">
              <rect className="as-metal" x="199" y="84" width="4" height="16" rx="1" />
              <rect className="as-metal" x="217" y="84" width="4" height="16" rx="1" />
              <g className="as-held">
                <rect x="198" y="68" width="24" height="18" rx="2" />
              </g>
            </g>
          </g>
        </g>
      </svg>

      <style>{`
        .as-root { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
        /* พื้นหลังตารางแบบพิมพ์เขียว เลื่อนช้า ๆ */
        .as-grid {
          position: absolute; inset: 0; opacity: .8;
          background-image: linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px);
          background-size: 48px 48px;
          -webkit-mask-image: radial-gradient(ellipse at 30% 40%, #000 0, transparent 75%); mask-image: radial-gradient(ellipse at 30% 40%, #000 0, transparent 75%);
          animation: as-grid 24s linear infinite;
        }
        @keyframes as-grid { to { background-position: 48px 48px, 48px 48px; } }
        /* เส้นสัญญาณข้อมูลวิ่งผ่านแนวนอน */
        .as-bus {
          position: absolute; left: 0; right: 0; height: 1px; opacity: .9;
          background: linear-gradient(90deg, transparent 0 42%, rgba(127,208,255,.85) 50%, transparent 58% 100%);
          background-size: 220% 100%; animation: as-bus var(--t, 10s) linear infinite; animation-delay: var(--dl, 0s);
        }
        @keyframes as-bus { from { background-position: 110% 0; } to { background-position: -110% 0; } }

        /* เฟือง */
        .as-gears { position: absolute; top: -26px; right: -34px; width: clamp(230px, 30%, 380px); height: auto; overflow: visible; }
        .as-gear path, .as-gear circle, .as-gear line { fill: rgba(255,255,255,.06); stroke: rgba(255,255,255,.26); stroke-width: 1.6; }
        .as-gear line { fill: none; }
        .as-gear .hub { fill: rgba(255,255,255,.2); }
        .as-gear.g-a { animation: as-cw 44s linear infinite; }
        .as-gear.g-b { animation: as-ccw 30.25s linear infinite; }
        .as-gear.g-c { animation: as-cw 22s linear infinite; }
        @keyframes as-cw { to { transform: rotate(360deg); } }
        @keyframes as-ccw { to { transform: rotate(-360deg); } }

        /* ส่วนล่าง: ยึดติดขอบล่างของพื้นที่สีฟ้า */
        .as-bottom { position: absolute; left: 0; bottom: 0; width: 100%; height: auto; max-height: 46%; overflow: visible; }
        .as-belt-top { fill: rgba(255,255,255,.2); }
        .as-belt-body { fill: rgba(0,20,45,.38); }
        .as-belt-marks { stroke: rgba(255,255,255,.3); stroke-width: 2; stroke-dasharray: 18 14; animation: as-belt .9s linear infinite; }
        @keyframes as-belt { to { stroke-dashoffset: -32; } }
        .as-leg, .as-metal { fill: rgba(255,255,255,.22); }
        .as-box rect { fill: rgba(207,228,247,.7); }
        .as-box .tape { fill: rgba(0,101,179,.65); }
        .as-box { animation: as-move 16s linear infinite; transform: translateX(var(--x, -80px)); }
        @keyframes as-move { from { transform: translateX(-80px); } to { transform: translateX(1060px); } }

        .as-cab { fill: rgba(0,20,45,.4); stroke: rgba(255,255,255,.25); stroke-width: 1.5; }
        .as-screen { fill: rgba(127,208,255,.1); stroke: rgba(127,208,255,.45); stroke-width: 1; }
        .as-wave { fill: none; stroke: rgba(127,208,255,.9); stroke-width: 1.6; stroke-linejoin: round; stroke-dasharray: 90; animation: as-wave 2.4s linear infinite; }
        @keyframes as-wave { from { stroke-dashoffset: 90; } to { stroke-dashoffset: -90; } }
        .as-cable { fill: none; stroke: rgba(255,255,255,.28); stroke-width: 2; stroke-dasharray: 3 4; }
        .as-led { animation: as-blink 1.8s ease-in-out infinite; }
        .as-led.green { fill: #5be3a1; } .as-led.amber { fill: #ffc24d; } .as-led.blue { fill: #7fd0ff; }
        @keyframes as-blink { 0%, 100% { opacity: .25; } 50% { opacity: 1; } }
        .as-beam { stroke: rgba(255,194,77,.7); stroke-width: 1.5; stroke-dasharray: 4 5; animation: as-beam 1.2s ease-in-out infinite; }
        @keyframes as-beam { 0%, 100% { opacity: .2; } 50% { opacity: .9; } }

        /* แขนกล: ยื่นลงหยิบ → ยกเลี้ยวขึ้น → วางลง วนซ้ำ */
        .as-link { fill: rgba(255,255,255,.3); }
        .as-joint { fill: rgba(0,20,45,.55); stroke: rgba(255,255,255,.5); stroke-width: 2; }
        .as-arm1 { transform-origin: 210px 232px; animation: as-a1 7s ease-in-out infinite; }
        .as-arm2 { transform-origin: 210px 160px; animation: as-a2 7s ease-in-out infinite; }
        @keyframes as-a1 { 0%, 18% { transform: rotate(40deg); } 50%, 68% { transform: rotate(-25deg); } 100% { transform: rotate(40deg); } }
        @keyframes as-a2 { 0%, 18% { transform: rotate(110deg); } 50%, 68% { transform: rotate(25deg); } 100% { transform: rotate(110deg); } }
        .as-held rect { fill: rgba(207,228,247,.85); }
        .as-held { animation: as-held 7s linear infinite; }
        @keyframes as-held { 0%, 20% { opacity: 0; } 24%, 92% { opacity: 1; } 98%, 100% { opacity: 0; } }

        /* จอเล็ก: ซ่อนฉาก (หน้า Login มือถือใช้บัตรแบบเบาอยู่แล้ว) */
        @media (max-width: 860px) { .as-root { display: none; } }
      `}</style>
    </div>
  );
}
