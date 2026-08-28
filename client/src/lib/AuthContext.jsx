// client/src/lib/AuthContext.jsx
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [me, setMe] = useState(undefined); // undefined = กำลังโหลด, null = ไม่ได้ login, object = user
  const [badgeCounts, setBadgeCounts] = useState({ pending: 0, unread: 0 });

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
    const counts = { pending: 0, unread: 0 };
    try {
      if (user && user.role !== 'Employee') {
        const pend = await api.get('/api/visit-requests?scope=pending&status=pending');
        counts.pending = pend.requests.length;
      }
      const notif = await api.get('/api/notifications');
      counts.unread = notif.unread;
    } catch (e) { /* ignore */ }
    setBadgeCounts(counts);
  }, []);

  useEffect(() => { refreshMe(); }, [refreshMe]);
  useEffect(() => { if (me) refreshBadges(me); }, [me, refreshBadges]);

  const login = async (username, password) => {
    await api.post('/api/auth/login', { username, password });
    const user = await refreshMe();
    return user;
  };

  const logout = async () => {
    await api.post('/api/auth/logout');
    setMe(null);
  };

  return (
    <AuthContext.Provider value={{ me, setMe, badgeCounts, refreshBadges: () => refreshBadges(me), login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
