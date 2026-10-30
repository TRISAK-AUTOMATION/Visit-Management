// client/src/components/ProtectedRoute.jsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

// roles: array ของ role ที่อนุญาต ถ้าไม่ระบุ = ทุก role ที่ login แล้วเข้าได้
// check: ฟังก์ชันตรวจสิทธิ์แบบกำหนดเอง รับ me แล้วคืน true/false (ใช้กรณีเงื่อนไขซับซ้อนกว่าแค่ role เช่น ต้องดูแผนกด้วย)
export default function ProtectedRoute({ children, roles, check, message }) {
  const { me } = useAuth();
  const location = useLocation();

  if (me === undefined) {
    return <div className="muted" style={{ padding: 40 }}>กำลังโหลด...</div>;
  }
  if (me === null) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (roles && !roles.includes(me.role)) {
    return <div className="empty">{message || 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้'}</div>;
  }
  if (check && !check(me)) {
    return <div className="empty">{message || 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้'}</div>;
  }
  return children;
}
