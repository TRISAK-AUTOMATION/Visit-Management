// client/src/pages/Login.jsx
import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastContext';

export default function Login() {
  const { me, login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (me) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      navigate('/dashboard');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="tlogin-wrap">
      {/* ---------- Hero ---------- */}
      <div className="tlogin-hero">
        <div className="tlogin-hero-inner">
          <div className="tlogin-mark">T</div>
          <h1 className="tlogin-title">TRISAK</h1>
          <p className="tlogin-tag">Visit Management System</p>
          <p className="tlogin-desc">
            ระบบบริหารจัดการคำขอออกนอกสถานที่ ครบวงจร ตั้งแต่สร้างคำขอ
            อนุมัติผ่านอีเมล ไปจนถึงติดตามผลและออกรายงาน
          </p>
        </div>

        {/* Signature illustration: a stylised visitor badge, echoing the product itself */}
        <svg className="tlogin-badge-art" viewBox="0 0 300 380" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="badgeFace" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#24345C" />
              <stop offset="100%" stopColor="#182647" />
            </linearGradient>
          </defs>
          <rect x="30" y="40" width="240" height="320" rx="26" fill="url(#badgeFace)" stroke="#1549cc" strokeWidth="1.5" />
          <rect x="115" y="16" width="70" height="26" rx="13" fill="#0F1A33" stroke="#453bc9" strokeWidth="1.5" />
          <circle cx="150" cy="29" r="4.5" fill="#3b95c9" />
          <circle cx="150" cy="130" r="42" fill="#0F1A33" />
          <circle cx="150" cy="118" r="16" fill="#3E5590" />
          <path d="M118 158c6-16 20-24 32-24s26 8 32 24" stroke="#3E5590" strokeWidth="3" fill="none" strokeLinecap="round" />
          <rect x="70" y="200" width="160" height="8" rx="4" fill="#3E5590" />
          <rect x="70" y="222" width="120" height="8" rx="4" fill="#2C3E6B" />
          <rect x="70" y="270" width="52" height="52" rx="6" fill="#0F1A33" />
          <rect x="80" y="280" width="8" height="8" fill="#C99A3B" />
          <rect x="96" y="280" width="8" height="8" fill="#C99A3B" />
          <rect x="80" y="296" width="8" height="8" fill="#C99A3B" />
          <rect x="96" y="296" width="8" height="8" fill="#3E5590" />
          <rect x="134" y="278" width="96" height="6" rx="3" fill="#2C3E6B" />
          <rect x="134" y="294" width="72" height="6" rx="3" fill="#2C3E6B" />
          <rect x="134" y="310" width="88" height="6" rx="3" fill="#2C3E6B" />
        </svg>
      </div>

      {/* ---------- Form ---------- */}
      <div className="tlogin-form-side">
        <div className="tlogin-card">
          <div className="tlogin-clip" aria-hidden="true" />

          <h2 className="tlogin-h2">เข้าสู่ระบบ</h2>
          <p className="tlogin-sub">กรุณากรอกข้อมูลเพื่อเข้าสู่ระบบ</p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="tlogin-field">
              <label htmlFor="tlogin-username">Username</label>
              <input
                id="tlogin-username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="กรอกชื่อผู้ใช้"
                autoComplete="username"
                required
              />
            </div>

            <div className="tlogin-field">
              <label htmlFor="tlogin-password">Password</label>
              <div className="tlogin-password-box">
                <input
                  id="tlogin-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="กรอกรหัสผ่าน"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="tlogin-eye"
                  onClick={() => setShowPassword(s => !s)}
                  aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                >
                  {showPassword ? 'ซ่อน' : 'แสดง'}
                </button>
              </div>
            </div>

            <div className="tlogin-row">
              <label className="tlogin-remember">
                <input type="checkbox" />
                จำฉันไว้ในระบบ
              </label>
              <a href="#" className="tlogin-forgot">ลืมรหัสผ่าน?</a>
            </div>

            <button type="submit" className="tlogin-submit" disabled={submitting}>
              {submitting ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
            </button>
          </form>

          <div className="tlogin-hint">
            <div className="tlogin-hint-head">
              บัญชีทดสอบ <span>รหัสผ่าน: ******</span>
            </div>
            <div className="tlogin-hint-rows">
              <div><span>พนักงาน</span><b>New</b></div>
              <div><span>ผู้อนุมัติ</span><b>jamees</b></div>
              <div><span>ผู้ดูแลระบบ</span><b>supachai</b></div>
              <div><span>ผู้ดูแลระบบ</span><b>Admin</b></div>
            </div>
          </div>

          <p className="tlogin-copy">© 2026 TRISAK. All rights reserved.</p>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+Thai:wght@600;700&family=IBM+Plex+Sans+Thai:wght@400;500;600&display=swap');

        .tlogin-wrap, .tlogin-wrap * { box-sizing: border-box; }

        .tlogin-wrap {
          min-height: 100dvh;
          width: 100%;
          display: flex;
          flex-wrap: wrap;
          overflow-x: hidden;
          font-family: 'IBM Plex Sans Thai', system-ui, sans-serif;
          background: #F6F4EF;
        }

        /* ---------- Hero ---------- */
        .tlogin-hero {
          position: relative;
          flex: 1 1 480px;
          min-width: 320px;
          background: radial-gradient(120% 140% at 0% 0%, #1C2C50 0%, #0F1A33 60%, #0B142A 100%);
          padding: 56px 48px;
          display: flex;
          align-items: center;
          overflow: hidden;
          min-height: 320px;
        }

        .tlogin-hero-inner {
          position: relative;
          z-index: 2;
          max-width: 400px;
        }

        .tlogin-mark {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          background: linear-gradient(135deg, #C99A3B, #A87B24);
          color: #083ebd;
          font-family: 'Noto Serif Thai', serif;
          font-weight: 700;
          font-size: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 22px;
        }

        .tlogin-title {
          font-family: 'Noto Serif Thai', serif;
          font-weight: 700;
          font-size: 40px;
          color: #F7F5EF;
          margin: 0 0 6px;
          letter-spacing: 0.5px;
        }

        .tlogin-tag {
          color: #C99A3B;
          font-weight: 600;
          font-size: 15px;
          margin: 0 0 26px;
        }

        .tlogin-desc {
          color: #A9B4D6;
          font-size: 14.5px;
          line-height: 1.8;
          margin: 0;
          max-width: 340px;
        }

        .tlogin-badge-art {
          position: absolute;
          right: -40px;
          bottom: -50px;
          width: 300px;
          height: 380px;
          transform: rotate(-7deg);
          opacity: 0.9;
          z-index: 1;
        }

        /* ---------- Form side ---------- */
        .tlogin-form-side {
          flex: 1 1 420px;
          min-width: 320px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 48px 24px;
        }

        .tlogin-card {
          position: relative;
          width: 100%;
          max-width: 380px;
          background: #FFFFFF;
          border: 1px solid #E7E2D6;
          border-radius: 20px;
          padding: 38px 32px 30px;
          box-shadow: 0 24px 60px -20px rgba(15, 26, 51, 0.25);
        }

        .tlogin-clip {
          position: absolute;
          top: -13px;
          left: 50%;
          transform: translateX(-50%);
          width: 64px;
          height: 22px;
          background: #0F1A33;
          border: 1.5px solid #C99A3B;
          border-radius: 11px;
        }

        .tlogin-h2 {
          font-family: 'Noto Serif Thai', serif;
          font-weight: 700;
          font-size: 24px;
          color: #17223F;
          margin: 6px 0 4px;
          text-align: center;
        }

        .tlogin-sub {
          text-align: center;
          color: #7A8194;
          font-size: 13.5px;
          margin: 0 0 26px;
        }

        .tlogin-field { margin-bottom: 16px; }

        .tlogin-field label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: #3A4256;
          margin-bottom: 6px;
        }

        .tlogin-field input {
          width: 100%;
          padding: 11px 14px;
          border: 1.5px solid #E1DED3;
          border-radius: 10px;
          font-size: 14.5px;
          font-family: inherit;
          color: #17223F;
          background: #FBFAF7;
          transition: border-color .15s ease, box-shadow .15s ease;
        }

        .tlogin-field input::placeholder { color: #B7BAC4; }

        .tlogin-field input:focus-visible {
          outline: none;
          border-color: #C99A3B;
          box-shadow: 0 0 0 3px rgba(201, 154, 59, 0.18);
        }

        .tlogin-password-box { position: relative; }

        .tlogin-password-box input { padding-right: 58px; }

        .tlogin-eye {
          position: absolute;
          right: 6px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: #6B7A9E;
          font-size: 12.5px;
          font-weight: 600;
          padding: 6px 8px;
          cursor: pointer;
        }
        .tlogin-eye:focus-visible { outline: 2px solid #C99A3B; border-radius: 6px; }

        .tlogin-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin: 4px 0 22px;
          font-size: 13px;
          flex-wrap: wrap;
          gap: 8px;
        }

        .tlogin-remember {
          display: flex;
          align-items: center;
          gap: 7px;
          color: #4B5468;
        }
        .tlogin-remember input { accent-color: #C99A3B; }

        .tlogin-forgot {
          color: #24345C;
          font-weight: 600;
          text-decoration: none;
        }
        .tlogin-forgot:hover { text-decoration: underline; }

        .tlogin-submit {
          width: 100%;
          padding: 13px;
          border: none;
          border-radius: 10px;
          background: linear-gradient(135deg, #24345C, #0F1A33);
          color: #F7F5EF;
          font-weight: 600;
          font-size: 15px;
          font-family: inherit;
          cursor: pointer;
          transition: transform .12s ease, box-shadow .12s ease, opacity .12s ease;
        }
        .tlogin-submit:hover { box-shadow: 0 10px 26px -10px rgba(15, 26, 51, 0.55); }
        .tlogin-submit:active { transform: translateY(1px); }
        .tlogin-submit:disabled { opacity: 0.65; cursor: default; }
        .tlogin-submit:focus-visible { outline: 2px solid #C99A3B; outline-offset: 2px; }

        .tlogin-hint {
          margin-top: 22px;
          padding: 14px 16px;
          border-radius: 12px;
          background: #F6F4EF;
          border: 1px solid #E7E2D6;
        }

        .tlogin-hint-head {
          font-weight: 600;
          font-size: 13px;
          color: #17223F;
          margin-bottom: 8px;
        }
        .tlogin-hint-head span { color: #8A8266; font-weight: 400; margin-left: 4px; }

        .tlogin-hint-rows {
          display: grid;
          gap: 4px;
        }
        .tlogin-hint-rows div {
          display: flex;
          justify-content: space-between;
          font-size: 12.5px;
        }
        .tlogin-hint-rows span { color: #8B92A3; }
        .tlogin-hint-rows b { color: #3A4256; font-weight: 600; }

        .tlogin-copy {
          text-align: center;
          color: #B6B2A4;
          font-size: 11px;
          margin: 20px 0 0;
        }

        /* ---------- Mobile ---------- */
        @media (max-width: 860px) {
          .tlogin-hero {
            padding: 40px 28px 88px;
            min-height: 0;
            flex-basis: auto;
          }
          .tlogin-title { font-size: 32px; }
          .tlogin-desc { display: none; }
          .tlogin-badge-art {
            width: 190px;
            height: 240px;
            right: -30px;
            bottom: -60px;
            opacity: 0.55;
          }
          .tlogin-form-side { padding: 28px 18px 40px; }
          .tlogin-card { border-radius: 18px; }
        }

        @media (max-width: 360px) {
          .tlogin-card { padding: 32px 20px 24px; }
        }
      `}</style>
    </div>
  );
}
