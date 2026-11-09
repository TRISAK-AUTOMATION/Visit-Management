// client/src/components/WaitTurn.jsx - สถานะ "ยังไม่ถึงคิวคุณ" ในหน้าอนุมัติ Visit / OT / ลา
// ผู้อนุมัติขั้นถัดไปเห็นคำขอ (และได้แจ้งเตือน) ตั้งแต่ผู้ขอกดส่ง แต่ยังอนุมัติไม่ได้จนกว่าขั้นก่อนหน้า (หัวหน้า/ผู้ตรวจสอบ) อนุมัติ
// r = แถวจาก ?scope=pending หรือข้อมูลรายละเอียด (GET /:id) — ใช้ r.upcoming, r.waiting_for
import React from 'react';

// ป้ายในตาราง (แทนปุ่มอนุมัติ เมื่อยังกดไม่ได้)
export function WaitChip({ r }) {
  const who = r.waiting_for || 'ผู้อนุมัติ';
  if (r.upcoming) {
    return (
      <span className="wait-chip" title={`คุณเป็นผู้อนุมัติขั้นถัดไป — ต้องรอ ${who} อนุมัติก่อน แล้วระบบจะแจ้งเตือนเมื่อถึงคิวคุณ`}>
        ⏳ รอ {who} อนุมัติก่อน
      </span>
    );
  }
  return <span className="muted" style={{ fontSize: 12.5 }}>รอ {who} อนุมัติ</span>;
}

// ข้อความในหน้าต่างรายละเอียด (แทนปุ่มอนุมัติ) — children = ปุ่มรีเซ็ตสายอนุมัติของ Admin (ถ้ามี)
export function WaitBanner({ r, flush = false, children }) {
  const who = r.waiting_for || 'ขั้นก่อนหน้า';
  return (
    <div className={`wait-banner ${r.upcoming ? 'is-next' : ''} ${flush ? 'flush' : ''}`}>
      {r.upcoming
        ? <>⏳ <b>ยังไม่ถึงคิวคุณ</b> — คำขอนี้ต้องให้ <b>{who}</b> อนุมัติก่อน แล้วคุณจึงอนุมัติต่อได้ ระบบจะแจ้งเตือนอีกครั้งเมื่อถึงคิวคุณ</>
        : <>คุณไม่ได้อยู่ในลำดับผู้อนุมัติของคำขอนี้ในขั้นตอนปัจจุบัน จึงอนุมัติไม่ได้ (ดูรายละเอียดได้อย่างเดียว){r.waiting_for ? <> — ตอนนี้รอ {r.waiting_for}</> : null}</>}
      {children}
    </div>
  );
}
