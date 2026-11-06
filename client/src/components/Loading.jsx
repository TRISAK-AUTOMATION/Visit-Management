// components/Loading.jsx - สัญลักษณ์ "กำลังโหลด" (เฟืองหมุน) ใช้แทนข้อความนิ่ง ๆ ตามหน้า/การ์ดที่รอข้อมูล
import React from 'react';

export default function Loading({ label = 'กำลังโหลดข้อมูล…', full = false, small = false }) {
  return (
    <div className={`ld-box ${full ? 'full' : ''} ${small ? 'small' : ''}`} role="status" aria-live="polite" aria-busy="true">
      <svg className="ld-gear" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm9 4.2v-1.4l-2.1-.5a7 7 0 0 0-.7-1.7l1.1-1.9-1-1-1.9 1.1a7 7 0 0 0-1.7-.7L14.2 3h-1.4l-.5 2.1a7 7 0 0 0-1.7.7L8.7 4.7l-1 1 1.1 1.9c-.3.5-.5 1.1-.7 1.7L6 9.8v1.4l2.1.5c.1.6.4 1.2.7 1.7l-1.1 1.9 1 1 1.9-1.1c.5.3 1.1.6 1.7.7l.5 2.1h1.4l.5-2.1c.6-.1 1.2-.4 1.7-.7l1.9 1.1 1-1-1.1-1.9c.3-.5.6-1.1.7-1.7z" fill="currentColor" /></svg>
      <span>{label}</span>
    </div>
  );
}
