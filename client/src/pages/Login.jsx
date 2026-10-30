// client/src/pages/Login.jsx
import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastContext';
import logoWhite from '../assets/trisak-logo-white.png';
const BadgeScene = React.lazy(() => import('../components/BadgeScene'));

function greetingFor(d) {
  const h = d.getHours();
  if (h < 12) return 'สวัสดีตอนเช้า';
  if (h < 17) return 'สวัสดีตอนบ่าย';
  if (h < 20) return 'สวัสดีตอนเย็น';
  return 'สวัสดีตอนค่ำ';
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

export default function Login() {
  const { me, login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const loc = useLocation();
  // กลับไปหน้าที่ตั้งใจจะเข้า (ถ้ามี) ไม่งั้นเข้า Profile Dashboard — กัน loop ไม่วนกลับ /login
  const from = loc.state && loc.state.from;
  const landing = (from && from.pathname && !['/login', '/'].includes(from.pathname)) ? `${from.pathname}${from.search || ''}${from.hash || ''}` : '/profile';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [remember, setRemember] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [use3D, setUse3D] = useState(false);
  const wrapRef = useRef(null);
  const heroRef = useRef(null);
  const pointer = useRef({ x: 0, y: 0, hover: false });

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // เลือกโหมดแสดงผล: คอมที่มีเมาส์ + WebGL + ไม่ได้ปิดแอนิเมชัน = บัตร 3D จริง, นอกนั้น = บัตรแบบเบา (ไม่โหลด three เลย)
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 861px)');
    const decide = () => {
      const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setUse3D(wide.matches && fine && !reduce && webglAvailable());
    };
    decide();
    wide.addEventListener('change', decide);
    return () => wide.removeEventListener('change', decide);
  }, []);

  // แสงไล่เมาส์ + พื้นหลังเลื่อนตามเมาส์ + ส่งตำแหน่งเมาส์ให้บัตร 3D (ผ่าน ref ไม่ re-render)
  useEffect(() => {
    const wrap = wrapRef.current;
    const hero = heroRef.current;
    if (!wrap || !hero) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const noHover = window.matchMedia('(hover: none)').matches;
    if (reduce || noHover) return;
    let raf = 0;
    const onMove = (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = hero.getBoundingClientRect();
        const px = (e.clientX / window.innerWidth) * 2 - 1;
        const py = (e.clientY / window.innerHeight) * 2 - 1;
        wrap.style.setProperty('--mx', `${e.clientX - r.left}px`);
        wrap.style.setProperty('--my', `${e.clientY - r.top}px`);
        wrap.style.setProperty('--px', px.toFixed(3));
        wrap.style.setProperty('--py', py.toFixed(3));
        pointer.current.x = px;
        pointer.current.y = py;
      });
    };
    const enter = () => { pointer.current.hover = true; };
    const leave = () => { pointer.current.hover = false; };
    window.addEventListener('mousemove', onMove);
    hero.addEventListener('mouseenter', enter);
    hero.addEventListener('mouseleave', leave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      hero.removeEventListener('mouseenter', enter);
      hero.removeEventListener('mouseleave', leave);
      cancelAnimationFrame(raf);
    };
  }, []);

  if (me) return <Navigate to={landing} replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(username.trim(), password, remember);
      navigate(landing, { replace: true });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const typed = username.trim();
  const dateText = now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeText = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <div className={`tl-wrap ${use3D ? 'has3d' : ''}`} ref={wrapRef}>
      {/* ---------- Hero ---------- */}
      <div className="tl-hero" ref={heroRef}>
        <div className="tl-slants" aria-hidden="true"><i /><i /><i /></div>
        <div className="tl-spot" aria-hidden="true" />

        <div className="tl-hero-inner">
          <img className="tl-logo tl-rise" style={{ '--d': '0s' }} src={logoWhite} alt="TRISAK GROUP" />
          <div className="tl-rise" style={{ '--d': '.12s' }}>
            <div className="tl-hello">{greetingFor(now)}</div>
            <div className="tl-date">{dateText} · {timeText} น.</div>
          </div>
          <h2 className="tl-title tl-rise" style={{ '--d': '.2s' }}>Visit Management System</h2>
          <p className="tl-desc tl-rise" style={{ '--d': '.28s' }}>
            ระบบบริหารจัดการคำขอออกนอกสถานที่ ลา และ OT ตั้งแต่สร้างคำขอ
            อนุมัติผ่านอีเมล ไปจนถึงติดตามผลและออกรายงาน
          </p>
        </div>

        {/* บัตรแบบเบา: โชว์บนมือถือ และบนคอมที่ใช้ 3D ไม่ได้ */}
        <div className={`tl-mini ${submitting ? 'scanning' : ''}`} aria-hidden="true">
          <div className="c">{typed ? typed.charAt(0).toUpperCase() : ''}</div>
          <i className="b1" /><i className="b2" />
          <div className="scan" />
        </div>

        {/* บัตร 3D จริง (Three.js) — โหลดเฉพาะเมื่อ use3D */}
        {use3D && (
          <div className="tl-stage3d">
            <React.Suspense fallback={null}>
              <BadgeScene typed={typed} submitting={submitting} pointer={pointer} onUnavailable={() => setUse3D(false)} />
            </React.Suspense>
          </div>
        )}
      </div>

      {/* ---------- Form ---------- */}
      <div className="tl-form-side">
        <div className="tl-card tl-rise" style={{ '--d': '.2s' }}>
          <h2 className="tl-h2">เข้าสู่ระบบ</h2>
          <p className="tl-sub">กรุณากรอกข้อมูลเพื่อเข้าสู่ระบบ</p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="tl-field">
              <label htmlFor="tl-username">Username</label>
              <input
                id="tl-username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="กรอกชื่อผู้ใช้"
                autoComplete="username"
                autoCapitalize="none"
                required
              />
            </div>

            <div className="tl-field">
              <label htmlFor="tl-password">Password</label>
              <div className="tl-password-box">
                <input
                  id="tl-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="กรอกรหัสผ่าน"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="tl-eye"
                  onClick={() => setShowPassword(s => !s)}
                  aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                >
                  {showPassword ? 'ซ่อน' : 'แสดง'}
                </button>
              </div>
            </div>

            <div className="tl-row">
              <label className="tl-remember">
                <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
                จำฉันไว้ในระบบ
              </label>
              <a href="#" className="tl-forgot" onClick={(e) => { e.preventDefault(); setShowForgot(v => !v); }}>ลืมรหัสผ่าน?</a>
            </div>
            {remember && <p className="tl-note">อยู่ในระบบ 30 วัน — อย่าเลือกบนเครื่องที่ใช้ร่วมกับผู้อื่น</p>}
            {showForgot && (
              <div className="tl-notice" role="status">
                กรุณาติดต่อผู้ดูแลระบบเพื่อรีเซ็ตรหัสผ่าน แล้วเปลี่ยนรหัสใหม่ด้วยตัวเองที่หน้า "โปรไฟล์" หลังเข้าสู่ระบบ
              </div>
            )}

            <button type="submit" className="tl-submit" disabled={submitting}>
              {submitting ? 'กำลังตรวจสอบบัตร…' : 'เข้าสู่ระบบ'}
            </button>
          </form>

          {/* โชว์เฉพาะตอนรัน npm run dev เท่านั้น — build จริงจะไม่มีกล่องนี้ */}
          {import.meta.env.DEV && (
            <div className="tl-hint">
              <div className="tl-hint-head">
                บัญชีทดสอบ (dev เท่านั้น) <span>รหัสผ่าน: ******</span>
              </div>
              <div className="tl-hint-rows">
                <div><span>พนักงาน</span><b>New</b></div>
                <div><span>ผู้อนุมัติ</span><b>jamees</b></div>
                <div><span>ผู้ดูแลระบบ</span><b>supachai</b></div>
                <div><span>ผู้ดูแลระบบ</span><b>Admin</b></div>
              </div>
            </div>
          )}

          <p className="tl-copy">© 2026 TRISAK GROUP. All rights reserved.</p>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600&display=swap');

        .tl-wrap, .tl-wrap * { box-sizing: border-box; }
        .tl-wrap {
          --b: #003D70; --bd: #002A50; --ink: #0E2A47;
          --mx: 30%; --my: 30%; --px: 0; --py: 0;
          min-height: 100dvh; width: 100%;
          display: flex; flex-wrap: wrap; overflow-x: hidden;
          font-family: 'IBM Plex Sans Thai', system-ui, sans-serif;
          background: #F2F6FB;
        }

        /* ---------- Hero ---------- */
        .tl-hero {
          position: relative; flex: 1.25 1 520px; min-width: 320px; min-height: 320px;
          background: var(--b); color: #fff; padding: 48px 52px; overflow: hidden;
          display: flex; align-items: center;
        }
        .tl-slants i {
          position: absolute; top: -10%; height: 120%; background: rgba(255,255,255,.05);
          transform: skewX(-15deg) translateX(calc(var(--px) * -16px));
          transition: transform .3s ease-out;
        }
        .tl-slants i:nth-child(1) { left: 46%; width: 70px; }
        .tl-slants i:nth-child(2) { left: 62%; width: 140px; }
        .tl-slants i:nth-child(3) { left: 86%; width: 50px; }
        .tl-spot {
          position: absolute; inset: 0; pointer-events: none;
          background: radial-gradient(420px circle at var(--mx) var(--my), rgba(255,255,255,.12), transparent 65%);
        }
        .tl-hero-inner { position: relative; z-index: 2; max-width: 360px; }
        .tl-logo { display: block; width: 210px; height: auto; margin-bottom: 52px; }
        .tl-hello { font-weight: 600; font-size: 16px; }
        .tl-date { font-size: 13px; opacity: .7; margin: 3px 0 26px; }
        .tl-title { font-size: 30px; font-weight: 600; line-height: 1.25; margin: 0 0 12px; }
        .tl-desc { font-size: 14.5px; line-height: 1.8; opacity: .82; margin: 0; }

        /* ขนาดบัตร 3D: ปรับที่ clamp(ต่ำสุด, สัดส่วนของพื้นที่สีฟ้า, สูงสุด) — อยากให้ใหญ่ขึ้น/เล็กลงแก้ตรงนี้ */
        .tl-stage3d { position: absolute; right: 2%; bottom: -5%; width: clamp(400px, 50%, 600px); aspect-ratio: 520 / 660; z-index: 1; pointer-events: none; }

        /* บัตรแบบเบา */
        .tl-mini {
          display: none; position: absolute; right: 22px; top: 28px; z-index: 1;
          width: 66px; height: 90px; border-radius: 10px; background: #fff; overflow: hidden;
          transform: rotate(7deg);
        }
        .tl-wrap:not(.has3d) .tl-mini { display: block; right: 56px; top: auto; bottom: 48px; width: 110px; height: 150px; border-radius: 14px; transform: rotate(-6deg); }
        .tl-mini .c { position: absolute; left: 50%; top: 16%; width: 38%; aspect-ratio: 1; margin-left: -19%; border-radius: 50%; background: #0065B3; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 18px; }
        .tl-mini i { position: absolute; left: 50%; height: 6%; border-radius: 4px; transform: translateX(-50%); }
        .tl-mini .b1 { top: 64%; width: 62%; background: #9CC4E6; }
        .tl-mini .b2 { top: 76%; width: 42%; background: #D5E6F5; }
        .tl-mini .scan { position: absolute; left: 0; right: 0; height: 22%; top: -22%; background: rgba(0,101,179,.35); opacity: 0; }
        .tl-mini.scanning .scan { opacity: 1; animation: tl-scan 1.4s linear infinite; }

        /* ---------- Form side ---------- */
        .tl-form-side { flex: 1 1 420px; min-width: 320px; display: flex; align-items: center; justify-content: center; padding: 48px 24px; }
        .tl-card {
          width: 100%; max-width: 390px; background: #fff;
          border: 1px solid #DCE6F1; border-radius: 18px; padding: 38px 32px 28px;
          box-shadow: 0 24px 60px -24px rgba(0,55,102,.28);
        }
        .tl-h2 { font-weight: 600; font-size: 25px; color: var(--ink); margin: 0 0 4px; }
        .tl-sub { color: #5B6E85; font-size: 14px; margin: 0 0 26px; }
        .tl-field { margin-bottom: 16px; }
        .tl-field label { display: block; font-size: 13px; font-weight: 600; color: #2B3F57; margin-bottom: 6px; }
        .tl-field input {
          width: 100%; padding: 11px 14px; min-height: 46px; border: 1.5px solid #D5E1EE; border-radius: 10px;
          font-size: 15px; font-family: inherit; color: var(--ink); background: #F8FAFD;
          transition: border-color .15s ease, box-shadow .15s ease;
        }
        .tl-field input::placeholder { color: #9AABBD; }
        .tl-field input:focus-visible { outline: none; border-color: var(--b); box-shadow: 0 0 0 3px rgba(0,80,143,.16); }
        .tl-password-box { position: relative; }
        .tl-password-box input { padding-right: 62px; }
        .tl-eye { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--b); font-size: 13px; font-weight: 600; padding: 10px; cursor: pointer; }
        .tl-eye:focus-visible { outline: 2px solid var(--b); border-radius: 6px; }
        .tl-row { display: flex; align-items: center; justify-content: space-between; margin: 4px 0 20px; font-size: 13.5px; flex-wrap: wrap; gap: 8px; }
        .tl-remember { display: flex; align-items: center; gap: 8px; color: #44566B; min-height: 32px; cursor: pointer; }
        .tl-remember input { width: 18px; height: 18px; accent-color: var(--b); }
        .tl-forgot { color: var(--b); font-weight: 600; text-decoration: none; padding: 6px 0; }
        .tl-forgot:hover { text-decoration: underline; }
        .tl-note { margin: -12px 0 16px; font-size: 12.5px; color: #9A6A00; }
        .tl-notice { margin: -8px 0 16px; padding: 10px 12px; border-radius: 10px; background: #EAF3FB; border: 1px solid #BBD6EE; color: #0E3A63; font-size: 13px; line-height: 1.6; }
        .tl-submit {
          width: 100%; min-height: 48px; border: none; border-radius: 10px; background: var(--b); color: #fff;
          font-weight: 600; font-size: 15.5px; font-family: inherit; cursor: pointer;
          transition: background .15s ease, transform .12s ease, box-shadow .15s ease;
        }
        .tl-submit:hover { background: #00305a; box-shadow: 0 10px 24px -10px rgba(0,55,102,.6); }
        .tl-submit:active { transform: translateY(1px); }
        .tl-submit:disabled { opacity: .7; cursor: default; }
        .tl-submit:focus-visible { outline: 2px solid var(--bd); outline-offset: 2px; }

        .tl-hint { margin-top: 22px; padding: 14px 16px; border-radius: 12px; background: #F2F6FB; border: 1px solid #DCE6F1; }
        .tl-hint-head { font-weight: 600; font-size: 13px; color: var(--ink); margin-bottom: 8px; }
        .tl-hint-head span { color: #7C8DA2; font-weight: 400; margin-left: 4px; }
        .tl-hint-rows { display: grid; gap: 4px; }
        .tl-hint-rows div { display: flex; justify-content: space-between; font-size: 12.5px; }
        .tl-hint-rows span { color: #7C8DA2; }
        .tl-hint-rows b { color: #2B3F57; font-weight: 600; }
        .tl-copy { text-align: center; color: #9AABBD; font-size: 11.5px; margin: 20px 0 0; }

        /* ---------- Motion ---------- */
        .tl-rise { opacity: 0; transform: translateY(14px); animation: tl-rise .6s cubic-bezier(.2,.7,.2,1) forwards; animation-delay: var(--d, 0s); }
        @keyframes tl-rise { to { opacity: 1; transform: none; } }
        @keyframes tl-scan { from { top: -22%; } to { top: 100%; } }
        @media (prefers-reduced-motion: reduce) {
          .tl-wrap *, .tl-wrap *::before, .tl-wrap *::after { animation: none !important; transition: none !important; }
          .tl-rise { opacity: 1; transform: none; }
        }

        /* ---------- Mobile ---------- */
        @media (max-width: 860px) {
          .tl-hero { flex-basis: 100%; min-height: 0; padding: calc(28px + env(safe-area-inset-top, 0px)) 24px 30px; }
          .tl-logo { width: 150px; margin-bottom: 28px; }
          .tl-date { margin-bottom: 0; }
          .tl-title, .tl-desc { display: none; }
          .tl-mini, .tl-wrap:not(.has3d) .tl-mini { display: block; right: 24px; top: 22px; bottom: auto; width: 62px; height: 84px; border-radius: 10px; transform: rotate(7deg); }
          .tl-form-side { flex-basis: 100%; padding: 24px 16px calc(36px + env(safe-area-inset-bottom, 0px)); align-items: flex-start; }
          .tl-card { box-shadow: none; border-color: transparent; padding: 8px 8px 0; background: transparent; }
          .tl-hint { display: none; }
          .tl-spot { display: none; }
        }
        @media (max-width: 360px) { .tl-hero { padding-left: 18px; padding-right: 18px; } }
      `}</style>
    </div>
  );
}
