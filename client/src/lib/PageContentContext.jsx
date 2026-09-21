// client/src/lib/PageContentContext.jsx - ข้อความ (title ฯลฯ) ของแต่ละหน้าที่ Admin แก้ไขได้จาก Settings > จัดการหน้า/หัวข้อ
// โหลดครั้งเดียวตอนเข้าแอป แล้วแจกจ่ายให้ทุกหน้าใช้ผ่าน usePageContent()
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api';

const PageContentContext = createContext(null);

export function PageContentProvider({ children }) {
  const [content, setContent] = useState({}); // { key: value }

  const reload = useCallback(async () => {
    try {
      const r = await api.get('/api/page-content');
      setContent(r.content || {});
    } catch (e) { /* ยังไม่ login หรือโหลดไม่สำเร็จ - ใช้ fallback ของแต่ละหน้าแทน */ }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // pc('dashboard.title', 'Dashboard') -> คืนค่าที่ Admin ตั้งไว้ ถ้าไม่มี/ยังไม่โหลดเสร็จ ใช้ fallback แทน
  const pc = (key, fallback) => (content[key] !== undefined ? content[key] : fallback);

  return (
    <PageContentContext.Provider value={{ pc, reload }}>
      {children}
    </PageContentContext.Provider>
  );
}

export function usePageContent() {
  return useContext(PageContentContext);
}
