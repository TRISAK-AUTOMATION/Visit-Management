// client/src/components/TimeInput24.jsx
// ตัวเลือกเวลาแบบ 24 ชม. ล้วนๆ (ชม. 00-23 / นาที 00-59) ไม่มี AM/PM ให้เลือกแน่นอน
// สร้างขึ้นแทน <input type="time"> เพราะ input เวลาแบบ native ของเบราว์เซอร์
// จะโชว์เป็น 12 ชม. + AM/PM หรือ 24 ชม. ขึ้นอยู่กับภาษา/locale ของเครื่องผู้ใช้แต่ละคน
// ควบคุมจาก HTML ไม่ได้ ต้องทำ picker เองถึงจะการันตีว่าเป็น 24 ชม. เสมอทุกเครื่อง
// ค่า value / รูปแบบที่ยิงกลับผ่าน onChange ยังเป็น string "HH:MM" เหมือนเดิมทุกประการ
// (ส่ง event ปลอม { target: { value } } กลับไป) เพื่อให้ใช้แทน input เดิมได้โดยไม่ต้องแก้ตัว handler อื่น
import React from 'react';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export default function TimeInput24({ value, onChange, required, style }) {
  const [h = '', m = ''] = (value || '').split(':');

  const emit = (newH, newM) => {
    if (!newH || !newM) { onChange({ target: { value: '' } }); return; }
    onChange({ target: { value: `${newH}:${newM}` } });
  };

  const selectStyle = { padding: '9px 8px', border: '1px solid var(--border)', borderRadius: 9, background: '#fff' };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, ...style }}>
      <select value={h} onChange={(e) => emit(e.target.value, m || '00')} required={required} style={selectStyle}>
        <option value="">ชม.</option>
        {HOURS.map(hh => <option key={hh} value={hh}>{hh}</option>)}
      </select>
      <span className="muted">:</span>
      <select value={m} onChange={(e) => emit(h || '00', e.target.value)} required={required} style={selectStyle}>
        <option value="">นาที</option>
        {MINUTES.map(mm => <option key={mm} value={mm}>{mm}</option>)}
      </select>
      <span className="muted" style={{ fontSize: 11 }}>น. (24 ชม.)</span>
    </div>
  );
}
