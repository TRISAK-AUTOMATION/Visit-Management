// client/src/components/ProtectedRoute.jsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

// roles: array ของ role ที่อนุญาต ถ้าไม่ระบุ = ทุก role ที่ login แล้วเข้าได้
export default function ProtectedRoute({ children, roles }) {
  const { me } = useAuth();

  if (me === undefined) {
    return <div className="muted" style={{ padding: 40 }}>กำลังโหลด...</div>;
  }
  if (me === null) {
    return <Navigate to="/login" replace />;
  }
  if (roles && !roles.includes(me.role)) {
    return <div className="empty">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</div>;
  }
  return children;
}
