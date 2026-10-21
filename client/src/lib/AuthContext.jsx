// client/src/lib/AuthContext.jsx
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, canAccessVisit } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [me, setMe] = useState(undefined); // undefined = กำลังโหลด, null = ไม่ได้ login, object = user
  const [badgeCounts, setBadgeCounts] = useState({ pending: 0, unread: 0, pendingLeave: 0, pendingOT: 0 });

  // จำนวนคำขอ Visit ของฉันแยกตามขั้นตอน (ฉบับร่าง/รออนุมัติ/รอแก้ไข/อนุมัติแล้ว/ไม่อนุมัติ) สำหรับเมนูข้างซ้าย
  const refreshMyVisit = useCallback(async (user) => {
    if (!user || !canAccessVisit(user)) return;
    try {
      const { counts } = await api.get('/api/visit-requests/my-status-counts');
      setBadgeCounts(prev => ({ ...prev, vDraft: counts.draft, vPending: counts.pending, vRevision: counts.revision, vApproved: counts.approved, vCompleted: counts.completed, vRejected: counts.rejected }));
    } catch (e) { /* ignore */ }
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const r = await api.get('/api/auth/me');
      setMe(r.user);
      return r.user;
    } catch (e) {
      setMe(null);
      return null;
    }
  }, []);

  const refreshBadges = useCallback(async (user) => {
    const counts = { pending: 0, unread: 0, pendingLeave: 0, pendingOT: 0 };
    try {
      if (user && (user.role !== 'Employee' || user.can_approve)) {
        const pend = await api.get('/api/visit-requests?scope=pending&status=pending');
        counts.pending = pend.requests.filter(r => r.can_act !== false).length; // นับเฉพาะใบที่ "รอคุณอนุมัติ" จริง
        const pendOT = await api.get('/api/ot-requests?scope=pending&status=pending');
        counts.pendingOT = pendOT.requests.filter(r => r.can_act !== false).length;
      }
      // แยกเงื่อนไขจาก visit/OT เพราะ leave ใช้ can_approve_leave (Admin อาจตั้งพนักงาน role Employee เป็นผู้อนุมัติผ่าน Template ได้)
      if (user && (user.role !== 'Employee' || user.can_approve_leave)) {
        const pendLeave = await api.get('/api/leave-requests?scope=pending&status=pending');
        counts.pendingLeave = pendLeave.requests.filter(r => r.can_act !== false).length;
      }
      const notif = await api.get('/api/notifications');
      counts.unread = notif.unread;
    } catch (e) { /* ignore */ }
    setBadgeCounts(prev => ({ ...prev, ...counts }));
  }, []);

  useEffect(() => { refreshMe(); }, [refreshMe]);
  useEffect(() => { if (me) { refreshBadges(me); refreshMyVisit(me); } }, [me, refreshBadges, refreshMyVisit]);

  // รีเฟรชตัวเลขแจ้งเตือนอัตโนมัติ: ทุก 30 วินาที และเมื่อกลับมาที่แท็บ/หน้าต่างนี้ (เฉพาะตอนแท็บมองเห็นอยู่)
  useEffect(() => {
    if (!me) return undefined;
    const tick = () => { if (document.visibilityState === 'visible') refreshBadges(me); };
    const timer = setInterval(tick, 30000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick); };
  }, [me, refreshBadges]);

  const login = async (username, password, remember = false) => {
    await api.post('/api/auth/login', { username, password, remember });
    const user = await refreshMe();
    return user;
  };

  const logout = async () => {
    await api.post('/api/auth/logout');
    setMe(null);
  };

  return (
    <AuthContext.Provider value={{ me, setMe, badgeCounts, refreshBadges: () => refreshBadges(me), refreshMyVisit: () => refreshMyVisit(me), login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
