// components/GlobalLoading.jsx - แถบโหลดด้านบน + ป้าย "กำลังโหลดข้อมูล" เมื่อมี API ที่ใช้เวลานาน
// ทำงานอัตโนมัติกับทุกหน้า (ดักที่ lib/api.js) — คำขอที่เสร็จเร็วกว่า 0.35 วินาที (เช่นการเช็กแจ้งเตือนเบื้องหลัง) จะไม่กะพริบให้เห็น
import React, { useEffect, useState } from 'react';
import { loadingBus } from '../lib/loadingBus';

const SHOW_AFTER = 350;  // ms ก่อนแสดงแถบ
const PILL_AFTER = 1500; // ms ก่อนแสดงป้ายข้อความ
const MIN_SHOW = 350;    // ms แสดงอย่างน้อยเท่านี้เมื่อเริ่มแสดงแล้ว กันกะพริบ

export default function GlobalLoading() {
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let showT = null, pillT = null, hideT = null, shownAt = 0;
    const off = loadingBus.subscribe((n) => {
      if (n > 0) {
        clearTimeout(hideT); hideT = null;
        if (!showT && !shownAt) {
          showT = setTimeout(() => { showT = null; shownAt = Date.now(); setBusy(true); }, SHOW_AFTER);
        }
        if (!pillT) pillT = setTimeout(() => setSlow(true), PILL_AFTER);
      } else {
        clearTimeout(showT); showT = null;
        clearTimeout(pillT); pillT = null;
        if (shownAt) {
          hideT = setTimeout(() => { shownAt = 0; setBusy(false); setSlow(false); }, Math.max(0, MIN_SHOW - (Date.now() - shownAt)));
        } else { setSlow(false); }
      }
    });
    return () => { off(); clearTimeout(showT); clearTimeout(pillT); clearTimeout(hideT); };
  }, []);

  if (!busy) return null;
  return (
    <>
      <div className="gl-bar" role="progressbar" aria-busy="true" aria-label="กำลังโหลด"><i /></div>
      {slow && (
        <div className="gl-pill" role="status" aria-live="polite">
          <svg className="gl-gear" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm9 4.2v-1.4l-2.1-.5a7 7 0 0 0-.7-1.7l1.1-1.9-1-1-1.9 1.1a7 7 0 0 0-1.7-.7L14.2 3h-1.4l-.5 2.1a7 7 0 0 0-1.7.7L8.7 4.7l-1 1 1.1 1.9c-.3.5-.5 1.1-.7 1.7L6 9.8v1.4l2.1.5c.1.6.4 1.2.7 1.7l-1.1 1.9 1 1 1.9-1.1c.5.3 1.1.6 1.7.7l.5 2.1h1.4l.5-2.1c.6-.1 1.2-.4 1.7-.7l1.9 1.1 1-1-1.1-1.9c.3-.5.6-1.1.7-1.7z" fill="currentColor" /></svg>
          กำลังโหลดข้อมูล… กรุณารอสักครู่
        </div>
      )}
    </>
  );
}
