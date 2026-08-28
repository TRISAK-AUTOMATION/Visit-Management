// client/src/pages/Login.jsx - เทียบเท่า public/login.html
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

  if (me) return <Navigate to="/dashboard" replace />; // ถ้าเข้าสู่ระบบแล้ว ไปหน้า dashboard ทันที

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(username.trim(), password);
      navigate('/dashboard');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-hero">
        <div className="content">
          <div className="brand-mark" style={{ width: 56, height: 56, fontSize: 24, marginBottom: 20 }}>T</div>
          <h1>TRISAK</h1>
          <p>Visit Management System</p>
          <p style={{ marginTop: 30, maxWidth: 380, color: '#c3cdec', lineHeight: 1.7 }}>
            ระบบบริหารจัดการคำขอออกนอกสถานที่ ครบวงจร ตั้งแต่สร้างคำขอ อนุมัติผ่านอีเมล
            ไปจนถึงติดตามผลและออกรายงาน
          </p>
        </div>
      </div>
      <div className="login-form-side">
        <div className="login-box">
          <h2>เข้าสู่ระบบ</h2>
          <p className="sub">กรุณากรอกข้อมูลเพื่อเข้าสู่ระบบ</p>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Username</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="กรอกชื่อผู้ใช้" required />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="กรอกรหัสผ่าน" required />
            </div>
            <div className="login-remember">
              <label className="flex gap-8"><input type="checkbox" /> จำฉันไว้ในระบบ</label>
              <a href="#" style={{ color: 'var(--blue-600)', fontWeight: 600 }}>ลืมรหัสผ่าน?</a>
            </div>
            <button type="submit" className="btn btn-primary">เข้าสู่ระบบ</button>
          </form>
          <div className="login-hint">
            <b>บัญชีทดสอบ</b> (รหัสผ่าน: 123456)<br />
            พนักงาน: anuphong · ผู้อนุมัติ: somchai · ผู้ดูแลระบบ: patcharin
          </div>
          <p style={{ textAlign: 'center', color: 'var(--text-400)', fontSize: 11.5, marginTop: 22 }}>© 2026 TRISAK. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
